import { Knex } from 'knex';

declare class Client_Firebird extends Knex.Client {
  constructor(config: Knex.Config);
}

export default Client_Firebird;
