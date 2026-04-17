import knexLib from "knex";
import * as fs from "fs";
import { generateConfig } from "./helpers.js";

describe("hasTable / hasColumn", () => {
  let knex;
  const knexConfig = generateConfig();

  beforeAll(async () => {
    knex = knexLib(knexConfig);
    await knex.schema.createTable("ht_test", (table) => {
      table.increments("id").primary();
      table.string("name", 100).notNullable();
      table.integer("age").nullable();
    });
  });

  afterAll(async () => {
    await knex.schema.dropTableIfExists("ht_test");
    await knex.destroy();
    await fs.promises.unlink(knexConfig.connection.database).catch(() => {});
  });

  describe("hasTable", () => {
    it("returns true for an existing table", async () => {
      await expect(knex.schema.hasTable("ht_test")).resolves.toBe(true);
    });

    it("returns false for a non-existing table", async () => {
      await expect(knex.schema.hasTable("no_such_table")).resolves.toBe(false);
    });

    it("is case-insensitive (lowercase input)", async () => {
      await expect(knex.schema.hasTable("ht_test")).resolves.toBe(true);
    });

    it("is case-insensitive (uppercase input)", async () => {
      await expect(knex.schema.hasTable("HT_TEST")).resolves.toBe(true);
    });
  });

  describe("hasColumn", () => {
    it("returns true for an existing column", async () => {
      await expect(knex.schema.hasColumn("ht_test", "name")).resolves.toBe(
        true,
      );
    });

    it("returns true for a primary key column", async () => {
      await expect(knex.schema.hasColumn("ht_test", "id")).resolves.toBe(true);
    });

    it("returns true for a nullable column", async () => {
      await expect(knex.schema.hasColumn("ht_test", "age")).resolves.toBe(true);
    });

    it("returns false for a non-existing column", async () => {
      await expect(
        knex.schema.hasColumn("ht_test", "no_such_col"),
      ).resolves.toBe(false);
    });

    it("returns false when table does not exist", async () => {
      await expect(knex.schema.hasColumn("no_such_table", "id")).resolves.toBe(
        false,
      );
    });

    it("is case-insensitive for column name", async () => {
      await expect(knex.schema.hasColumn("ht_test", "NAME")).resolves.toBe(
        true,
      );
      await expect(knex.schema.hasColumn("ht_test", "Name")).resolves.toBe(
        true,
      );
    });

    it("is case-insensitive for table name", async () => {
      await expect(knex.schema.hasColumn("HT_TEST", "name")).resolves.toBe(
        true,
      );
    });

    it("throws when tableName is missing", async () => {
      await expect(knex.schema.hasColumn(null, "name")).rejects.toThrow(
        "hasColumn requires both tableName and column arguments",
      );
    });

    it("throws when column is missing", async () => {
      await expect(knex.schema.hasColumn("ht_test", null)).rejects.toThrow(
        "hasColumn requires both tableName and column arguments",
      );
    });
  });
});
