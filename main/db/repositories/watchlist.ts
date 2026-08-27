import type { DatabaseSync } from 'node:sqlite';
import type { TossExchange, WatchlistGroupRow, WatchlistRow } from '../schema';

export interface AddToWatchlistInput {
  groupId: number;
  symbol: string;
  name: string;
  market: TossExchange;
}

export function listWatchlistGroups(db: DatabaseSync): WatchlistGroupRow[] {
  return db
    .prepare('SELECT * FROM watchlist_groups ORDER BY sort_order, id')
    .all() as unknown as WatchlistGroupRow[];
}

export function createWatchlistGroup(db: DatabaseSync, name: string): WatchlistGroupRow {
  const { maxOrder } = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM watchlist_groups')
    .get() as { maxOrder: number };

  const { lastInsertRowid } = db
    .prepare('INSERT INTO watchlist_groups (name, sort_order) VALUES (?, ?)')
    .run(name, maxOrder + 1);

  return db.prepare('SELECT * FROM watchlist_groups WHERE id = ?').get(lastInsertRowid) as unknown as WatchlistGroupRow;
}

export function renameWatchlistGroup(db: DatabaseSync, id: number, name: string): void {
  db.prepare('UPDATE watchlist_groups SET name = ? WHERE id = ?').run(name, id);
}

export function deleteWatchlistGroup(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM watchlist_groups WHERE id = ?').run(id);
}

export function listWatchlist(db: DatabaseSync): WatchlistRow[] {
  return db
    .prepare('SELECT * FROM watchlist ORDER BY group_id, sort_order, created_at')
    .all() as unknown as WatchlistRow[];
}

export function addToWatchlist(db: DatabaseSync, input: AddToWatchlistInput): WatchlistRow {
  const { maxOrder } = db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM watchlist WHERE group_id = ?')
    .get(input.groupId) as { maxOrder: number };

  db.prepare(
    `INSERT INTO watchlist (group_id, symbol, name, market, sort_order) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(group_id, symbol) DO UPDATE SET name = excluded.name, market = excluded.market`,
  ).run(input.groupId, input.symbol, input.name, input.market, maxOrder + 1);

  return db
    .prepare('SELECT * FROM watchlist WHERE group_id = ? AND symbol = ?')
    .get(input.groupId, input.symbol) as unknown as WatchlistRow;
}

export function removeFromWatchlist(db: DatabaseSync, groupId: number, symbol: string): void {
  db.prepare('DELETE FROM watchlist WHERE group_id = ? AND symbol = ?').run(groupId, symbol);
}
