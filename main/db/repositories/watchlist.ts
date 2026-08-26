import type { DatabaseSync } from 'node:sqlite';
import type { TossExchange, WatchlistRow } from '../schema';

export interface AddToWatchlistInput {
  symbol: string;
  name: string;
  market: TossExchange;
}

export function listWatchlist(db: DatabaseSync): WatchlistRow[] {
  return db
    .prepare('SELECT * FROM watchlist ORDER BY created_at DESC')
    .all() as unknown as WatchlistRow[];
}

export function addToWatchlist(db: DatabaseSync, input: AddToWatchlistInput): WatchlistRow {
  db.prepare(
    `INSERT INTO watchlist (symbol, name, market) VALUES (?, ?, ?)
     ON CONFLICT(symbol) DO UPDATE SET name = excluded.name, market = excluded.market`,
  ).run(input.symbol, input.name, input.market);

  return db.prepare('SELECT * FROM watchlist WHERE symbol = ?').get(input.symbol) as unknown as WatchlistRow;
}

export function removeFromWatchlist(db: DatabaseSync, symbol: string): void {
  db.prepare('DELETE FROM watchlist WHERE symbol = ?').run(symbol);
}
