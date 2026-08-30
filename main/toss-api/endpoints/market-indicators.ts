import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema';
import { tossRequest } from '../http-client';
import { TOSS_API_PATHS } from '../paths';
import { API_GROUPS } from '../rate-limiter';
import type { CandleInterval } from './market';

// Market Indicators 그룹은 이 8개 심볼만 지원한다(그 외는 400 unsupported-symbol).
export const MARKET_INDICATOR_SYMBOLS = {
  KOSPI: 'KOSPI',
  KOSDAQ: 'KOSDAQ',
  KR_BOND_2Y: 'KR_BOND_2Y',
  KR_BOND_3Y: 'KR_BOND_3Y',
  KR_BOND_5Y: 'KR_BOND_5Y',
  KR_BOND_10Y: 'KR_BOND_10Y',
  KR_BOND_20Y: 'KR_BOND_20Y',
  KR_BOND_30Y: 'KR_BOND_30Y',
} as const;

export type MarketIndicatorSymbol = (typeof MARKET_INDICATOR_SYMBOLS)[keyof typeof MARKET_INDICATOR_SYMBOLS];

export interface MarketIndicatorPrice {
  symbol: string;
  timestamp: string;
  lastPrice: string;
}

interface MarketIndicatorPricesResponse {
  result: MarketIndicatorPrice[];
}

export async function getMarketIndicatorPrices(
  db: Kysely<Database>,
  symbols: MarketIndicatorSymbol[],
): Promise<MarketIndicatorPrice[]> {
  const response = await tossRequest<MarketIndicatorPricesResponse>(
    db,
    API_GROUPS.MARKET_INDICATOR_PRICE,
    TOSS_API_PATHS.MARKET_INDICATOR_PRICES,
    { query: { symbols: symbols.join(',') } },
  );
  return response.result ?? [];
}

// 개별 종목 캔들(Candle)과 필드 구성이 동일하나 currency가 없다(지수/금리엔 통화 개념이 없음).
export interface MarketIndicatorCandle {
  timestamp: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  closePrice: string;
  volume: string;
}

export interface MarketIndicatorCandlesPage {
  candles: MarketIndicatorCandle[];
  nextBefore: string | null;
}

interface MarketIndicatorCandlesResponse {
  result: MarketIndicatorCandlesPage;
}

const EMPTY_MARKET_INDICATOR_CANDLES_PAGE: MarketIndicatorCandlesPage = { candles: [], nextBefore: null };

// 분봉(1m)은 KOSPI/KOSDAQ만 지원, 국채는 일봉(1d)만 지원한다(그 외 요청 시 400 invalid-request).
export async function getMarketIndicatorCandles(
  db: Kysely<Database>,
  params: { symbol: MarketIndicatorSymbol; interval: CandleInterval; count?: number; before?: string },
): Promise<MarketIndicatorCandlesPage> {
  const response = await tossRequest<MarketIndicatorCandlesResponse>(
    db,
    API_GROUPS.MARKET_INDICATOR_CHART,
    TOSS_API_PATHS.MARKET_INDICATOR_CANDLES(params.symbol),
    { query: { interval: params.interval, count: params.count, before: params.before } },
  );
  return response.result ?? EMPTY_MARKET_INDICATOR_CANDLES_PAGE;
}
