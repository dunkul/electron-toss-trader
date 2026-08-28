import { sql, type Kysely } from 'kysely';
import type { Database, Market, StrategyRow, StrategyType } from '../schema';

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

export async function listStrategies(db: Kysely<Database>): Promise<StrategyRow[]> {
  return db.selectFrom('strategies').selectAll().orderBy('created_at', 'desc').execute();
}

export async function listActiveStrategies(db: Kysely<Database>): Promise<StrategyRow[]> {
  return db.selectFrom('strategies').selectAll().where('is_active', '=', 1).execute();
}

export async function getStrategy(db: Kysely<Database>, id: number): Promise<StrategyRow | undefined> {
  return db.selectFrom('strategies').selectAll().where('id', '=', id).executeTakeFirst();
}

export async function createStrategy(db: Kysely<Database>, input: CreateStrategyInput): Promise<StrategyRow> {
  return db
    .insertInto('strategies')
    .values({
      name: input.name,
      symbol: input.symbol,
      market: input.market,
      strategy_type: input.strategyType,
      params_json: JSON.stringify(input.params),
      cooldown_sec: input.cooldownSec ?? 300,
      notify_desktop: input.notifyDesktop === false ? 0 : 1,
      notify_sound: input.notifySound === false ? 0 : 1,
    })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function updateStrategy(
  db: Kysely<Database>,
  id: number,
  input: UpdateStrategyInput,
): Promise<StrategyRow | undefined> {
  const current = await getStrategy(db, id);
  if (!current) return undefined;

  return db
    .updateTable('strategies')
    .set({
      name: input.name ?? current.name,
      symbol: input.symbol ?? current.symbol,
      market: input.market ?? current.market,
      strategy_type: input.strategyType ?? current.strategy_type,
      params_json: input.params !== undefined ? JSON.stringify(input.params) : current.params_json,
      cooldown_sec: input.cooldownSec ?? current.cooldown_sec,
      notify_desktop: input.notifyDesktop === undefined ? current.notify_desktop : input.notifyDesktop ? 1 : 0,
      notify_sound: input.notifySound === undefined ? current.notify_sound : input.notifySound ? 1 : 0,
      updated_at: sql`CURRENT_TIMESTAMP`,
    })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();
}

export async function toggleStrategy(
  db: Kysely<Database>,
  id: number,
  isActive: boolean,
): Promise<StrategyRow | undefined> {
  return db
    .updateTable('strategies')
    .set({ is_active: isActive ? 1 : 0, updated_at: sql`CURRENT_TIMESTAMP` })
    .where('id', '=', id)
    .returningAll()
    .executeTakeFirst();
}

// strategy_signals.strategy_id는 ON DELETE CASCADE 없이 strategies(id)를 참조하므로(FK 제약이
// 켜져 있음, connection.ts 참고), 신호 이력이 하나라도 쌓인 전략은 이 삭제를 먼저 안 하면
// FOREIGN KEY constraint failed로 실패한다.
export async function deleteStrategy(db: Kysely<Database>, id: number): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom('strategy_signals').where('strategy_id', '=', id).execute();
    await trx.deleteFrom('strategies').where('id', '=', id).execute();
  });
}
