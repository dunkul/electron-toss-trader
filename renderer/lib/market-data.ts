import { CANDLE_INTERVALS, api } from './ipc';
import type { TossExchange } from './ipc';

// 전일종가 = 일봉 2개 중 어제 것(최신순으로 오므로 index 1). 상장 첫날 등 1개뿐이면 결과에서 제외한다.
export async function fetchReferencePrices(symbols: string[]): Promise<Record<string, number>> {
  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const page = await api.getCandles({ symbol, interval: CANDLE_INTERVALS.ONE_DAY, count: 2 });
        const ref = page.candles[1]?.closePrice;
        return ref ? ([symbol, Number(ref)] as const) : null;
      } catch {
        return null;
      }
    }),
  );
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, number] => entry !== null));
}

// 보유종목 응답에는 정확한 거래소 코드(KOSPI/NASDAQ 등)가 없어, 차트를 열려면 로컬 종목 캐시에서
// 심볼별 거래소를 따로 조회해야 한다. 캐시에 없는 심볼은 결과에서 빠진다(호출부는 market이 없는
// 종목을 "차트를 열 수 없음"으로 취급한다 — stockCacheMissError 참고).
export async function resolveMarketsBySymbol(symbols: string[]): Promise<Record<string, TossExchange>> {
  if (symbols.length === 0) return {};
  try {
    const rows = await api.getStocksBySymbols(symbols);
    return Object.fromEntries(rows.map((row) => [row.symbol, row.market]));
  } catch {
    return {};
  }
}
