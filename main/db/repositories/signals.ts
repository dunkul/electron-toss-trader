import { sql, type Kysely } from 'kysely';
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

// 전략 엔진의 매 tick마다 신호가 발생한 전략 수만큼 getLastSignal을 따로 호출하면(N+1), 활성
// 전략이 늘어날수록 쿼리 수가 그만큼 늘어난다 — tick 시작 시 한 번에 조회해서 맵으로 넘긴다.
export async function getLastSignalTimesByStrategyIds(
  db: Kysely<Database>,
  strategyIds: number[],
): Promise<Map<number, string>> {
  if (strategyIds.length === 0) return new Map();
  const rows = await db
    .selectFrom('strategy_signals')
    .select(['strategy_id', sql<string>`MAX(created_at)`.as('last_created_at')])
    .where('strategy_id', 'in', strategyIds)
    .groupBy('strategy_id')
    .execute();
  return new Map(rows.map((row) => [row.strategy_id, row.last_created_at]));
}

export async function listRecentSignals(db: Kysely<Database>, limit = 100): Promise<StrategySignalRow[]> {
  return db.selectFrom('strategy_signals').selectAll().orderBy('created_at', 'desc').limit(limit).execute();
}
