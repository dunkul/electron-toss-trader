import type { CreateStrategyInput, UpdateStrategyInput } from '../../main/db/repositories/strategies';
import type { AddToWatchlistInput } from '../../main/db/repositories/watchlist';
import type {
  Market,
  StockRow,
  StrategyRow,
  StrategySignalRow,
  StrategyType,
  SystemLogRow,
  TossExchange,
  WatchlistGroupRow,
  WatchlistRow,
} from '../../main/db/schema';
import type { AccountSummary, Holding, HoldingsSummary } from '../../main/toss-api/endpoints/account';
import type { Candle, CandleInterval, CandlesPage, PriceQuote } from '../../main/toss-api/endpoints/market';
import type {
  GetRankingsParams,
  RankingDuration,
  RankingItem,
  RankingResult,
  RankingType,
} from '../../main/toss-api/endpoints/ranking';
import type { InvestorTradingFigure, InvestorTradingRecord } from '../../main/toss-api/endpoints/stocks';
import type {
  MarketIndicatorCandle,
  MarketIndicatorCandlesPage,
  MarketIndicatorPrice,
  MarketIndicatorSymbol,
} from '../../main/toss-api/endpoints/market-indicators';
import type { ExchangeRate, KrMarketCalendar } from '../../main/toss-api/endpoints/market-info';
import type { MarketTick, WsSymbolRef } from '../../main/toss-api/ws-client';
import type { SignalNotification } from '../../main/notify/notifier';
import type { PriceTargetParams } from '../../main/engine/strategies/price-target';
import type { ChartWindowStock } from '../../main/ipc/register';

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
  STOCKS_GET_BY_SYMBOLS: 'stocks:getBySymbols',
  STOCKS_INVESTOR_TRADING: 'stocks:investorTrading',
  MARKET_PRICES: 'market:prices',
  MARKET_CANDLES: 'market:candles',
  MARKET_INDICATOR_PRICES: 'market:indicatorPrices',
  MARKET_INDICATOR_CANDLES: 'market:indicatorCandles',
  EXCHANGE_RATE: 'market:exchangeRate',
  MARKET_CALENDAR_KR: 'market:calendarKr',
  WATCHLIST_LIST: 'watchlist:list',
  WATCHLIST_ADD: 'watchlist:add',
  WATCHLIST_REMOVE: 'watchlist:remove',
  WATCHLIST_REORDER: 'watchlist:reorder',
  WATCHLIST_GROUPS_LIST: 'watchlist-groups:list',
  WATCHLIST_GROUP_CREATE: 'watchlist-groups:create',
  WATCHLIST_GROUP_RENAME: 'watchlist-groups:rename',
  WATCHLIST_GROUP_DELETE: 'watchlist-groups:delete',
  RANKING_LIST: 'ranking:list',
  SETTINGS_CREDENTIALS_STATUS: 'settings:credentialsStatus',
  SETTINGS_SAVE_CREDENTIALS: 'settings:saveCredentials',
  MARKET_SUBSCRIBE: 'market:subscribe',
  WINDOW_OPEN_CHART: 'window:openChart',
  WINDOW_OPEN_DAILY_PRICES: 'window:openDailyPrices',
  APP_RELAUNCH: 'app:relaunch',
  STRATEGY_SIGNAL_EVENT: 'strategy:signal',
  MARKET_TICK_EVENT: 'market:tick',
  WINDOW_CHART_UPDATE_EVENT: 'window:chartUpdate',
  WINDOW_DAILY_PRICES_UPDATE_EVENT: 'window:dailyPricesUpdate',
} as const;

export interface StocksStatus {
  count: number;
  lastSyncedAt: string | null;
}

export interface CredentialsStatus {
  configured: boolean;
}

export type {
  Market,
  StockRow,
  StrategyRow,
  StrategySignalRow,
  StrategyType,
  SystemLogRow,
  TossExchange,
  WatchlistGroupRow,
  WatchlistRow,
};
export type { MarketTick, WsSymbolRef };
export type { AddToWatchlistInput };
export type {
  AccountSummary,
  Holding,
  HoldingsSummary,
  Candle,
  CandleInterval,
  CandlesPage,
  PriceQuote,
  SignalNotification,
};
export type { CreateStrategyInput, UpdateStrategyInput };
export type { GetRankingsParams, RankingDuration, RankingItem, RankingResult, RankingType };
export type { PriceTargetParams };
export type { InvestorTradingFigure, InvestorTradingRecord };
export type {
  MarketIndicatorCandle,
  MarketIndicatorCandlesPage,
  MarketIndicatorPrice,
  MarketIndicatorSymbol,
};
export type { ExchangeRate, KrMarketCalendar };

