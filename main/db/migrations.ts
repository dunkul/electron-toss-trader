export interface Migration {
  version: number;
  name: string;
  sql: string;
}

// 1차 개발 범위 테이블만 포함한다. orders/executions은 2차 착수 시 새 마이그레이션으로 추가한다.
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'init',
    sql: `
      CREATE TABLE accounts (
        id INTEGER PRIMARY KEY,
        account_seq TEXT UNIQUE NOT NULL,
        alias TEXT,
        account_type TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE oauth_tokens (
        id INTEGER PRIMARY KEY,
        access_token TEXT NOT NULL,
        token_type TEXT,
        expires_at TEXT NOT NULL,
        issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE strategies (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        symbol TEXT NOT NULL,
        market TEXT NOT NULL,
        strategy_type TEXT NOT NULL,
        params_json TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        cooldown_sec INTEGER NOT NULL DEFAULT 300,
        notify_desktop INTEGER NOT NULL DEFAULT 1,
        notify_sound INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE strategy_signals (
        id INTEGER PRIMARY KEY,
        strategy_id INTEGER NOT NULL REFERENCES strategies(id),
        signal TEXT NOT NULL,
        reason TEXT,
        price REAL,
        notified INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_strategy_signals_strategy_id ON strategy_signals(strategy_id);

      CREATE TABLE system_logs (
        id INTEGER PRIMARY KEY,
        level TEXT NOT NULL,
        source TEXT NOT NULL,
        message TEXT NOT NULL,
        context_json TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `,
  },
  {
    // GET /api/v1/stocks/all은 하루 배치로만 갱신되는 저변동 데이터라 API 문서가
    // 1일 1회 조회 후 로컬 캐싱을 권장한다. 종목 검색용 마스터 캐시 테이블.
    version: 2,
    name: 'stocks_cache',
    sql: `
      CREATE TABLE stocks (
        symbol TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        market TEXT NOT NULL,
        security_type TEXT NOT NULL,
        is_common_share INTEGER NOT NULL DEFAULT 1,
        isin_code TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_stocks_market ON stocks(market);
      CREATE INDEX idx_stocks_name ON stocks(name);
    `,
  },
  {
    // 시세/차트 화면에서 사용자가 저장/삭제하는 관심종목(워치리스트).
    version: 3,
    name: 'watchlist',
    sql: `
      CREATE TABLE watchlist (
        id INTEGER PRIMARY KEY,
        symbol TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        market TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    // 관심종목을 탭(그룹)으로 분류 관리할 수 있도록 재구성. 기존 관심종목 데이터는 전부
    // 초기화하고, 기본 탭 "기본1"에 삼성전자/SK하이닉스 두 종목을 시드로 채워 넣는다.
    // ("내 보유종목" 탭은 DB에 저장되지 않는 고정 탭으로, 렌더러에서 홀딩스 API로 구성한다.)
    version: 4,
    name: 'watchlist_groups',
    sql: `
      DROP TABLE watchlist;

      CREATE TABLE watchlist_groups (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE watchlist (
        id INTEGER PRIMARY KEY,
        group_id INTEGER NOT NULL REFERENCES watchlist_groups(id) ON DELETE CASCADE,
        symbol TEXT NOT NULL,
        name TEXT NOT NULL,
        market TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (group_id, symbol)
      );

      CREATE INDEX idx_watchlist_group_id ON watchlist(group_id);

      INSERT INTO watchlist_groups (name, sort_order) VALUES ('기본1', 0);

      INSERT INTO watchlist (group_id, symbol, name, market, sort_order)
        SELECT id, '005930', '삼성전자', 'KOSPI', 0 FROM watchlist_groups WHERE name = '기본1';

      INSERT INTO watchlist (group_id, symbol, name, market, sort_order)
        SELECT id, '000660', 'SK하이닉스', 'KOSPI', 1 FROM watchlist_groups WHERE name = '기본1';
    `,
  },
];
