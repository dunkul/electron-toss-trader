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
  STOCKS_INVESTOR_TRADING: 'stocks:investorTrading',
  MARKET_PRICES: 'market:prices',
  MARKET_CANDLES: 'market:candles',
  MARKET_INDICATOR_PRICES: 'market:indicatorPrices',
  MARKET_INDICATOR_CANDLES: 'market:indicatorCandles',
  EXCHANGE_RATE: 'market:exchangeRate',
  MARKET_CALENDAR_KR: 'market:calendarKr',
  MARKET_ORDERBOOK: 'market:orderbook',
  ORDER_INFO_BUYING_POWER: 'orderInfo:buyingPower',
  ORDER_INFO_SELLABLE_QUANTITY: 'orderInfo:sellableQuantity',
  ORDERS_CREATE: 'orders:create',
  ORDERS_LIST_HISTORY: 'orders:listHistory',
  ORDERS_MODIFY: 'orders:modify',
  ORDERS_CANCEL: 'orders:cancel',
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
  SETTINGS_TRADING_SUPPORT_STATUS: 'settings:tradingSupportStatus',
  SETTINGS_SET_TRADING_SUPPORT: 'settings:setTradingSupport',
  // renderer -> main (ipcRenderer.send, 응답 없음) — 실시간 구독할 종목 전체 목록을 매번 새로 선언(full-replace)
  MARKET_SUBSCRIBE: 'market:subscribe',
  // renderer -> main (ipcRenderer.send, 응답 없음) — 호가창 팝업이 실시간 호가를 구독할 종목을 선언(full-replace)
  MARKET_SUBSCRIBE_ORDERBOOK: 'market:subscribeOrderbook',
  // renderer -> main (ipcRenderer.send, 응답 없음) — 종목 차트를 별도 창으로 띄운다
  WINDOW_OPEN_CHART: 'window:openChart',
  // renderer -> main (ipcRenderer.send, 응답 없음) — 종목 일별시세를 별도 창으로 띄운다
  WINDOW_OPEN_DAILY_PRICES: 'window:openDailyPrices',
  // renderer -> main (ipcRenderer.send, 응답 없음) — 종목 호가창(+ 매매지원 활성 시 거래화면)을
  // 별도 창으로 띄운다
  WINDOW_OPEN_ORDERBOOK: 'window:openOrderbook',
  // renderer -> main (ipcRenderer.send, 응답 없음) — 자격증명 저장 후 전략엔진/WS 클라이언트를
  // 깨끗하게 다시 초기화하기 위해 앱을 재시작한다
  APP_RELAUNCH: 'app:relaunch',
  // main -> renderer push 이벤트 (ipcMain.handle이 아니라 webContents.send로 발신)
  STRATEGY_SIGNAL_EVENT: 'strategy:signal',
  MARKET_TICK_EVENT: 'market:tick',
  MARKET_ORDERBOOK_TICK_EVENT: 'market:orderbookTick',
  // 본인 계좌 주문이 체결(전량/부분)됐을 때 push — realtime-order WS 채널을 받아서 쏜다
  ORDER_FILL_EVENT: 'order:fill',
  // 차트 팝업 창이 이미 떠 있을 때, 그 창에 다른 종목을 새로 보여주라고 알리는 이벤트
  WINDOW_CHART_UPDATE_EVENT: 'window:chartUpdate',
  // 일별시세 팝업 창이 이미 떠 있을 때, 그 창에 다른 종목을 새로 보여주라고 알리는 이벤트
  WINDOW_DAILY_PRICES_UPDATE_EVENT: 'window:dailyPricesUpdate',
  // 호가창 팝업 창이 이미 떠 있을 때, 그 창에 다른 종목을 새로 보여주라고 알리는 이벤트
  WINDOW_ORDERBOOK_UPDATE_EVENT: 'window:orderbookUpdate',
} as const;