// main/toss-api/endpoints/market.ts의 CANDLE_INTERVALS와 값이 반드시 일치해야 한다 — renderer는
// main의 런타임 코드를 import할 수 없어(타입만 공유 가능) 값 자체는 여기 다시 선언한다.
export const CANDLE_INTERVALS: Record<'ONE_MINUTE' | 'ONE_DAY', CandleInterval> = {
  ONE_MINUTE: '1m',
  ONE_DAY: '1d',
};

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
  getStocksBySymbols: (symbols: string[]) =>
    window.ipc.invoke<StockRow[]>(CHANNELS.STOCKS_GET_BY_SYMBOLS, symbols),
  getInvestorTrading: (symbol: string, params?: { count?: number; until?: string }) =>
    window.ipc.invoke<InvestorTradingRecord[]>(CHANNELS.STOCKS_INVESTOR_TRADING, symbol, params),

  getPrices: (symbols: string[]) => window.ipc.invoke<PriceQuote[]>(CHANNELS.MARKET_PRICES, symbols),
  getCandles: (params: { symbol: string; interval: CandleInterval; count?: number; before?: string }) =>
    window.ipc.invoke<CandlesPage>(CHANNELS.MARKET_CANDLES, params),

  getMarketIndicatorPrices: (symbols: MarketIndicatorSymbol[]) =>
    window.ipc.invoke<MarketIndicatorPrice[]>(CHANNELS.MARKET_INDICATOR_PRICES, symbols),
  getMarketIndicatorCandles: (params: {
    symbol: MarketIndicatorSymbol;
    interval: CandleInterval;
    count?: number;
    before?: string;
  }) => window.ipc.invoke<MarketIndicatorCandlesPage>(CHANNELS.MARKET_INDICATOR_CANDLES, params),
  getExchangeRate: (params: { baseCurrency: string; quoteCurrency: string; dateTime?: string }) =>
    window.ipc.invoke<ExchangeRate>(CHANNELS.EXCHANGE_RATE, params),
  getKrMarketCalendar: (date?: string) =>
    window.ipc.invoke<KrMarketCalendar>(CHANNELS.MARKET_CALENDAR_KR, date),

  listWatchlist: () => window.ipc.invoke<WatchlistRow[]>(CHANNELS.WATCHLIST_LIST),
  addToWatchlist: (input: AddToWatchlistInput) =>
    window.ipc.invoke<WatchlistRow>(CHANNELS.WATCHLIST_ADD, input),
  removeFromWatchlist: (groupId: number, symbol: string) =>
    window.ipc.invoke<void>(CHANNELS.WATCHLIST_REMOVE, groupId, symbol),
  reorderWatchlist: (groupId: number, symbols: string[]) =>
    window.ipc.invoke<void>(CHANNELS.WATCHLIST_REORDER, groupId, symbols),

  listWatchlistGroups: () => window.ipc.invoke<WatchlistGroupRow[]>(CHANNELS.WATCHLIST_GROUPS_LIST),
  createWatchlistGroup: (name: string) =>
    window.ipc.invoke<WatchlistGroupRow>(CHANNELS.WATCHLIST_GROUP_CREATE, name),
  renameWatchlistGroup: (id: number, name: string) =>
    window.ipc.invoke<void>(CHANNELS.WATCHLIST_GROUP_RENAME, id, name),
  deleteWatchlistGroup: (id: number) => window.ipc.invoke<void>(CHANNELS.WATCHLIST_GROUP_DELETE, id),

  getRankings: (params: GetRankingsParams) => window.ipc.invoke<RankingResult>(CHANNELS.RANKING_LIST, params),

  testNotification: () => window.ipc.invoke<void>(CHANNELS.NOTIFICATIONS_TEST),

  getCredentialsStatus: () => window.ipc.invoke<CredentialsStatus>(CHANNELS.SETTINGS_CREDENTIALS_STATUS),
  saveCredentials: (clientId: string, clientSecret: string) =>
    window.ipc.invoke<void>(CHANNELS.SETTINGS_SAVE_CREDENTIALS, clientId, clientSecret),

  subscribeMarket: (symbols: WsSymbolRef[]) => window.ipc.send(CHANNELS.MARKET_SUBSCRIBE, symbols),

  openChartWindow: (stock: ChartWindowStock) => window.ipc.send(CHANNELS.WINDOW_OPEN_CHART, stock),
  openDailyPricesWindow: (stock: ChartWindowStock) =>
    window.ipc.send(CHANNELS.WINDOW_OPEN_DAILY_PRICES, stock),

  relaunchApp: () => window.ipc.send(CHANNELS.APP_RELAUNCH),
};

export type { ChartWindowStock };

export function onStrategySignal(callback: (payload: SignalNotification) => void): () => void {
  return window.ipc.on<SignalNotification>(CHANNELS.STRATEGY_SIGNAL_EVENT, callback);
}

export function onMarketTick(callback: (tick: MarketTick) => void): () => void {
  return window.ipc.on<MarketTick>(CHANNELS.MARKET_TICK_EVENT, callback);
}

// 차트 팝업 창(chart-window.tsx)이 이미 떠 있는 상태에서 다른 종목을 클릭하면, 새 창을 여는 대신
// 이 이벤트로 같은 창의 표시 종목만 바꾼다.
export function onChartWindowUpdate(callback: (stock: ChartWindowStock) => void): () => void {
  return window.ipc.on<ChartWindowStock>(CHANNELS.WINDOW_CHART_UPDATE_EVENT, callback);
}

// 일별시세 팝업 창(daily-prices-window.tsx)이 이미 떠 있는 상태에서 다른 종목을 클릭하면, 새 창을
// 여는 대신 이 이벤트로 같은 창의 표시 종목만 바꾼다.
export function onDailyPricesWindowUpdate(callback: (stock: ChartWindowStock) => void): () => void {
  return window.ipc.on<ChartWindowStock>(CHANNELS.WINDOW_DAILY_PRICES_UPDATE_EVENT, callback);
}
