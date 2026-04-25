import Transaction from "knex/lib/execution/transaction";

const noop = () => {};

class Transaction_Firebird extends Transaction {
  /**
   * Starts an explicit Firebird transaction and stores it on the connection
   * so that _query() runs inside the same transaction instead of auto-committing.
   *
   * @param {import('node-firebird-driver-native').Attachment} conn
   * @returns {Promise<unknown>}
   */
  async begin(conn) {
    const isolation = (this.isolationLevel || "READ_COMMITTED")
      .toUpperCase()
      .replace(/ /g, "_");
    const transaction = await conn.startTransaction({
      isolation,
      ...(this.readOnly && {
        accessMode: "READ_ONLY",
      }),
    });
    this._transaction = transaction;
    this._conn = conn;
    conn._activeFbTransaction = transaction;
    return transaction;
  }

  savepoint() {
    throw new Error("savepoints not implemented");
  }

  release() {
    throw new Error("releasing savepoints not implemented");
  }

  async commit(conn, value) {
    this._completed = true;
    const c = conn || this._conn;
    if (c) c._activeFbTransaction = null;
    await this._transaction.commit();
    this._resolver(value);
  }

  async rollback(conn, error) {
    this._completed = true;
    const c = conn || this._conn;
    if (c) c._activeFbTransaction = null;
    await this._transaction.rollback().catch(noop);
    if (error) {
      this._rejecter(error);
    } else {
      this._resolver();
    }
  }

  rollbackTo() {
    throw new Error("rolling back to savepoints not implemented");
  }
}

export default Transaction_Firebird;
