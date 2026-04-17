import knexLib from "knex";
import * as fs from "fs";
import { generateConfig } from "./helpers.js";

describe("SQL Injection", () => {
  let knex;
  const knexConfig = generateConfig();

  beforeAll(async () => {
    knex = knexLib(knexConfig);
    await knex.schema.createTable("sqli_test", (table) => {
      table.string("payload", 200).nullable();
    });
  });

  afterAll(async () => {
    await knex.schema.dropTableIfExists("sqli_test");
    await knex.destroy();
    await fs.promises.unlink(knexConfig.connection.database).catch(() => {});
  });

  describe("hasTable", () => {
    it("does not find a table when name contains SQL injection payload", async () => {
      await expect(knex.schema.hasTable("sqli_test' OR '1'='1")).resolves.toBe(
        false,
      );
    });

    it("does not find a table with UNION injection payload", async () => {
      await expect(
        knex.schema.hasTable("sqli_test' UNION SELECT 1 FROM RDB$DATABASE --"),
      ).resolves.toBe(false);
    });

    it("does not find a table with comment injection payload", async () => {
      await expect(knex.schema.hasTable("sqli_test'--")).resolves.toBe(false);
    });
  });

  describe("hasColumn", () => {
    it("does not find a column when name contains SQL injection payload", async () => {
      await expect(
        knex.schema.hasColumn("sqli_test", "id' OR '1'='1"),
      ).resolves.toBe(false);
    });

    it("does not find a column with UNION injection payload", async () => {
      await expect(
        knex.schema.hasColumn(
          "sqli_test",
          "id' UNION SELECT 1 FROM RDB$DATABASE --",
        ),
      ).resolves.toBe(false);
    });

    it("does not find a column when table name contains injection payload", async () => {
      await expect(
        knex.schema.hasColumn("sqli_test' OR '1'='1", "id"),
      ).resolves.toBe(false);
    });
  });

  describe("dropTableIfExists", () => {
    it("throws on invalid identifier with injection payload", async () => {
      await expect(
        knex.schema.dropTableIfExists("sqli_test; DROP TABLE sqli_test2 --"),
      ).rejects.toThrow("Invalid identifier");
    });

    it("throws on identifier with quote injection", async () => {
      await expect(
        knex.schema.dropTableIfExists("sqli_test' OR '1'='1"),
      ).rejects.toThrow("Invalid identifier");
    });
  });

  describe("data binding (insert/select)", () => {
    it("stores and retrieves SQL injection string as plain data", async () => {
      const injected = "'; DROP TABLE sqli_test; --";
      await knex("sqli_test").insert({ payload: injected });
      const rows = await knex("sqli_test")
        .where({ payload: injected })
        .select("payload");
      expect(rows).toHaveLength(1);
      expect(rows[0].payload).toBe(injected);
    });

    it("does not return rows for injected WHERE condition", async () => {
      const rows = await knex("sqli_test")
        .where("payload", "nonexistent' OR '1'='1")
        .select("payload");
      expect(rows).toHaveLength(0);
    });
  });
});
