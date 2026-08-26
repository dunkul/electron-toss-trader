import type { CreateStrategyInput, UpdateStrategyInput } from '../../main/db/repositories/strategies';
import type {
  Market,
  StockRow,
  StrategyRow,
  StrategySignalRow,
  StrategyType,
  SystemLogRow,
} from '../../main/db/schema';
import type { AccountSummary, Holding, HoldingsSummary } from '../../main/toss-api/endpoints/account';
import type { Candle, CandleInterval, PriceQuote } from '../../main/toss-api/endpoints/market';
import type { SignalNotification } from '../../main/notify/notifier';

// main/ipc/channels.ts의 채널 이름과 반드시 일치해야 한다.
// (renderer는 main 프로세스 코드를 직접 import하지 않는다 — 이 문자열들은 값이 아니라 타입만 main에서 가져온다)
const CHANNELS = {
  ACCOUNTS_LIST: 'accounts:list',
  ACCOUNTS_HOLDINGS: 'accounts:holdings',
  STRATEGY_LIST: 'strategy:list',
  STRATEGY_CREATE: 'strategy:create',
  STRATEGY_UPDATE: 'strategy:update',
  STRATEGY_TOGGLE: 'strategy:toggle',
  STRATEGY_DELETE: 'strategy:delete',
  SIGNALS_LIST: 'signals:list',
  LOGS_LIST: 'logs:list',
  NOTIFICATIONS_TEST: 'notifications:test',
  STOCKS_SEARCH: 'stocks:search',
  STOCKS_STATUS: 'stocks:status',
  STOCKS_REFRESH: 'stocks:refresh',
  MARKET_PRICES: 'market:prices',
  MARKET_CANDLES: 'market:candles',
  STRATEGY_SIGNAL_EVENT: 'strategy:signal',
} as const;

export interface StocksStatus {
  count: number;
  lastSyncedAt: string | null;
}

export type { Market, StockRow, StrategyRow, StrategySignalRow, StrategyType, SystemLogRow };
export type {
  AccountSummary,
  Holding,
  HoldingsSummary,
  Candle,
  CandleInterval,
  PriceQuote,
  SignalNotification,
};
export type { CreateStrategyInput, UpdateStrategyInput };

export const api = {
  listAccounts: () => window.ipc.invoke<AccountSummary[]>(CHANNELS.ACCOUNTS_LIST),
  getHoldings: (accountSeq: string) =>
    window.ipc.invoke<HoldingsSummary>(CHANNELS.ACCOUNTS_HOLDINGS, accountSeq),

  listStrategies: () => window.ipc.invoke<StrategyRow[]>(CHANNELS.STRATEGY_LIST),
  createStrategy: (input: CreateStrategyInput) =>
    window.ipc.invoke<StrategyRow>(CHANNELS.STRATEGY_CREATE, input),
  updateStrategy: (id: number, input: UpdateStrategyInput) =>
    window.ipc.invoke<StrategyRow | undefined>(CHANNELS.STRATEGY_UPDATE, id, input),
  toggleStrategy: (id: number, isActive: boolean) =>
    window.ipc.invoke<StrategyRow | undefined>(CHANNELS.STRATEGY_TOGGLE, id, isActive),
  deleteStrategy: (id: number) => window.ipc.invoke<void>(CHANNELS.STRATEGY_DELETE, id),

  listSignals: (limit?: number) => window.ipc.invoke<StrategySignalRow[]>(CHANNELS.SIGNALS_LIST, limit),
  listLogs: (limit?: number) => window.ipc.invoke<SystemLogRow[]>(CHANNELS.LOGS_LIST, limit),

  searchStocks: (query: string, limit?: number) =>
    window.ipc.invoke<StockRow[]>(CHANNELS.STOCKS_SEARCH, query, limit),
  getStocksStatus: () => window.ipc.invoke<StocksStatus>(CHANNELS.STOCKS_STATUS),
  refreshStocks: () => window.ipc.invoke<StocksStatus>(CHANNELS.STOCKS_REFRESH),

  getPrices: (symbols: string[]) => window.ipc.invoke<PriceQuote[]>(CHANNELS.MARKET_PRICES, symbols),
  getCandles: (params: { symbol: string; interval: CandleInterval; count?: number }) =>
    window.ipc.invoke<Candle[]>(CHANNELS.MARKET_CANDLES, params),

  testNotification: () => window.ipc.invoke<void>(CHANNELS.NOTIFICATIONS_TEST),
};

export function onStrategySignal(callback: (payload: SignalNotification) => void): () => void {
  return window.ipc.on<SignalNotification>(CHANNELS.STRATEGY_SIGNAL_EVENT, callback);
}
