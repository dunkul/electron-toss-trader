import { KRW, USD } from './format';
import type { TossExchange } from './ipc';

const KR_EXCHANGES: ReadonlySet<TossExchange> = new Set(['KOSPI', 'KOSDAQ', 'KR_ETC']);

/** 종목 캐시의 거래소 코드로부터 통화를 유추한다 (KOSPI/KOSDAQ/KR_ETC → KRW, 그 외 → USD). */
export function marketCurrency(market: TossExchange): typeof KRW | typeof USD {
  return KR_EXCHANGES.has(market) ? KRW : USD;
}

// 국내주식 호가단위(KRX). 해외주식은 거래소별로 다양하지만 이 앱에서 다루는 화면(호가창
// 프리뷰) 수준에서는 센트 단위(0.01)로 충분하다.
const KR_TICK_BANDS: [threshold: number, tick: number][] = [
  [2_000, 1],
  [5_000, 5],
  [20_000, 10],
  [50_000, 50],
  [200_000, 100],
  [500_000, 500],
  [Infinity, 1_000],
];

export function tickSize(currency: string, price: number): number {
  if (currency !== KRW) return 0.01;
  const band = KR_TICK_BANDS.find(([threshold]) => price < threshold);
  return band ? band[1] : 1_000;
}

export function roundToTick(price: number, currency: string): number {
  const tick = tickSize(currency, price);
  return Math.round(price / tick) * tick;
}

export function stepPrice(price: number, currency: string, direction: 1 | -1): number {
  const tick = tickSize(currency, price);
  const next = price + tick * direction;
  return Math.max(roundToTick(next, currency), tick);
}
