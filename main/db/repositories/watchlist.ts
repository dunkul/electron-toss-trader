import type { Kysely } from 'kysely';
import type { Database, TossExchange, WatchlistGroupRow, WatchlistRow } from '../schema';

export interface AddToWatchlistInput {
  groupId: number;
  symbol: string;
  name: string;
  market: TossExchange;
}

export async function listWatchlistGroups(db: Kysely<Database>): Promise<WatchlistGroupRow[]> {
  return db.selectFrom('watchlist_groups').selectAll().orderBy('sort_order').orderBy('id').execute();
}

export async function createWatchlistGroup(db: Kysely<Database>, name: string): Promise<WatchlistGroupRow> {
  const { maxOrder } = await db
    .selectFrom('watchlist_groups')
    .select((eb) => eb.fn.coalesce(eb.fn.max('sort_order'), eb.val(-1)).as('maxOrder'))
    .executeTakeFirstOrThrow();

  return db
    .insertInto('watchlist_groups')
    .values({ name, sort_order: Number(maxOrder) + 1 })
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function renameWatchlistGroup(db: Kysely<Database>, id: number, name: string): Promise<void> {
  await db.updateTable('watchlist_groups').set({ name }).where('id', '=', id).execute();
}

export async function deleteWatchlistGroup(db: Kysely<Database>, id: number): Promise<void> {
  await db.deleteFrom('watchlist_groups').where('id', '=', id).execute();
}

export async function listWatchlist(db: Kysely<Database>): Promise<WatchlistRow[]> {
  return db
    .selectFrom('watchlist')
    .selectAll()
    .orderBy('group_id')
    .orderBy('sort_order')
    .orderBy('created_at')
    .execute();
}

export async function addToWatchlist(db: Kysely<Database>, input: AddToWatchlistInput): Promise<WatchlistRow> {
  const { maxOrder } = await db
    .selectFrom('watchlist')
    .select((eb) => eb.fn.coalesce(eb.fn.max('sort_order'), eb.val(-1)).as('maxOrder'))
    .where('group_id', '=', input.groupId)
    .executeTakeFirstOrThrow();

  return db
    .insertInto('watchlist')
    .values({
      group_id: input.groupId,
      symbol: input.symbol,
      name: input.name,
      market: input.market,
      sort_order: Number(maxOrder) + 1,
    })
    .onConflict((oc) =>
      oc.columns(['group_id', 'symbol']).doUpdateSet({ name: input.name, market: input.market }),
    )
    .returningAll()
    .executeTakeFirstOrThrow();
}

export async function removeFromWatchlist(db: Kysely<Database>, groupId: number, symbol: string): Promise<void> {
  await db.deleteFrom('watchlist').where('group_id', '=', groupId).where('symbol', '=', symbol).execute();
}
