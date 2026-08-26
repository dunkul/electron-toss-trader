import type { DatabaseSync } from 'node:sqlite';
import type { Signal, StrategySignalRow } from '../schema';

export interface RecordSignalInput {
  strategyId: number;
  signal: Signal;
  reason?: string;
  price?: number;
  notified: boolean;
}

export function recordSignal(db: DatabaseSync, input: RecordSignalInput): StrategySignalRow {
  const result = db
    .prepare(
      `INSERT INTO strategy_signals (strategy_id, signal, reason, price, notified)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(input.strategyId, input.signal, input.reason ?? null, input.price ?? null, input.notified ? 1 : 0);

  return db
    .prepare('SELECT * FROM strategy_signals WHERE id = ?')
    .get(Number(result.lastInsertRowid)) as unknown as StrategySignalRow;
}

export function getLastSignal(db: DatabaseSync, strategyId: number): StrategySignalRow | undefined {
  return db
    .prepare('SELECT * FROM strategy_signals WHERE strategy_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(strategyId) as unknown as StrategySignalRow | undefined;
}

export function listRecentSignals(db: DatabaseSync, limit = 100): StrategySignalRow[] {
  return db
    .prepare('SELECT * FROM strategy_signals ORDER BY created_at DESC LIMIT ?')
    .all(limit) as unknown as StrategySignalRow[];
}
