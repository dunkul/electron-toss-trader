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
  const prefix = `${query}%`;
  // ETF/ETN 이름에 종목명이 섞여 나오는 경우가 훨씬 많아 검색이 묻히므로(예: "삼성전자" 검색 시
  // "KODEX 삼성전자단일종목레버리지" 등), 일반 주식(security_type='STOCK')과 이름이 검색어로
  // 시작하는 항목을 우선 노출한다. is_common_share는 ETF에도 1로 채워져 있어 구분 기준이 못 된다.
  return db
    .prepare(
      `SELECT * FROM stocks
       WHERE symbol LIKE ? OR name LIKE ?
       ORDER BY
         CASE WHEN security_type = 'STOCK' THEN 0 ELSE 1 END,
         CASE WHEN name LIKE ? THEN 0 ELSE 1 END,
         name
       LIMIT ?`,
    )
    .all(like, like, prefix, limit) as unknown as StockRow[];
}

export function getStocksBySymbols(db: DatabaseSync, symbols: string[]): StockRow[] {
  if (symbols.length === 0) return [];
  const placeholders = symbols.map(() => '?').join(',');
  return db
    .prepare(`SELECT * FROM stocks WHERE symbol IN (${placeholders})`)
    .all(...symbols) as unknown as StockRow[];
}

/** symbol -> name 매핑. 랭킹 API 응답에는 종목명이 없어 로컬 stocks 캐시로 보강할 때 쓴다. */
export function getStockNames(db: DatabaseSync, symbols: string[]): Record<string, string> {
  if (symbols.length === 0) return {};
  const placeholders = symbols.map(() => '?').join(',');
  const rows = db
    .prepare(`SELECT symbol, name FROM stocks WHERE symbol IN (${placeholders})`)
    .all(...symbols) as { symbol: string; name: string }[];
  return Object.fromEntries(rows.map((row) => [row.symbol, row.name]));
}

export function countStocks(db: DatabaseSync): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM stocks').get() as { count: number };
  return row.count;
}
