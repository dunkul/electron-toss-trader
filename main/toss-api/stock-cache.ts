import type { Kysely } from 'kysely';
import type { Database, TossExchange } from '../db/schema';
import { getSetting, setSetting } from '../db/repositories/settings';
import { countStocks, replaceMarketStocks } from '../db/repositories/stocks';
import { logger } from '../logger';
import { getAllStocks } from './endpoints/stocks';

const ALL_MARKETS: TossExchange[] = ['KOSPI', 'KOSDAQ', 'NYSE', 'NASDAQ', 'AMEX', 'KR_ETC', 'US_ETC'];
const SYNC_SETTING_KEY = 'stocks_last_synced_at';
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export async function getLastStocksSyncedAt(db: Kysely<Database>): Promise<string | null> {
  return getSetting(db, SYNC_SETTING_KEY);
}

function isStale(lastSyncedAt: string | null): boolean {
  if (!lastSyncedAt) return true;
  return Date.now() - new Date(lastSyncedAt).getTime() >= SYNC_INTERVAL_MS;
}

// STOCK_ALL 그룹은 1 TPS라 마켓 7개를 순차 조회하면 자연히 ~7초에 걸쳐 페이싱된다.
export async function syncAllStocks(db: Kysely<Database>): Promise<void> {
  logger.info('syncing stock master list from Toss API');

  for (const market of ALL_MARKETS) {
    const stocks = await getAllStocks(db, market);
    await replaceMarketStocks(
      db,
      market,
      stocks.map((stock) => ({
        symbol: stock.symbol,
        name: stock.name,
        securityType: stock.securityType,
        isCommonShare: stock.isCommonShare,
        isinCode: stock.isinCode,
      })),
    );
    logger.info({ market, count: stocks.length }, 'stock master synced');
  }

  await setSetting(db, SYNC_SETTING_KEY, new Date().toISOString());
}

export async function ensureStocksCached(db: Kysely<Database>, force = false): Promise<void> {
  const lastSyncedAt = await getLastStocksSyncedAt(db);
  if (!force && !isStale(lastSyncedAt) && (await countStocks(db)) > 0) return;
  await syncAllStocks(db);
}
