import {createClient} from '@libsql/client';
import {buildEnvironment, loadEnvironmentFiles} from './src/common/environment';

loadEnvironmentFiles();
const environment = buildEnvironment(process.env);

const client = createClient({
  url: environment.TURSO_DATABASE_URL!,
  authToken: environment.TURSO_AUTH_TOKEN,
});

const sql = process.argv[2];
const result = await client.execute(sql);
console.log(JSON.stringify(result.rows, undefined, 1));
