import type { DatabaseSync } from 'node:sqlite';
import type { TossExchange } from '../../db/schema';
import { tossRequest } from '../http-client';
import { TOSS_API_PATHS } from '../paths';

export interface StockMasterItem {
  symbol: string;
  name: string;
  securityType: string;
  isCommonShare: boolean;
  isinCode: string;
}

interface StocksAllResponse {
  result: StockMasterItem[];
}

// 하루 배치로만 갱신되는 저변동 데이터라 API 문서가 1일 1회 조회 + 로컬 캐싱을 권장한다.
// (rate limit 그룹 STOCK_ALL: 1 TPS)
export async function getAllStocks(db: DatabaseSync, market: TossExchange): Promise<StockMasterItem[]> {
  const response = await tossRequest<StocksAllResponse>(db, 'STOCK_ALL', TOSS_API_PATHS.STOCKS_ALL, {
    query: { market },
  });
  return response.result ?? [];
}
