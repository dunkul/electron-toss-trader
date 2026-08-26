import type { DatabaseSync } from 'node:sqlite';
import type { LogLevel, LogSource, SystemLogRow } from '../schema';

export function insertSystemLog(
  db: DatabaseSync,
  input: { level: LogLevel; source: LogSource; message: string; context?: unknown },
): void {
  db.prepare('INSERT INTO system_logs (level, source, message, context_json) VALUES (?, ?, ?, ?)').run(
    input.level,
    input.source,
    input.message,
    input.context !== undefined ? JSON.stringify(input.context) : null,
  );
}

export function listRecentLogs(db: DatabaseSync, limit = 200): SystemLogRow[] {
  return db
    .prepare('SELECT * FROM system_logs ORDER BY created_at DESC LIMIT ?')
    .all(limit) as unknown as SystemLogRow[];
}
