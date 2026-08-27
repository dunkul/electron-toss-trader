import type { Generated } from 'kysely';

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

// kysely용 테이블 스키마. 위의 *Row 인터페이스들과 형태가 구조적으로 호환되도록
// 유지한다(repository 함수들이 여전히 *Row를 반환 타입으로 쓸 수 있게) — 컬럼을
// 추가/변경할 때는 양쪽을 같이 고친다.
export interface Database {
  accounts: {
    id: Generated<number>;
    account_seq: string;
    alias: string | null;
    account_type: string | null;
    created_at: Generated<string>;
  };
  oauth_tokens: {
    id: Generated<number>;
    access_token: string;
    token_type: string | null;
    expires_at: string;
    issued_at: Generated<string>;
  };
  strategies: {
    id: Generated<number>;
    name: string;
    symbol: string;
    market: Market;
    strategy_type: StrategyType;
    params_json: string;
    is_active: Generated<0 | 1>;
    cooldown_sec: Generated<number>;
    notify_desktop: Generated<0 | 1>;
    notify_sound: Generated<0 | 1>;
    created_at: Generated<string>;
    updated_at: Generated<string>;
  };
  strategy_signals: {
    id: Generated<number>;
    strategy_id: number;
    signal: Signal;
    reason: string | null;
    price: number | null;
    notified: Generated<0 | 1>;
    created_at: Generated<string>;
  };
  system_logs: {
    id: Generated<number>;
    level: LogLevel;
    source: LogSource;
    message: string;
    context_json: string | null;
    created_at: Generated<string>;
  };
  settings: {
    key: string;
    value: string | null;
  };
  stocks: {
    symbol: string;
    name: string;
    market: TossExchange;
    security_type: string;
    is_common_share: 0 | 1;
    isin_code: string | null;
    updated_at: Generated<string>;
  };
  watchlist_groups: {
    id: Generated<number>;
    name: string;
    sort_order: Generated<number>;
    created_at: Generated<string>;
  };
  watchlist: {
    id: Generated<number>;
    group_id: number;
    symbol: string;
    name: string;
    market: TossExchange;
    sort_order: Generated<number>;
    created_at: Generated<string>;
  };
}
