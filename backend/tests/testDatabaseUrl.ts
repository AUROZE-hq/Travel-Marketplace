import 'dotenv/config';

/**
 * Resolves the integration-test database URL and refuses anything that could
 * be a development or shared database: tests TRUNCATE every table.
 */
export function getTestDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error(
      'DATABASE_URL_TEST is not set. Add it to backend/.env (see .env.example); it must point at a dedicated test database.',
    );
  }
  const dbName = new URL(url).pathname.replace(/^\//, '');
  if (!/test/i.test(dbName)) {
    throw new Error(`Refusing to run tests: database name "${dbName}" in DATABASE_URL_TEST must contain "test".`);
  }
  if (process.env.DATABASE_URL && new URL(process.env.DATABASE_URL).pathname === new URL(url).pathname
      && new URL(process.env.DATABASE_URL).host === new URL(url).host) {
    throw new Error('Refusing to run tests: DATABASE_URL_TEST points at the same database as DATABASE_URL.');
  }
  return url;
}
