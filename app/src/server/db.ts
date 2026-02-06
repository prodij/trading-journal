import { Database } from 'bun:sqlite';
import { readFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const DB_DIR = join(process.cwd(), 'data');
const DB_PATH = join(DB_DIR, 'journal.db');

let db: Database | null = null;

function initSchema(database: Database): void {
  const schemaPath = join(process.cwd(), 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  const hasTable = database.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='executions'"
  ).get();

  if (!hasTable) {
    database.exec(schema);
    return;
  }

  // Tables exist — ensure views are up to date by extracting and running
  // CREATE VIEW IF NOT EXISTS statements from schema.sql
  const viewStatements = schema
    .split(';')
    .map(s => s.trim())
    .filter(s => /^CREATE VIEW IF NOT EXISTS/i.test(s));
  for (const stmt of viewStatements) {
    database.exec(stmt);
  }
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
