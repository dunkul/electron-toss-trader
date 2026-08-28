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

// IPC 경계를 넘어오는 값은 TypeScript 타입이 지워진 채로 도착하고, market/strategy_type 컬럼에는
// DB CHECK 제약도 없어서 잘못된 값이 그대로 저장될 수 있다 — 여기서 한 번 걸러낸다.
const VALID_MARKETS = { KR: true, US: true } satisfies Record<Market, true>;
const VALID_STRATEGY_TYPES = {
  MA_CROSS: true,
  RSI: true,
  PRICE_TARGET: true,
  GRID: true,
} satisfies Record<StrategyType, true>;

function assertValidStrategyFields(fields: { market?: Market; strategyType?: StrategyType }): void {
  if (fields.market !== undefined && !(fields.market in VALID_MARKETS)) {
    throw new Error(`Invalid strategy market: ${fields.market}`);
  }
  if (fields.strategyType !== undefined && !(fields.strategyType in VALID_STRATEGY_TYPES)) {
    throw new Error(`Invalid strategy type: ${fields.strategyType}`);
  }
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
  assertValidStrategyFields({ market: input.market, strategyType: input.strategyType });
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
  assertValidStrategyFields({ market: input.market, strategyType: input.strategyType });
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
