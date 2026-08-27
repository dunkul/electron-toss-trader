import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { app } from 'electron';
import { Kysely } from 'kysely';
import { logger } from '../logger';
import { createNodeSqliteDialect } from './node-sqlite-dialect';
import { MIGRATIONS } from './migrations';
import type { Database } from './schema';

let rawDb: DatabaseSync | null = null;
let db: Kysely<Database> | null = null;

function resolveDbPath(): string {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  const dir = app.getPath('userData');
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'toss-trader.db');
}

// 마이그레이션은 kysely 도입 이전과 동일하게 raw SQL 러너로 처리한다 — kysely는 그 위에
// 얹히는 쿼리 빌더 계층일 뿐이고, DDL/버전 관리는 이 방식이 훨씬 단순하다.
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

export function getDb(): Kysely<Database> {
  if (db) return db;

  const dbPath = resolveDbPath();
  logger.info({ dbPath }, 'opening database');

  rawDb = new DatabaseSync(dbPath);
  rawDb.exec('PRAGMA journal_mode = WAL;');
  rawDb.exec('PRAGMA foreign_keys = ON;');
  runMigrations(rawDb);

  db = new Kysely<Database>({ dialect: createNodeSqliteDialect(rawDb) });

  return db;
}

export async function closeDb(): Promise<void> {
  await db?.destroy();
  db = null;
  rawDb = null;
}
