import QueryBuilder from "knex/lib/query/querybuilder";

class QueryBuilder_Firebird extends QueryBuilder {
  /**
   * Generates an UPDATE OR INSERT statement for Firebird.
   *
   * @param {object} values           - The column/value pairs to insert or update.
   * @param {string|string[]} [returning] - Column(s) to return via the RETURNING clause.
   * @param {{ matching?: string|string[] }} [options]
   *   - `matching`: Column(s) used to decide whether to INSERT or UPDATE.
   *     If omitted, Firebird falls back to the table's primary key.
   * @returns {this}
   */
  upsert(values, returning, options) {
    this._method = "upsert";
    this._single.upsert = values;
    if (returning) {
      this._single.returning = returning;
    }
    if (options && options.matching) {
      this._single.matching = options.matching;
    }
    return this;
  }
}

export default QueryBuilder_Firebird;
