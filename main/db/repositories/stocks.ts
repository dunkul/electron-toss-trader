import type { DatabaseSync } from 'node:sqlite';
import type { StockRow, TossExchange } from '../schema';

export interface StockUpsertInput {
  symbol: string;
  name: string;
  securityType: string;
  isCommonShare: boolean;
  isinCode?: string | null;
}

export function replaceMarketStocks(
  db: DatabaseSync,
  market: TossExchange,
  stocks: StockUpsertInput[],
): void {
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM stocks WHERE market = ?').run(market);

    const insert = db.prepare(
      `INSERT INTO stocks (symbol, name, market, security_type, is_common_share, isin_code)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const stock of stocks) {
      insert.run(
        stock.symbol,
        stock.name,
        market,
        stock.securityType,
        stock.isCommonShare ? 1 : 0,
        stock.isinCode ?? null,
      );
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function searchStocks(db: DatabaseSync, query: string, limit = 20): StockRow[] {
  const like = `%${query}%`;
  return db
    .prepare('SELECT * FROM stocks WHERE symbol LIKE ? OR name LIKE ? ORDER BY name LIMIT ?')
    .all(like, like, limit) as unknown as StockRow[];
}

export function countStocks(db: DatabaseSync): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM stocks').get() as { count: number };
  return row.count;
}
