import type { Kysely } from 'kysely';
import type { Database, Signal, StrategySignalRow } from '../schema';

export interface RecordSignalInput {
  strategyId: number;
  signal: Signal;
  reason?: string;
  price?: number;
  notified: boolean;
}

export async function recordSignal(db: Kysely<Database>, input: RecordSignalInput): Promise<StrategySignalRow> {
  return db
    .insertInto('strategy_signals')
    .values({
      strategy_id: input.strategyId,
      signal: input.signal,
      reason: input.reason ?? null,
      price: input.price ?? null,
      notified: input.notified ? 1 : 0,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function getLastSignal(
  db: Kysely<Database>,
  strategyId: number,
): Promise<StrategySignalRow | undefined> {
  return db
    .selectFrom('strategy_signals')
    .selectAll()
    .where('strategy_id', '=', strategyId)
    .orderBy('created_at', 'desc')
    .limit(1)
    .executeTakeFirst();
}

export async function listRecentSignals(db: Kysely<Database>, limit = 100): Promise<StrategySignalRow[]> {
  return db.selectFrom('strategy_signals').selectAll().orderBy('created_at', 'desc').limit(limit).execute();
}
