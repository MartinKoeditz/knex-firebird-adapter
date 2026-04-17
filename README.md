# 👾 knex-firebird-adapter

Note: This is a fork of https://codecov.io/gh/Tomas2D/knex-firebird-dialect/.

This library provides a Firebird dialect (client) for [Knex.js](https://github.com/knex/knex), a SQL query builder.

It continues the work of previous, unmaintained libraries and is based on [igorklopov/firebird-knex](https://github.com/igorklopov/firebird-knex).
Under the hood it can use the `node-firebird-driver-native` driver. If that driver is not suitable for your environment, consider using a compatible 1.x release of this package which works with the older [node-firebird](https://github.com/hgourvest/node-firebird) driver.

If you find this fork useful, a ⭐️ is appreciated.

## Installation

Install from npm if published, or use one of the local installation methods shown below for development.

## 🚀 Usage

Basic setup example (ESM):

```javascript
import knexLib from "knex";
import knexFirebirdAdapter from "knex-firebird-adapter"; // or your local package name

const knex = knexLib({
  client: knexFirebirdAdapter, // required – always pass the adapter class here
  connection: {
    host: "127.0.0.1",
    port: 3050,
    user: "SYSDBA",
    password: "masterkey",
    database: '/tmp/database.fdb',
  },
  createDatabaseIfNotExists: true,
  debug: false,
});

export default knex;
```

CommonJS example (require):

```javascript
const knexLib = require('knex');
const knexFirebirdAdapter = require('knex-firebird-adapter').default;

const knex = knexLib({ client: knexFirebirdAdapter, connection: {/*...*/} });
```

> **Important:** The `client` option is required. Omitting it will throw
> `Required configuration option 'client' is missing.`

## Identifier case sensitivity

All identifiers (table and column names) are wrapped in double quotes by this
adapter. Firebird therefore treats them as **case-sensitive**.

### Schema builder (lowercase by default)

The schema compiler lowercases every identifier before quoting it. Identifiers
passed to the schema builder are always stored in **lowercase**, regardless of
the casing you provide:

```javascript
await knex.schema.createTable("my_table", (table) => {
  table.string("lower_col");
  table.string("MixedCase"); // stored as "mixedcase"
});

await knex.schema.hasColumn("my_table", "lower_col");  // true
await knex.schema.hasColumn("my_table", "MixedCase");  // false – stored as "mixedcase"
await knex.schema.hasColumn("my_table", "mixedcase");  // true
```

### Preserve exact casing with `wrapIdentifier`

To keep the original casing (e.g. `tblFooBar`, `myField`), pass a
`wrapIdentifier` function in the knex config. It receives the raw identifier
value and must return the final quoted string.

```javascript
const knex = knexLib({
  client: knexFirebirdAdapter,
  connection: { /* ... */ },
  // Skip lowercasing – wrap the value as-is in double quotes
  wrapIdentifier: (value, origWrap) => origWrap(value),
});
```

With this config, identifiers keep their original casing and the schema builder
no longer lowercases them:

```javascript
await knex.schema.createTable("tblFooBar", (table) => {
  table.increments("id");
  table.string("myField", 100);
});

// Exact casing is required for every access
await knex.schema.hasTable("tblFooBar");              // true
await knex.schema.hasTable("tblfoobar");              // false
await knex.schema.hasColumn("tblFooBar", "myField");  // true
await knex.schema.hasColumn("tblFooBar", "myfield");  // false

await knex("tblFooBar").insert({ id: 1, myField: "hello" });
const rows = await knex("tblFooBar").select("myField");
// rows[0].myField === "hello"  (or rows[0].myfield with lowercase_keys: true)
```

> **Note:** When `lowercase_keys: true` is set in the connection config,
> Firebird returns column names in lowercase regardless of their stored casing.
> Use `lowercase_keys: false` if you need the original casing in query results.

### Mixed-case identifiers via raw SQL

Alternatively, create mixed-case objects with `knex.raw()` using explicit
double quotes — without needing to configure `wrapIdentifier`:

```javascript
await knex.raw(`CREATE TABLE "tblFooBar" ("myField" VARCHAR(100))`);
```

## Using the module locally

If you want to use this fork locally from another project, you have a few options:

1) Local file install (quick, no global linking):

```bash
# from your project directory
npm install --save ../path/to/knex-firebird-adapter
```

Or add to your project's `package.json`:

```json
"dependencies": {
  "knex-firebird-adapter": "file:../knex-firebird-adapter"
}
```

2) `npm link` (handy during development):

```bash
# in the fork repository
cd /path/to/knex-firebird-adapter
npm install
npm link

# in the target project
cd /path/to/your-project
npm link knex-firebird-adapter
```

3) Direct relative import for quick experiments or tests:

```javascript
const knexFirebirdAdapter = require('../knex-firebird-adapter').default;
```

Choose the method that fits your workflow.

## Tests

Quick guide to run tests in this repository:

1. Install dependencies:

```bash
npm install
```

2. Run the test suite:

```bash
npm test
# or directly with jest
npx jest
```

Run a single test file:

```bash
npx jest tests/basic-operations.test.js
```

See the `tests` folder for more examples and integration tests.

## Publishing to npm

Before publishing, update `package.json` fields `name`, `repository` and `homepage` to point to your GitHub repository and bump the `version` accordingly. Ensure the package builds (`npm run build`) and that `lib` is included in the `files` field.

1. Login to npm (if not already):

```bash
npm login
```

2. Build and publish:

```bash
npm run build
npm publish --access public
```

3. Tag and push the release:

```bash
git tag v<version>
git push origin --tags
```

Notes:
- The `publishConfig.access` field is set to `public` in `package.json` to allow public publishing.
- For a scoped package (e.g. `@your-org/knex-firebird-adapter`) adjust `name` and access as needed.

---

For more information and examples, browse the `tests` folder and the source files.
