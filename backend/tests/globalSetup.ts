import { execSync } from 'node:child_process';
import { getTestDatabaseUrl } from './testDatabaseUrl.js';

/**
 * Rebuilds the test database from zero with every migration (including the
 * raw-SQL constraints) before the suite runs. `migrate reset` also creates the
 * database if it does not exist.
 */
export default function setup(): void {
  const url = getTestDatabaseUrl();
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: url },
  });
}
