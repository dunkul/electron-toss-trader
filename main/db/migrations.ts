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
];
