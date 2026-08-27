export type Market = 'KR' | 'US';
export type StrategyType = 'MA_CROSS' | 'RSI' | 'PRICE_TARGET' | 'GRID';
export type Signal = 'BUY' | 'SELL' | 'HOLD';
export type LogLevel = 'INFO' | 'WARN' | 'ERROR';
export type LogSource = 'api' | 'ws' | 'engine' | 'ui';

// GET /api/v1/stocks/all의 market 쿼리 파라미터 값 (거래소 단위, Market보다 세분화됨)
export type TossExchange = 'KOSPI' | 'KOSDAQ' | 'NYSE' | 'NASDAQ' | 'AMEX' | 'KR_ETC' | 'US_ETC';

export interface AccountRow {
  id: number;
  account_seq: string;
  alias: string | null;
  account_type: string | null;
  created_at: string;
}

export interface OAuthTokenRow {
  id: number;
  access_token: string;
  token_type: string | null;
  expires_at: string;
  issued_at: string;
}

export interface StrategyRow {
  id: number;
  name: string;
  symbol: string;
  market: Market;
  strategy_type: StrategyType;
  params_json: string;
  is_active: 0 | 1;
  cooldown_sec: number;
  notify_desktop: 0 | 1;
  notify_sound: 0 | 1;
  created_at: string;
  updated_at: string;
}

export interface StrategySignalRow {
  id: number;
  strategy_id: number;
  signal: Signal;
  reason: string | null;
  price: number | null;
  notified: 0 | 1;
  created_at: string;
}

export interface SystemLogRow {
  id: number;
  level: LogLevel;
  source: LogSource;
  message: string;
  context_json: string | null;
  created_at: string;
}

export interface SettingRow {
  key: string;
  value: string | null;
}

export interface StockRow {
  symbol: string;
  name: string;
  market: TossExchange;
  security_type: string;
  is_common_share: 0 | 1;
  isin_code: string | null;
  updated_at: string;
}

export interface WatchlistGroupRow {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface WatchlistRow {
  id: number;
  group_id: number;
  symbol: string;
  name: string;
  market: TossExchange;
  sort_order: number;
  created_at: string;
}
