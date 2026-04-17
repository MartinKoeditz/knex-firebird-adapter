import knexLib from "knex";
import * as fs from "fs";
import { generateConfig } from "./helpers.js";

describe("DDL", () => {
  let knex;
  const tableName = "ddl";
  const knexConfig = generateConfig();

  beforeAll(async () => {
    knex = knexLib(knexConfig);
    await new Promise((resolve) => setTimeout(resolve, 400));
  });

  afterAll(async () => {
    await knex.destroy();
    await fs.promises.unlink(knexConfig.connection.database).catch(() => {});
  });

  it("Test connection", async () => {
    await knex.raw("SELECT 1 FROM RDB$DATABASE");
  });

  it("Create table", async () => {
    expect(await knex.schema.hasTable("ddl")).toBe(false);

    await knex.schema.createTable("ddl", function (table) {
      table.string("id").primary();
      table.string("col_a").nullable();
      table.integer("col_b").notNullable();
      table.integer("col_d").nullable();
    });

    expect(await knex.schema.hasTable("ddl")).toBe(true);
  });

  it("Rename table columns", async () => {
    const oldName = "col_d";
    const newName = "col_d_renamed";

    expect(await knex.schema.hasColumn(tableName, oldName)).toBe(true);
    expect(await knex.schema.hasColumn(tableName, newName)).toBe(false);

    await knex.schema
      .table(tableName, (table) => table.renameColumn(oldName, newName))
      .then();

    expect(await knex.schema.hasColumn(tableName, oldName)).toBe(false);
    expect(await knex.schema.hasColumn(tableName, newName)).toBe(true);

    await knex.schema
      .table(tableName, (table) => table.renameColumn(newName, oldName))
      .then();

    expect(await knex.schema.hasColumn(tableName, oldName)).toBe(true);
    expect(await knex.schema.hasColumn(tableName, newName)).toBe(false);
  });

  it("Create & Drop column", async () => {
    expect(await knex.schema.hasColumn(tableName, "tmp")).toBe(false);
    await knex.schema
      .alterTable(tableName, (table) => table.string("tmp").nullable())
      .then();
    expect(await knex.schema.hasColumn(tableName, "tmp")).toBe(true);
    await knex.schema
      .table(tableName, (table) => table.dropColumn("tmp"))
      .then();
    expect(await knex.schema.hasColumn(tableName, "tmp")).toBe(false);
  });
});
