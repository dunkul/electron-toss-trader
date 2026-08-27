import type { Generated, Selectable } from 'kysely';

export type Market = 'KR' | 'US';
export type StrategyType = 'MA_CROSS' | 'RSI' | 'PRICE_TARGET' | 'GRID';
export type Signal = 'BUY' | 'SELL' | 'HOLD';
export type LogLevel = 'INFO' | 'WARN' | 'ERROR';
export type LogSource = 'api' | 'ws' | 'engine' | 'ui';

// GET /api/v1/stocks/all의 market 쿼리 파라미터 값 (거래소 단위, Market보다 세분화됨)
export type TossExchange = 'KOSPI' | 'KOSDAQ' | 'NYSE' | 'NASDAQ' | 'AMEX' | 'KR_ETC' | 'US_ETC';

// kysely용 테이블 스키마. 이게 유일한 소스이고, 아래 *Row 타입들은 전부 여기서 파생된다 —
// 컬럼을 추가/변경할 때 여기 한 곳만 고치면 된다.
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

export type AccountRow = Selectable<Database['accounts']>;
export type OAuthTokenRow = Selectable<Database['oauth_tokens']>;
export type StrategyRow = Selectable<Database['strategies']>;
export type StrategySignalRow = Selectable<Database['strategy_signals']>;
export type SystemLogRow = Selectable<Database['system_logs']>;
export type SettingRow = Selectable<Database['settings']>;
export type StockRow = Selectable<Database['stocks']>;
export type WatchlistGroupRow = Selectable<Database['watchlist_groups']>;
export type WatchlistRow = Selectable<Database['watchlist']>;
