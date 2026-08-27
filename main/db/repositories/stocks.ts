import { sql, type Kysely } from 'kysely';
import type { Database, StockRow, TossExchange } from '../schema';

export interface StockUpsertInput {
  symbol: string;
  name: string;
  securityType: string;
  isCommonShare: boolean;
  isinCode?: string | null;
}

export async function replaceMarketStocks(
  db: Kysely<Database>,
  market: TossExchange,
  stocks: StockUpsertInput[],
): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.deleteFrom('stocks').where('market', '=', market).execute();

    if (stocks.length > 0) {
      await trx
        .insertInto('stocks')
        .values(
          stocks.map((stock) => ({
            symbol: stock.symbol,
            name: stock.name,
            market,
            security_type: stock.securityType,
            is_common_share: (stock.isCommonShare ? 1 : 0) as 0 | 1,
            isin_code: stock.isinCode ?? null,
          })),
        )
        .execute();
    }
  });
}

// ETF/ETN 이름에 종목명이 섞여 나오는 경우가 훨씬 많아 검색이 묻히므로(예: "삼성전자" 검색 시
// "KODEX 삼성전자단일종목레버리지" 등), 일반 주식(security_type='STOCK')과 이름이 검색어로
// 시작하는 항목을 우선 노출한다. is_common_share는 ETF에도 1로 채워져 있어 구분 기준이 못 된다.
export async function searchStocks(db: Kysely<Database>, query: string, limit = 20): Promise<StockRow[]> {
  const like = `%${query}%`;
  const prefix = `${query}%`;
  return db
    .selectFrom('stocks')
    .selectAll()
    .where((eb) => eb.or([eb('symbol', 'like', like), eb('name', 'like', like)]))
    .orderBy(sql`CASE WHEN security_type = 'STOCK' THEN 0 ELSE 1 END`)
    .orderBy(sql`CASE WHEN name LIKE ${prefix} THEN 0 ELSE 1 END`)
    .orderBy('name')
    .limit(limit)
    .execute();
}

export async function getStocksBySymbols(db: Kysely<Database>, symbols: string[]): Promise<StockRow[]> {
  if (symbols.length === 0) return [];
  return db.selectFrom('stocks').selectAll().where('symbol', 'in', symbols).execute();
}

/** symbol -> name 매핑. 랭킹 API 응답에는 종목명이 없어 로컬 stocks 캐시로 보강할 때 쓴다. */
export async function getStockNames(db: Kysely<Database>, symbols: string[]): Promise<Record<string, string>> {
  if (symbols.length === 0) return {};
  const rows = await db.selectFrom('stocks').select(['symbol', 'name']).where('symbol', 'in', symbols).execute();
  return Object.fromEntries(rows.map((row) => [row.symbol, row.name]));
}

export async function countStocks(db: Kysely<Database>): Promise<number> {
  const row = await db
    .selectFrom('stocks')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .executeTakeFirstOrThrow();
  return row.count;
}
