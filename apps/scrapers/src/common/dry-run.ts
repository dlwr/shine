import {getDatabase, type Environment} from '@shine/database';

type DatabaseClient = ReturnType<typeof getDatabase>;

const writeMethods = new Set(['insert', 'update', 'delete']);

export function getScrapeDatabase(context: {
  environment: Environment;
  isDryRun: boolean;
}): DatabaseClient {
  const database = getDatabase(context.environment);

  if (!context.isDryRun) {
    return database;
  }

  return new Proxy(database, {
    get(target, property) {
      if (typeof property === 'string' && writeMethods.has(property)) {
        return () => {
          throw new Error(
            `dry-run 中に database.${property}() が呼ばれました。この経路には dry-run の分岐が必要です`,
          );
        };
      }

      const value = Reflect.get(target, property) as unknown;
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
