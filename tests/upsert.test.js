import knexLib from "knex";
import * as fs from "fs";
import { generateConfig } from "./helpers.js";

describe("Upsert (UPDATE OR INSERT)", () => {
  let knex;
  const knexConfig = generateConfig();

  beforeAll(async () => {
    knex = knexLib(knexConfig);

    await knex.schema.createTable("products", (table) => {
      table.integer("id").primary();
      table.string("sku", 50).notNullable().unique();
      table.string("name", 100).notNullable();
      table.integer("stock").defaultTo(0);
    });

    // Seed one existing product (explicit id since increments has no auto-generate)
    await knex("products").insert({ id: 1, sku: "EXISTING-001", name: "Existing Product", stock: 5 });
  });

  afterAll(async () => {
    await knex.schema.dropTableIfExists("products");
    await knex.destroy();
    await fs.promises.unlink(knexConfig.connection.database).catch(() => {});
  });

  it("inserts a new record when no match exists (via primary key)", async () => {
    await knex("products").upsert({ id: 2, sku: "NEW-001", name: "New Product", stock: 10 });
    const row = await knex("products").where({ id: 2 }).first();
    expect(row).toMatchObject({ id: 2, sku: "NEW-001", name: "New Product", stock: 10 });
  });

  it("updates an existing record when a match is found (via primary key)", async () => {
    await knex("products").upsert({ id: 2, sku: "NEW-001", name: "Updated Product", stock: 99 });
    const row = await knex("products").where({ id: 2 }).first();
    expect(row).toMatchObject({ name: "Updated Product", stock: 99 });
  });

  it("uses MATCHING clause to determine insert vs. update", async () => {
    await knex("products").upsert(
      { id: 1, sku: "EXISTING-001", name: "Updated via MATCHING", stock: 42 },
      undefined,
      { matching: "sku" },
    );
    const row = await knex("products").where({ id: 1 }).first();
    expect(row).toMatchObject({ name: "Updated via MATCHING", stock: 42 });
  });

  it("returns a single column via RETURNING", async () => {
    const result = await knex("products")
      .upsert({ id: 3, sku: "RETURN-001", name: "Return Test", stock: 7 })
      .returning("id");

    expect(result).toStrictEqual([{ id: 3 }]);
  });

  it("returns multiple columns via RETURNING", async () => {
    const result = await knex("products")
      .upsert({ id: 4, sku: "RETURN-MULTI", name: "Multi Return", stock: 3 })
      .returning(["id", "sku"]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: 4, sku: "RETURN-MULTI" });
  });

  it("uses MATCHING with RETURNING", async () => {
    const result = await knex("products")
      .upsert(
        { id: 1, sku: "EXISTING-001", name: "Upsert with Returning", stock: 99 },
        ["id", "stock"],
        { matching: "sku" },
      );

    expect(result).toStrictEqual([{ id: 1, stock: 99 }]);
  });
});
