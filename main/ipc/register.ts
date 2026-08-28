import type { Kysely } from 'kysely';
import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import type { Database, TossExchange } from '../db/schema';
import {
  createStrategy,
  deleteStrategy,
  listStrategies,
  toggleStrategy,
  updateStrategy,
  type CreateStrategyInput,
  type UpdateStrategyInput,
} from '../db/repositories/strategies';
import { listRecentLogs } from '../db/repositories/logs';
import { listRecentSignals } from '../db/repositories/signals';
import { countStocks, getStocksBySymbols, searchStocks } from '../db/repositories/stocks';
import {
  addToWatchlist,
  createWatchlistGroup,
  deleteWatchlistGroup,
  listWatchlist,
  listWatchlistGroups,
  removeFromWatchlist,
  renameWatchlistGroup,
  reorderWatchlist,
  type AddToWatchlistInput,
} from '../db/repositories/watchlist';
import { logger } from '../logger';
import { notifySignal } from '../notify/notifier';
import { hasTossApiCredentials, saveTossApiCredentials } from '../toss-api/config';
import { testTossCredentials } from '../toss-api/credentials-test';
import { fetchAndCacheAccounts, getHoldings } from '../toss-api/endpoints/account';
import { getCandles, getPrices, type CandleInterval } from '../toss-api/endpoints/market';
import { getRankings, type GetRankingsParams } from '../toss-api/endpoints/ranking';
import { ensureStocksCached, getLastStocksSyncedAt } from '../toss-api/stock-cache';
import type { MarketTick, TossMarketWsClient, WsSymbolRef } from '../toss-api/ws-client';
import { IPC_CHANNELS } from './channels';

// 심볼별 최신 틱만 남겨뒀다가 이 주기로 한 번에 흘려보낸다 — 체결이 잦을 때 틱 하나마다
// IPC를 보내면 렌더러가 매번 리렌더링해야 해서 부하가 커진다(관심종목/보유종목 화면 실측
// 초당 20회 안팎). 버리지 않고 최신값만 유지하므로 화면에 표시되는 값이 밀리지는 않는다.
const TICK_FLUSH_INTERVAL_MS = 200;

// ipcMain.handle을 감싸서 실패를 항상 로그로 남긴다 — 그냥 ipcMain.handle을 쓰면 던져진
// 에러가 렌더러로는 전달되지만(그건 유지), main 프로세스 쪽(pino/system_logs)에는 아무 흔적도
// 안 남아서 DB/API 실패를 나중에 추적할 수 없다. 핸들러마다 try/catch를 반복하지 않도록
// 여기 한 곳에서 처리한다.
function handle<Args extends unknown[], R>(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: Args) => R | Promise<R>,
): void {
  ipcMain.handle(channel, async (event, ...args: Args) => {
    try {
      return await handler(event, ...args);
    } catch (err) {
      logger.error({ err, channel }, 'ipc handler failed');
      throw err;
    }
  });
}

export interface ChartWindowStock {
  symbol: string;
  name: string;
  market: TossExchange;
}

