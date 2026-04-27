import knexLib from "knex";
import * as fs from "fs";
import Transaction_Firebird from "../src/transaction.js";
import { generateConfig } from "./helpers.js";

// ---------------------------------------------------------------------------
// Unit tests – no database connection required
// ---------------------------------------------------------------------------

function makeTransaction(isolationLevel, readOnly = false) {
  const trx = Object.create(Transaction_Firebird.prototype);
  trx.isolationLevel = isolationLevel;
  trx.readOnly = readOnly;
  return trx;
}

function makeMockConn() {
  const fbTx = {
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
  };
  const conn = {
    startTransaction: jest.fn().mockResolvedValue(fbTx),
    _activeFbTransaction: null,
  };
  return { conn, fbTx };
}

async function captureIsolation(isolationLevel) {
  const trx = makeTransaction(isolationLevel);
  const { conn } = makeMockConn();
  await trx.begin(conn);
  return conn.startTransaction.mock.calls[0][0].isolation;
}

describe("Transaction_Firebird – isolation level mapping (unit)", () => {
  describe("default and standard levels", () => {
    it("uses SNAPSHOT as default when no isolationLevel is given", async () => {
      expect(await captureIsolation(undefined)).toBe("SNAPSHOT");
    });

    it("maps 'snapshot' to SNAPSHOT", async () => {
      expect(await captureIsolation("snapshot")).toBe("SNAPSHOT");
    });

    it("maps 'repeatable read' to SNAPSHOT", async () => {
      expect(await captureIsolation("repeatable read")).toBe("SNAPSHOT");
    });

    it("maps 'read committed' to READ_COMMITTED", async () => {
      expect(await captureIsolation("read committed")).toBe("READ_COMMITTED");
    });

    it("maps 'read uncommitted' to READ_COMMITTED (Firebird syntax synonym)", async () => {
      expect(await captureIsolation("read uncommitted")).toBe("READ_COMMITTED");
    });

    it("maps 'serializable' to CONSISTENCY", async () => {
      expect(await captureIsolation("serializable")).toBe("CONSISTENCY");
    });
  });

  describe("case-insensitivity", () => {
    it("accepts uppercase input", async () => {
      expect(await captureIsolation("SNAPSHOT")).toBe("SNAPSHOT");
      expect(await captureIsolation("READ COMMITTED")).toBe("READ_COMMITTED");
      expect(await captureIsolation("SERIALIZABLE")).toBe("CONSISTENCY");
    });

    it("accepts mixed-case input", async () => {
      expect(await captureIsolation("Snapshot")).toBe("SNAPSHOT");
      expect(await captureIsolation("Read Committed")).toBe("READ_COMMITTED");
      expect(await captureIsolation("Serializable")).toBe("CONSISTENCY");
    });

    it("trims surrounding whitespace", async () => {
      expect(await captureIsolation("  snapshot  ")).toBe("SNAPSHOT");
      expect(await captureIsolation(" read committed ")).toBe("READ_COMMITTED");
    });
  });

  describe("connection state after begin()", () => {
    it("sets _activeFbTransaction on the connection", async () => {
      const trx = makeTransaction(undefined);
      const { conn, fbTx } = makeMockConn();
      await trx.begin(conn);
      expect(conn._activeFbTransaction).toBe(fbTx);
    });

    it("stores the transaction on _transaction", async () => {
      const trx = makeTransaction(undefined);
      const { conn, fbTx } = makeMockConn();
      await trx.begin(conn);
      expect(trx._transaction).toBe(fbTx);
    });

    it("stores the connection on _conn", async () => {
      const trx = makeTransaction(undefined);
      const { conn } = makeMockConn();
      await trx.begin(conn);
      expect(trx._conn).toBe(conn);
    });
  });

  describe("access mode", () => {
    it("passes accessMode READ_ONLY when readOnly is true", async () => {
      const trx = makeTransaction(undefined, true);
      const { conn } = makeMockConn();
      await trx.begin(conn);
      expect(conn.startTransaction.mock.calls[0][0].accessMode).toBe("READ_ONLY");
    });

    it("omits accessMode when readOnly is false", async () => {
      const trx = makeTransaction(undefined, false);
      const { conn } = makeMockConn();
      await trx.begin(conn);
      expect(conn.startTransaction.mock.calls[0][0].accessMode).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Integration tests – require a running Firebird database
// ---------------------------------------------------------------------------

describe("Transaction_Firebird – isolation levels (integration)", () => {
  let knex;
  const knexConfig = generateConfig();

  beforeAll(async () => {
    knex = knexLib(knexConfig);
    // Simple table without autoincrement – Firebird needs explicit ids otherwise
    await knex.schema.createTable("trx_iso_test", (table) => {
      table.string("val", 100);
    });
  });

  afterAll(async () => {
    await knex.schema.dropTableIfExists("trx_iso_test").catch(() => {});
    await knex.destroy();
    await fs.promises.unlink(knexConfig.connection.database).catch(() => {});
  });

  const levels = [
    "snapshot",
    "repeatable read",
    "read committed",
    "read uncommitted",
    "serializable",
  ];

  // knex.transaction(fn, config) – container first, options second
  describe("commit with explicit isolation levels", () => {
    for (const level of levels) {
      it(`commits and persists data with isolationLevel '${level}'`, async () => {
        await knex.transaction(
          async (trx) => {
            await knex("trx_iso_test").transacting(trx).insert({ val: level });
          },
          { isolationLevel: level },
        );
        const rows = await knex("trx_iso_test").where({ val: level });
        expect(rows).toHaveLength(1);
        expect(rows[0].val).toBe(level);
      });
    }
  });

  it("commits with default isolation level (no option given)", async () => {
    await knex.transaction(async (trx) => {
      await knex("trx_iso_test").transacting(trx).insert({ val: "default" });
    });
    const rows = await knex("trx_iso_test").where({ val: "default" });
    expect(rows).toHaveLength(1);
  });

  it("rolls back on error – data is not persisted", async () => {
    const before = (await knex("trx_iso_test").count("* as count").first())
      .count;

    await expect(
      knex.transaction(
        async (trx) => {
          await knex("trx_iso_test")
            .transacting(trx)
            .insert({ val: "will-rollback" });
          throw new Error("forced rollback");
        },
        { isolationLevel: "snapshot" },
      ),
    ).rejects.toThrow("forced rollback");

    const after = (await knex("trx_iso_test").count("* as count").first())
      .count;
    expect(after).toBe(before);
  });

  it("explicit rollback – data is not persisted", async () => {
    const before = (await knex("trx_iso_test").count("* as count").first())
      .count;

    await knex.transaction(
      async (trx) => {
        await knex("trx_iso_test")
          .transacting(trx)
          .insert({ val: "explicit-rollback" });
        await trx.rollback();
      },
      { isolationLevel: "read committed" },
    );

    const after = (await knex("trx_iso_test").count("* as count").first())
      .count;
    expect(after).toBe(before);
  });
});
