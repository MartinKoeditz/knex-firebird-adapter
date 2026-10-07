import knexLib from "knex";
import * as fs from "fs";
import { generateConfig } from "./helpers.js";

const umlautText = "Dies ist ein Textblob mit Umlauten: ÄÖÜäöüß";
const emojiText = "Another text with emoji 🎉";
// Not valid UTF-8: would be corrupted by a toString("utf8") round trip.
const binaryData = Buffer.from([
  0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x80, 0xc3,
]);

describe("fetchAsString", () => {
  const knexConfig = generateConfig();
  const instances = [];
  let knex;

  const createKnex = (extraConfig) => {
    const instance = knexLib({ ...knexConfig, ...extraConfig });
    instances.push(instance);
    return instance;
  };

  beforeAll(async () => {
    knex = createKnex({});

    await knex.schema.createTable("articles", (table) => {
      table.increments("id").primary();
      table.string("title", 200);
      table.specificType("body", "BLOB SUB_TYPE TEXT");
      table.specificType("data", "BLOB SUB_TYPE 0");
    });

    // Firebird does not support multi-row inserts; BLOB parameters must be Buffers.
    await knex("articles").insert({
      id: 1,
      title: "Hello World",
      body: Buffer.from(umlautText),
      data: binaryData,
    });
    await knex("articles").insert({
      id: 2,
      title: "Second Article",
      body: Buffer.from(emojiText),
    });
  });

  afterAll(async () => {
    await knex.schema.dropTableIfExists("articles");
    await Promise.all(instances.map((instance) => instance.destroy()));
    await fs.promises.unlink(knexConfig.connection.database).catch(() => {});
  });

  it("returns text blobs as Buffer without fetchAsString", async () => {
    const [row] = await knex("articles").where({ id: 1 }).select("body");
    expect(Buffer.isBuffer(row.body)).toBe(true);
    expect(row.body.toString("utf8")).toBe(umlautText);
  });

  it.each([["textblob"], ["clob"], ["TEXTBLOB"], ["Clob"]])(
    "returns text blobs as string with fetchAsString: [%p]",
    async (type) => {
      const knexAsString = createKnex({ fetchAsString: [type] });
      const [row] = await knexAsString("articles")
        .where({ id: 1 })
        .select("body");
      expect(row.body).toBe(umlautText);
    },
  );

  it("returns multiple rows with Unicode and emoji as strings", async () => {
    const knexAsString = createKnex({ fetchAsString: ["textblob"] });
    const rows = await knexAsString("articles")
      .select("id", "body")
      .orderBy("id");
    expect(rows.map((row) => row.body)).toEqual([umlautText, emojiText]);
  });

  it("keeps binary blobs (SUB_TYPE 0) as Buffer", async () => {
    const knexAsString = createKnex({ fetchAsString: ["textblob"] });
    const [row] = await knexAsString("articles")
      .where({ id: 1 })
      .select("body", "data");
    expect(row.body).toBe(umlautText);
    expect(Buffer.isBuffer(row.data)).toBe(true);
    expect(row.data.equals(binaryData)).toBe(true);
  });

  it("ignores the removed connection.blobAsText option", async () => {
    const knexBlobAsText = createKnex({
      connection: { ...knexConfig.connection, blobAsText: true },
    });
    const [row] = await knexBlobAsText("articles")
      .where({ id: 1 })
      .select("body");
    expect(Buffer.isBuffer(row.body)).toBe(true);
  });

  it("warns about unsupported types and keeps the default representation", async () => {
    const warn = jest.fn();
    const knexUnsupported = createKnex({
      fetchAsString: ["text"],
      log: { warn },
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Unsupported fetchAsString type "text"'),
    );

    const [row] = await knexUnsupported("articles")
      .where({ id: 1 })
      .select("body");
    expect(Buffer.isBuffer(row.body)).toBe(true);
  });
});
