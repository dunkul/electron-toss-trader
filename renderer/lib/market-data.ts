import { api } from './ipc';

// 전일종가 = 일봉 2개 중 어제 것(최신순으로 오므로 index 1). 상장 첫날 등 1개뿐이면 결과에서 제외한다.
export async function fetchReferencePrices(symbols: string[]): Promise<Record<string, number>> {
  const entries = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const page = await api.getCandles({ symbol, interval: '1d', count: 2 });
        const ref = page.candles[1]?.closePrice;
        return ref ? ([symbol, Number(ref)] as const) : null;
      } catch {
        return null;
      }
    }),
  );
  return Object.fromEntries(entries.filter((entry): entry is readonly [string, number] => entry !== null));
}
