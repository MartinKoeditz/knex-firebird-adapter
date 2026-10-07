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

    await knex.raw(
      `create table "values" (
        "id" integer not null primary key,
        "i" integer, "b" bigint, "n" numeric(18,4), "f" double precision,
        "d" date, "ts" timestamp, "tm" time,
        "tstz" timestamp with time zone, "tmtz" time with time zone,
        "body" blob sub_type text)`,
    );
    await knex.raw(
      `insert into "values" values (1, ?, ?, ?, ?, ?, ?, ?,
        timestamp '2026-10-07 13:00:00.500 Europe/Berlin',
        time '08:05:00 Europe/Berlin', ?)`,
      [
        42,
        123,
        12345.6789,
        1.5,
        new Date(2026, 9, 7),
        new Date(2026, 9, 7, 13, 45, 30, 123),
        new Date(2026, 9, 7, 8, 5, 0),
        Buffer.from(umlautText),
      ],
    );
    await knex.raw(`insert into "values" ("id", "body") values (2, null)`);
  });

  afterAll(async () => {
    await knex.schema.dropTableIfExists("articles");
    await knex.schema.dropTableIfExists("values");
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

  it("warns about the removed connection.blobAsText option and ignores it", async () => {
    const warn = jest.fn();
    const knexBlobAsText = createKnex({
      connection: { ...knexConfig.connection, blobAsText: true },
      log: { warn },
    });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("connection.blobAsText was removed in 2.0.0"),
    );

    const [row] = await knexBlobAsText("articles")
      .where({ id: 1 })
      .select("body");
    expect(Buffer.isBuffer(row.body)).toBe(true);
  });

  it("does not warn without blobAsText and with a supported type", () => {
    const warn = jest.fn();
    createKnex({ fetchAsString: ["textblob"], log: { warn } });
    expect(warn).not.toHaveBeenCalled();
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

  describe("number and date", () => {
    const selectRow = (instance, id = 1) =>
      instance("values").where({ id }).first();

    it("returns native values without fetchAsString", async () => {
      const row = await selectRow(knex);
      expect(row.i).toBe(42);
      expect(row.n).toBe(12345.6789);
      expect(row.d).toBeInstanceOf(Date);
      expect(row.ts).toBeInstanceOf(Date);
      expect(row.tstz).toEqual(
        expect.objectContaining({ timeZone: "Europe/Berlin" }),
      );
    });

    it("returns numeric columns as strings with fetchAsString: ['number']", async () => {
      const row = await selectRow(createKnex({ fetchAsString: ["number"] }));
      expect(row).toEqual(
        expect.objectContaining({
          id: "1",
          i: "42",
          b: "123",
          n: "12345.6789",
          f: "1.5",
        }),
      );
      expect(row.ts).toBeInstanceOf(Date);
      expect(Buffer.isBuffer(row.body)).toBe(true);
    });

    it("returns date/time columns as strings with fetchAsString: ['date']", async () => {
      const row = await selectRow(createKnex({ fetchAsString: ["DATE"] }));
      expect(row).toEqual(
        expect.objectContaining({
          d: "2026-10-07",
          ts: "2026-10-07 13:45:30.123",
          tm: "08:05:00.000",
          tstz: "2026-10-07 13:00:00.500 Europe/Berlin",
          tmtz: "08:05:00.000 Europe/Berlin",
        }),
      );
      expect(row.i).toBe(42);
    });

    it("supports an Oracle-style configuration and keeps nulls", async () => {
      const knexOracleStyle = createKnex({
        fetchAsString: ["number", "date", "clob"],
      });
      const row = await selectRow(knexOracleStyle);
      expect(row.n).toBe("12345.6789");
      expect(row.d).toBe("2026-10-07");
      expect(row.body).toBe(umlautText);

      const emptyRow = await selectRow(knexOracleStyle, 2);
      expect(emptyRow.i).toBeNull();
      expect(emptyRow.d).toBeNull();
      expect(emptyRow.body).toBeNull();
    });

    it("warns about Oracle's unsupported 'buffer' type", () => {
      const warn = jest.fn();
      createKnex({ fetchAsString: ["number", "buffer"], log: { warn } });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Unsupported fetchAsString type "buffer"'),
      );
    });
  });
});
