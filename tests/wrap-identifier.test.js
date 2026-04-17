import knexLib from "knex";
import * as fs from "fs";
import Client_Firebird from "../src/index.js";
import { generateConfig } from "./helpers.js";

// ---------------------------------------------------------------------------
// Unit tests – no database connection required
// ---------------------------------------------------------------------------

describe("wrapIdentifierImpl – unit tests", () => {
  let client;

  beforeAll(() => {
    // Minimal config – no real connection is established.
    // 'client' must be provided so knex does not throw "Required configuration option 'client' is missing."
    client = new Client_Firebird({ client: Client_Firebird, connection: { database: "dummy.fdb" } });
  });

  it("wraps a plain identifier in double quotes", () => {
    expect(client.wrapIdentifierImpl("tablename")).toBe('"tablename"');
  });

  it("preserves lowercase letters (does not convert to uppercase)", () => {
    expect(client.wrapIdentifierImpl("user_name")).toBe('"user_name"');
  });

  it("preserves uppercase letters (does not convert to lowercase)", () => {
    expect(client.wrapIdentifierImpl("USER_NAME")).toBe('"USER_NAME"');
  });

  it("preserves mixed-case identifiers exactly as given", () => {
    expect(client.wrapIdentifierImpl("MixedCase")).toBe('"MixedCase"');
  });

  it("wraps identifiers containing special characters and spaces", () => {
    expect(client.wrapIdentifierImpl("my column")).toBe('"my column"');
  });

  it("returns '*' unchanged (wildcard must not be quoted)", () => {
    expect(client.wrapIdentifierImpl("*")).toBe("*");
  });

  it("does not double-wrap an already quoted identifier", () => {
    expect(client.wrapIdentifierImpl('"already_quoted"')).toBe(
      '"already_quoted"',
    );
  });

  it("wraps an identifier that has only a leading double quote", () => {
    expect(client.wrapIdentifierImpl('"half_quoted')).toBe(
      '""half_quoted"',
    );
  });

  it("wraps an identifier that has only a trailing double quote", () => {
    expect(client.wrapIdentifierImpl('half_quoted"')).toBe(
      '"half_quoted""',
    );
  });

  it("wraps an empty string in double quotes", () => {
    expect(client.wrapIdentifierImpl("")).toBe('""');
  });
});

// ---------------------------------------------------------------------------
// Integration tests – require a running Firebird database
// ---------------------------------------------------------------------------

describe("wrapIdentifier – case sensitivity in Firebird (integration)", () => {
  let knex;
  const knexConfig = generateConfig();

  beforeAll(async () => {
    knex = knexLib(knexConfig);
  });

  afterAll(async () => {
    await knex.schema.dropTableIfExists("tblCaseTest").catch(() => {});
    await knex.destroy();
    await fs.promises.unlink(knexConfig.connection.database).catch(() => {});
  });

  // Note: SchemaCompiler_Firebird.prototype.lowerCase = true causes knex to
  // lowercase all identifiers before wrapIdentifierImpl adds the double quotes.
  // As a result every column name is stored in lowercase in Firebird, regardless
  // of what casing was passed to the schema builder.

  it("column names are always stored as lowercase (schema compiler lowercases before quoting)", async () => {
    await knex.schema.createTable("tblCaseTest", (table) => {
      table.increments("id").primary();
      table.string("lower_col", 100).nullable();
      // "MixedCase" → lowercased by schema compiler → stored as "mixedcase"
      table.string("MixedCase", 100).nullable();
    });

    expect(await knex.schema.hasTable("tblCaseTest")).toBe(true);
    // exact lowercase names are found
    expect(await knex.schema.hasColumn("tblCaseTest", "lower_col")).toBe(true);
    expect(await knex.schema.hasColumn("tblCaseTest", "mixedcase")).toBe(true);
  });

  it("quoted identifiers are case-sensitive: uppercase lookup returns false", async () => {
    // All columns are stored lowercase → searching with uppercase finds nothing
    expect(await knex.schema.hasColumn("tblCaseTest", "LOWER_COL")).toBe(false);
    expect(await knex.schema.hasColumn("tblCaseTest", "MixedCase")).toBe(false);
    expect(await knex.schema.hasColumn("tblCaseTest", "MIXEDCASE")).toBe(false);
  });

  it("inserts and retrieves rows using the stored lowercase column names", async () => {
    await knex("tblCaseTest").insert({ id: 1, lower_col: "hello", mixedcase: "world" });

    const rows = await knex("tblCaseTest").select("lower_col", "mixedcase");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ lower_col: "hello", mixedcase: "world" });
  });

  it("column names are stored as lowercase in Firebird system tables", async () => {
    // Since the schema compiler lowercases identifiers and wrapIdentifierImpl
    // quotes them, Firebird stores the exact lowercase name in rdb$field_name.
    const result = await knex.raw(
      `SELECT RDB$FIELD_NAME FROM RDB$RELATION_FIELDS
       WHERE RDB$RELATION_NAME = 'tblCaseTest'
         AND TRIM(RDB$FIELD_NAME) = 'lower_col'`,
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
  });

  it("wrapIdentifier double-quotes identifiers in generated SQL", async () => {
    const query = knex("tblCaseTest").where("lower_col", "test").toSQL();
    expect(query.sql).toContain('"lower_col"');
    expect(query.sql).not.toMatch(/"LOWER_COL"/);
  });
});