export function registerIpcHandlers(
  db: Kysely<Database>,
  wsClient?: TossMarketWsClient,
  openChartWindow?: (stock: ChartWindowStock) => void,
): void {
  handle(IPC_CHANNELS.ACCOUNTS_LIST, () => fetchAndCacheAccounts(db));

  handle(IPC_CHANNELS.ACCOUNTS_HOLDINGS, (_event, accountSeq: string) => getHoldings(db, accountSeq));

  handle(IPC_CHANNELS.STRATEGY_LIST, () => listStrategies(db));

  handle(IPC_CHANNELS.STRATEGY_CREATE, (_event, input: CreateStrategyInput) => createStrategy(db, input));

  handle(IPC_CHANNELS.STRATEGY_UPDATE, (_event, id: number, input: UpdateStrategyInput) =>
    updateStrategy(db, id, input),
  );

  handle(IPC_CHANNELS.STRATEGY_TOGGLE, (_event, id: number, isActive: boolean) =>
    toggleStrategy(db, id, isActive),
  );

  handle(IPC_CHANNELS.STRATEGY_DELETE, async (_event, id: number) => {
    await deleteStrategy(db, id);
  });

  handle(IPC_CHANNELS.SIGNALS_LIST, (_event, limit?: number) => listRecentSignals(db, limit));

  handle(IPC_CHANNELS.LOGS_LIST, (_event, limit?: number) => listRecentLogs(db, limit));

  handle(IPC_CHANNELS.STOCKS_SEARCH, (_event, query: string, limit?: number) =>
    searchStocks(db, query, limit),
  );

  handle(IPC_CHANNELS.STOCKS_STATUS, async () => {
    const [count, lastSyncedAt] = await Promise.all([countStocks(db), getLastStocksSyncedAt(db)]);
    return { count, lastSyncedAt };
  });

  handle(IPC_CHANNELS.STOCKS_REFRESH, async () => {
    await ensureStocksCached(db, true);
    const [count, lastSyncedAt] = await Promise.all([countStocks(db), getLastStocksSyncedAt(db)]);
    return { count, lastSyncedAt };
  });

  handle(IPC_CHANNELS.STOCKS_GET_BY_SYMBOLS, (_event, symbols: string[]) => getStocksBySymbols(db, symbols));

  handle(IPC_CHANNELS.MARKET_PRICES, (_event, symbols: string[]) => getPrices(db, symbols));

  handle(
    IPC_CHANNELS.MARKET_CANDLES,
    (_event, params: { symbol: string; interval: CandleInterval; count?: number; before?: string }) =>
      getCandles(db, params),
  );

  handle(IPC_CHANNELS.WATCHLIST_LIST, () => listWatchlist(db));

  handle(IPC_CHANNELS.WATCHLIST_ADD, (_event, input: AddToWatchlistInput) => addToWatchlist(db, input));

  handle(IPC_CHANNELS.WATCHLIST_REMOVE, async (_event, groupId: number, symbol: string) => {
    await removeFromWatchlist(db, groupId, symbol);
  });

  handle(IPC_CHANNELS.WATCHLIST_REORDER, async (_event, groupId: number, symbols: string[]) => {
    await reorderWatchlist(db, groupId, symbols);
  });

  handle(IPC_CHANNELS.WATCHLIST_GROUPS_LIST, () => listWatchlistGroups(db));

  handle(IPC_CHANNELS.WATCHLIST_GROUP_CREATE, (_event, name: string) => createWatchlistGroup(db, name));

  handle(IPC_CHANNELS.WATCHLIST_GROUP_RENAME, async (_event, id: number, name: string) => {
    await renameWatchlistGroup(db, id, name);
  });

  handle(IPC_CHANNELS.WATCHLIST_GROUP_DELETE, async (_event, id: number) => {
    await deleteWatchlistGroup(db, id);
  });

  handle(IPC_CHANNELS.RANKING_LIST, (_event, params: GetRankingsParams) => getRankings(db, params));

  handle(IPC_CHANNELS.SETTINGS_CREDENTIALS_STATUS, () => ({ configured: hasTossApiCredentials() }));

  handle(IPC_CHANNELS.SETTINGS_SAVE_CREDENTIALS, async (_event, clientId: string, clientSecret: string) => {
    await testTossCredentials(clientId, clientSecret);
    await saveTossApiCredentials(db, clientId, clientSecret);
  });

  // 자격증명이 새로 저장되면 전략엔진/시세 WS 클라이언트를 깨끗하게 다시 초기화해야 하는데, 이
  // 프로젝트는 아직 그 둘을 무중단으로 재시작하는 경로가 없다 — 앱을 통째로 재시작해 main.ts의
  // 부팅 로직이 새 자격증명으로 처음부터 다시 돌게 한다.
  ipcMain.on(IPC_CHANNELS.APP_RELAUNCH, () => {
    app.relaunch();
    app.exit();
  });

  // 여러 창(대시보드/시세 화면/차트 팝업)이 각자 자기 몫의 구독을 선언하는데, wsClient.setSymbols는
  // full-replace라 그냥 그대로 넘기면 나중에 도착한 창의 선언이 앞서 도착한 다른 창의 구독을
  // 지워버린다 — 창(sender)별로 최근 선언을 따로 들고 있다가 합쳐서 넘긴다.
  const subscriptionsBySender = new Map<number, WsSymbolRef[]>();
  const trackedSenderIds = new Set<number>();

  function pushMergedSubscription(): void {
    const merged = new Map<string, WsSymbolRef>();
    for (const refs of subscriptionsBySender.values()) {
      for (const ref of refs) merged.set(ref.symbol, ref);
    }
    wsClient?.setSymbols([...merged.values()]);
  }

  ipcMain.on(IPC_CHANNELS.MARKET_SUBSCRIBE, (event, symbols: WsSymbolRef[]) => {
    subscriptionsBySender.set(event.sender.id, symbols);
    if (!trackedSenderIds.has(event.sender.id)) {
      trackedSenderIds.add(event.sender.id);
      event.sender.once('destroyed', () => {
        subscriptionsBySender.delete(event.sender.id);
        trackedSenderIds.delete(event.sender.id);
        pushMergedSubscription();
      });
    }
    pushMergedSubscription();
  });

  ipcMain.on(IPC_CHANNELS.WINDOW_OPEN_CHART, (_event, stock: ChartWindowStock) => {
    openChartWindow?.(stock);
  });

  if (wsClient) {
    const latestTicksBySymbol = new Map<string, MarketTick>();

    wsClient.onTick((tick) => {
      // flush 주기(TICK_FLUSH_INTERVAL_MS) 안에 같은 심볼로 체결이 여러 번 오면 가격/시각은
      // 최신 것만 보내면 되지만, volume은 "이 체결 1건의 체결량"이라 그냥 덮어쓰면 그 사이에
      // 있었던 체결들의 거래량이 통째로 유실된다 — renderer가 당일 누적 거래량에 더할 수 있게
      // 이 flush 주기 안에서는 합산해서 보낸다.
      const prev = latestTicksBySymbol.get(tick.symbol);
      const volume = prev ? String(Number(prev.volume) + Number(tick.volume)) : tick.volume;
      latestTicksBySymbol.set(tick.symbol, { ...tick, volume });
    });

    setInterval(() => {
      if (latestTicksBySymbol.size === 0) return;
      const ticks = [...latestTicksBySymbol.values()];
      latestTicksBySymbol.clear();

      for (const win of BrowserWindow.getAllWindows()) {
        for (const tick of ticks) {
          win.webContents.send(IPC_CHANNELS.MARKET_TICK_EVENT, tick);
        }
      }
    }, TICK_FLUSH_INTERVAL_MS);
  }

  handle(IPC_CHANNELS.NOTIFICATIONS_TEST, () => {
    notifySignal({
      strategyName: '테스트 전략',
      symbol: 'TEST',
      market: 'KR',
      signal: 'BUY',
      price: 0,
      reason: '알림 테스트',
    });
  });
}
