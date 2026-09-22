/**
 * Накатывает миграции при старте.
 *
 * Отдельно от drizzle-kit: тот нужен только для генерации и тянет за собой
 * пакеты разработки, которым в боевом образе делать нечего.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL не задан');

  const pool = new Pool({ connectionString });
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  await pool.end();
  console.log('Миграции применены');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
