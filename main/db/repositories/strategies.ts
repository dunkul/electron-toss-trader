import type { DatabaseSync } from 'node:sqlite';
import type { Market, StrategyRow, StrategyType } from '../schema';

export interface CreateStrategyInput {
  name: string;
  symbol: string;
  market: Market;
  strategyType: StrategyType;
  params: unknown;
  cooldownSec?: number;
  notifyDesktop?: boolean;
  notifySound?: boolean;
}

export interface UpdateStrategyInput {
  name?: string;
  symbol?: string;
  market?: Market;
  strategyType?: StrategyType;
  params?: unknown;
  cooldownSec?: number;
  notifyDesktop?: boolean;
  notifySound?: boolean;
}

export function listStrategies(db: DatabaseSync): StrategyRow[] {
  return db.prepare('SELECT * FROM strategies ORDER BY created_at DESC').all() as unknown as StrategyRow[];
}

export function listActiveStrategies(db: DatabaseSync): StrategyRow[] {
  return db.prepare('SELECT * FROM strategies WHERE is_active = 1').all() as unknown as StrategyRow[];
}

export function getStrategy(db: DatabaseSync, id: number): StrategyRow | undefined {
  return db.prepare('SELECT * FROM strategies WHERE id = ?').get(id) as unknown as StrategyRow | undefined;
}

export function createStrategy(db: DatabaseSync, input: CreateStrategyInput): StrategyRow {
  const result = db
    .prepare(
      `INSERT INTO strategies
        (name, symbol, market, strategy_type, params_json, cooldown_sec, notify_desktop, notify_sound)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.name,
      input.symbol,
      input.market,
      input.strategyType,
      JSON.stringify(input.params),
      input.cooldownSec ?? 300,
      input.notifyDesktop === false ? 0 : 1,
      input.notifySound === false ? 0 : 1,
    );

  return getStrategy(db, Number(result.lastInsertRowid))!;
}

export function updateStrategy(
  db: DatabaseSync,
  id: number,
  input: UpdateStrategyInput,
): StrategyRow | undefined {
  const current = getStrategy(db, id);
  if (!current) return undefined;

  db.prepare(
    `UPDATE strategies SET
      name = ?, symbol = ?, market = ?, strategy_type = ?, params_json = ?,
      cooldown_sec = ?, notify_desktop = ?, notify_sound = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
  ).run(
    input.name ?? current.name,
    input.symbol ?? current.symbol,
    input.market ?? current.market,
    input.strategyType ?? current.strategy_type,
    input.params !== undefined ? JSON.stringify(input.params) : current.params_json,
    input.cooldownSec ?? current.cooldown_sec,
    input.notifyDesktop === undefined ? current.notify_desktop : input.notifyDesktop ? 1 : 0,
    input.notifySound === undefined ? current.notify_sound : input.notifySound ? 1 : 0,
    id,
  );

  return getStrategy(db, id);
}

export function toggleStrategy(db: DatabaseSync, id: number, isActive: boolean): StrategyRow | undefined {
  db.prepare('UPDATE strategies SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    isActive ? 1 : 0,
    id,
  );
  return getStrategy(db, id);
}

export function deleteStrategy(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM strategies WHERE id = ?').run(id);
}
