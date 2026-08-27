// renderer 쪽에서 window.ipc.invoke(...)로 호출하는 채널 이름의 단일 출처.
// renderer/lib/ipc.ts의 문자열과 반드시 일치해야 한다.
export const IPC_CHANNELS = {
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
  MARKET_PRICES: 'market:prices',
  MARKET_CANDLES: 'market:candles',
  WATCHLIST_LIST: 'watchlist:list',
  WATCHLIST_ADD: 'watchlist:add',
  WATCHLIST_REMOVE: 'watchlist:remove',
  WATCHLIST_GROUPS_LIST: 'watchlist-groups:list',
  WATCHLIST_GROUP_CREATE: 'watchlist-groups:create',
  WATCHLIST_GROUP_RENAME: 'watchlist-groups:rename',
  WATCHLIST_GROUP_DELETE: 'watchlist-groups:delete',
  RANKING_LIST: 'ranking:list',
  // renderer -> main (ipcRenderer.send, 응답 없음) — 실시간 구독할 종목 전체 목록을 매번 새로 선언(full-replace)
  MARKET_SUBSCRIBE: 'market:subscribe',
  // main -> renderer push 이벤트 (ipcMain.handle이 아니라 webContents.send로 발신)
  STRATEGY_SIGNAL_EVENT: 'strategy:signal',
  MARKET_TICK_EVENT: 'market:tick',
} as const;
