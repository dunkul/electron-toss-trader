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
  MARKET_PRICES: 'market:prices',
  MARKET_CANDLES: 'market:candles',
  // main -> renderer push 이벤트 (ipcMain.handle이 아니라 webContents.send로 발신)
  STRATEGY_SIGNAL_EVENT: 'strategy:signal',
} as const;
