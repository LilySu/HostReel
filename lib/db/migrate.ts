import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  // Migrator needs a non-pooled connection. If using Supabase's pooler URL
  // (port 6543), swap to the direct port 5432 and drop any pgbouncer flag.
  const migrationUrl = connectionString
    .replace(':6543/', ':5432/')
    .replace(/[?&]pgbouncer=true/g, '');

  const client = postgres(migrationUrl, { max: 1 });
  const db = drizzle(client);

  await migrate(db, { migrationsFolder: './lib/db/migrations' });
  console.log('Migrations applied');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
