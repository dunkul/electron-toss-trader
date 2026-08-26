import type { DatabaseSync } from 'node:sqlite';
import { tossRequest } from '../http-client';
import { TOSS_API_PATHS } from '../paths';

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

export async function getPrices(db: DatabaseSync, symbols: string[]): Promise<PriceQuote[]> {
  const response = await tossRequest<PricesResponse>(db, 'MARKET_DATA', TOSS_API_PATHS.PRICES, {
    query: { symbols: symbols.join(',') },
  });
  return response.result;
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

interface CandlesResponse {
  result: {
    candles: Candle[];
    nextBefore: string | null;
  };
}

export async function getCandles(
  db: DatabaseSync,
  params: { symbol: string; interval: CandleInterval; count?: number },
): Promise<Candle[]> {
  const response = await tossRequest<CandlesResponse>(db, 'MARKET_DATA_CHART', TOSS_API_PATHS.CANDLES, {
    query: { symbol: params.symbol, interval: params.interval, count: params.count },
  });
  return response.result.candles;
}
