import client from "../src";
import path from "path";
import os from "os";

export const generateConfig = () => ({
  client,
  connection: {
    host: "127.0.0.1",
    port: 3050,
    username: process.env.ISC_USER || "SYSDBA",
    password: process.env.ISC_PASSWORD || "masterkey",
    database: path.join(os.tmpdir(), `firebird-knex-dialect-${Date.now()}.fdb`),
    lowercase_keys: true,
  },
  pool: { min: 1, max: 1 },
  createDatabaseIfNotExists: true,
  debug: false,
  libraryPath: process.env.LIBRARY_PATH,
});
