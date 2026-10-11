// `npm run migrate`: apply Kysely migrations to the SQLite file.

import { migrateDatabase, openDatabase, databasePath } from './db';

async function main(): Promise<void> {
  const file = databasePath();
  const db = openDatabase(file);
  try {
    await migrateDatabase(db);
    console.log(`migrated ${file}`);
  } finally {
    await db.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
