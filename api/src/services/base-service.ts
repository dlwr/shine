import { getDatabase, type Environment } from "db";
import type { ServiceContext } from "./types";

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
