import type { Kysely } from 'kysely';
import { BrowserWindow, ipcMain } from 'electron';
import type { Database } from '../db/schema';
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

export function registerIpcHandlers(db: Kysely<Database>, wsClient?: TossMarketWsClient): void {
  ipcMain.handle(IPC_CHANNELS.ACCOUNTS_LIST, async () => {
    try {
      return await fetchAndCacheAccounts(db);
    } catch (err) {
      logger.error({ err }, 'accounts:list failed');
      throw err;
    }
  });

  ipcMain.handle(IPC_CHANNELS.ACCOUNTS_HOLDINGS, async (_event, accountSeq: string) =>
    getHoldings(db, accountSeq),
  );

  ipcMain.handle(IPC_CHANNELS.STRATEGY_LIST, () => listStrategies(db));

  ipcMain.handle(IPC_CHANNELS.STRATEGY_CREATE, (_event, input: CreateStrategyInput) =>
    createStrategy(db, input),
  );

  ipcMain.handle(IPC_CHANNELS.STRATEGY_UPDATE, (_event, id: number, input: UpdateStrategyInput) =>
    updateStrategy(db, id, input),
  );

  ipcMain.handle(IPC_CHANNELS.STRATEGY_TOGGLE, (_event, id: number, isActive: boolean) =>
    toggleStrategy(db, id, isActive),
  );

  ipcMain.handle(IPC_CHANNELS.STRATEGY_DELETE, async (_event, id: number) => {
    await deleteStrategy(db, id);
  });

  ipcMain.handle(IPC_CHANNELS.SIGNALS_LIST, (_event, limit?: number) => listRecentSignals(db, limit));

  ipcMain.handle(IPC_CHANNELS.LOGS_LIST, (_event, limit?: number) => listRecentLogs(db, limit));

  ipcMain.handle(IPC_CHANNELS.STOCKS_SEARCH, (_event, query: string, limit?: number) =>
    searchStocks(db, query, limit),
  );

  ipcMain.handle(IPC_CHANNELS.STOCKS_STATUS, async () => {
    const [count, lastSyncedAt] = await Promise.all([countStocks(db), getLastStocksSyncedAt(db)]);
    return { count, lastSyncedAt };
  });

  ipcMain.handle(IPC_CHANNELS.STOCKS_REFRESH, async () => {
    await ensureStocksCached(db, true);
    const [count, lastSyncedAt] = await Promise.all([countStocks(db), getLastStocksSyncedAt(db)]);
    return { count, lastSyncedAt };
  });

  ipcMain.handle(IPC_CHANNELS.STOCKS_GET_BY_SYMBOLS, (_event, symbols: string[]) =>
    getStocksBySymbols(db, symbols),
  );

  ipcMain.handle(IPC_CHANNELS.MARKET_PRICES, (_event, symbols: string[]) => getPrices(db, symbols));

  ipcMain.handle(
    IPC_CHANNELS.MARKET_CANDLES,
    (_event, params: { symbol: string; interval: CandleInterval; count?: number; before?: string }) =>
      getCandles(db, params),
  );

  ipcMain.handle(IPC_CHANNELS.WATCHLIST_LIST, () => listWatchlist(db));

  ipcMain.handle(IPC_CHANNELS.WATCHLIST_ADD, (_event, input: AddToWatchlistInput) =>
    addToWatchlist(db, input),
  );

  ipcMain.handle(IPC_CHANNELS.WATCHLIST_REMOVE, async (_event, groupId: number, symbol: string) => {
    await removeFromWatchlist(db, groupId, symbol);
  });

  ipcMain.handle(IPC_CHANNELS.WATCHLIST_REORDER, async (_event, groupId: number, symbols: string[]) => {
    await reorderWatchlist(db, groupId, symbols);
  });

  ipcMain.handle(IPC_CHANNELS.WATCHLIST_GROUPS_LIST, () => listWatchlistGroups(db));

  ipcMain.handle(IPC_CHANNELS.WATCHLIST_GROUP_CREATE, (_event, name: string) =>
    createWatchlistGroup(db, name),
  );

  ipcMain.handle(IPC_CHANNELS.WATCHLIST_GROUP_RENAME, async (_event, id: number, name: string) => {
    await renameWatchlistGroup(db, id, name);
  });

  ipcMain.handle(IPC_CHANNELS.WATCHLIST_GROUP_DELETE, async (_event, id: number) => {
    await deleteWatchlistGroup(db, id);
  });

  ipcMain.handle(IPC_CHANNELS.RANKING_LIST, (_event, params: GetRankingsParams) => getRankings(db, params));

  ipcMain.on(IPC_CHANNELS.MARKET_SUBSCRIBE, (_event, symbols: WsSymbolRef[]) => {
    wsClient?.setSymbols(symbols);
  });

  if (wsClient) {
    const latestTicksBySymbol = new Map<string, MarketTick>();

    wsClient.onTick((tick) => {
      latestTicksBySymbol.set(tick.symbol, tick);
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

  ipcMain.handle(IPC_CHANNELS.NOTIFICATIONS_TEST, () => {
    notifySignal({
      strategyName: '테스트 전략',
      symbol: 'TEST',
      signal: 'BUY',
      price: 0,
      reason: '알림 테스트',
    });
  });
}
