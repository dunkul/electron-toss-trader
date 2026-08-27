import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema';
import { tossRequest } from '../http-client';
import { TOSS_API_PATHS } from '../paths';
import { API_GROUPS } from '../rate-limiter';

// openapi.json 확인 결과: 응답은 { result: [...] } 로 감싸져 있고, 가격류 숫자 필드는 문자열(string)로 온다.

export interface PriceQuote {
  symbol: string;
  timestamp: string;
  lastPrice: string;
  currency: string;
}

interface PricesResponse {
  result: PriceQuote[];
}

export async function getPrices(db: Kysely<Database>, symbols: string[]): Promise<PriceQuote[]> {
  const response = await tossRequest<PricesResponse>(db, API_GROUPS.MARKET_DATA, TOSS_API_PATHS.PRICES, {
    query: { symbols: symbols.join(',') },
  });
  return response.result ?? [];
}

export type CandleInterval = '1m' | '5m' | '1d';

export interface Candle {
  timestamp: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  closePrice: string;
  volume: string;
  currency: string;
}

export interface CandlesPage {
  candles: Candle[];
  nextBefore: string | null;
}

interface CandlesResponse {
  result: CandlesPage;
}

const EMPTY_CANDLES_PAGE: CandlesPage = { candles: [], nextBefore: null };

// count는 한 번 요청에 최대 200까지만 허용된다(그 이상은 400 에러). 더 긴 과거 데이터가
// 필요하면 이번 응답의 nextBefore를 다음 호출의 before로 넘겨 이어서 조회한다(커서 페이지네이션).
export async function getCandles(
  db: Kysely<Database>,
  params: { symbol: string; interval: CandleInterval; count?: number; before?: string },
): Promise<CandlesPage> {
  const response = await tossRequest<CandlesResponse>(db, API_GROUPS.MARKET_DATA_CHART, TOSS_API_PATHS.CANDLES, {
    query: {
      symbol: params.symbol,
      interval: params.interval,
      count: params.count,
      before: params.before,
    },
  });
  return response.result ?? EMPTY_CANDLES_PAGE;
}
