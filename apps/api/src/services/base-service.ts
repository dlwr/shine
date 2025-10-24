import {getDatabase, type Environment} from '@shine/database';
import type {ServiceContext} from '@shine/types';

export abstract class BaseService {
  protected context: ServiceContext;

  constructor(environment: Environment) {
    this.context = {
      env: environment,
      database: getDatabase(environment),
    };
  }

  protected get database() {
    return this.context.database;
  }

  protected get env() {
    return this.context.env;
  }
}
