import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { app } from 'electron';
import { logger } from '../logger';
import { MIGRATIONS } from './migrations';

let db: DatabaseSync | null = null;

function resolveDbPath(): string {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'toss-trader.db');
}

function runMigrations(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const appliedRows = database.prepare('SELECT version FROM schema_migrations').all() as Array<{
    version: number;
  }>;
  const applied = new Set(appliedRows.map((row) => row.version));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;

    logger.info({ version: migration.version, name: migration.name }, 'applying db migration');
    database.exec('BEGIN');
    try {
      database.exec(migration.sql);
      database
        .prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
        .run(migration.version, migration.name);
      database.exec('COMMIT');
    } catch (err) {
      database.exec('ROLLBACK');
      throw err;
    }
  }
}

export function getDb(): DatabaseSync {
  if (db) return db;

  const dbPath = resolveDbPath();
  logger.info({ dbPath }, 'opening database');

  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  runMigrations(db);

  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}
