import type { Kysely } from 'kysely';
import type { Database, LogLevel, LogSource, SystemLogRow } from '../schema';

export async function insertSystemLog(
  db: Kysely<Database>,
  input: { level: LogLevel; source: LogSource; message: string; context?: unknown },
): Promise<void> {
  await db
    .insertInto('system_logs')
    .values({
      level: input.level,
      source: input.source,
      message: input.message,
      context_json: input.context !== undefined ? JSON.stringify(input.context) : null,
    })
    .execute();
}

export async function listRecentLogs(db: Kysely<Database>, limit = 200): Promise<SystemLogRow[]> {
  return db.selectFrom('system_logs').selectAll().orderBy('created_at', 'desc').limit(limit).execute();
}
