import { Database } from 'bun:sqlite';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const DB_DIR = join(process.cwd(), 'data');
const DB_PATH = join(DB_DIR, 'journal.db');

let db: Database | null = null;

function initSchema(database: Database): void {
  const hasTable = database.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='executions'"
  ).get();
  if (hasTable) return;

  const schemaPath = join(process.cwd(), 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');
  database.exec(schema);
}

export function getDb(): Database {
  if (!db) {
    mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.exec('PRAGMA journal_mode=WAL');
    initSchema(db);
  }
  return db;
}
