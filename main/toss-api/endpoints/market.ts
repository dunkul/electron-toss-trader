import type { DatabaseSync } from 'node:sqlite';
import { tossRequest } from '../http-client';

// 응답 필드는 실제 계정으로 호출을 확인하기 전까지는 OpenAPI 문서 기준 추정치다.
// client_id/secret 발급 후 openapi.json과 대조해 보정한다.

export interface PriceQuote {
  symbol: string;
  price: number;
  changeRate?: number;
}

export function getPrices(db: DatabaseSync, symbols: string[]): Promise<PriceQuote[]> {
  return tossRequest<PriceQuote[]>(db, 'MARKET_DATA', '/api/v1/prices', {
    query: { symbols: symbols.join(',') },
  });
}

export type CandleInterval = '1m' | '5m' | '1d';

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export function getCandles(
  db: DatabaseSync,
  params: { symbol: string; interval: CandleInterval; count?: number },
): Promise<Candle[]> {
  return tossRequest<Candle[]>(db, 'MARKET_DATA_CHART', '/api/v1/candles', {
    query: { symbol: params.symbol, interval: params.interval, count: params.count },
  });
}
