import { execSync } from 'node:child_process';

export default function globalSetup() {
  const databaseUrlVar = 'MIGRATIONS_DATABASE_URL';
  execSync(`node-pg-migrate up -m src/db/migrations --database-url-var ${databaseUrlVar}`, {
    stdio: 'inherit',
    cwd: __dirname + '/..',
  });
}
