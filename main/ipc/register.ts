import type { DatabaseSync } from 'node:sqlite';
import { BrowserWindow, ipcMain } from 'electron';
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
  type AddToWatchlistInput,
} from '../db/repositories/watchlist';
import { logger } from '../logger';
import { notifySignal } from '../notify/notifier';
import { fetchAndCacheAccounts, getHoldings } from '../toss-api/endpoints/account';
import { getCandles, getPrices, type CandleInterval } from '../toss-api/endpoints/market';
import { getRankings, type GetRankingsParams } from '../toss-api/endpoints/ranking';
import { ensureStocksCached, getLastStocksSyncedAt } from '../toss-api/stock-cache';
import type { TossMarketWsClient, WsSymbolRef } from '../toss-api/ws-client';
import { IPC_CHANNELS } from './channels';

export function registerIpcHandlers(db: DatabaseSync, wsClient?: TossMarketWsClient): void {
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

  ipcMain.handle(IPC_CHANNELS.STRATEGY_DELETE, (_event, id: number) => {
    deleteStrategy(db, id);
  });

  ipcMain.handle(IPC_CHANNELS.SIGNALS_LIST, (_event, limit?: number) => listRecentSignals(db, limit));

  ipcMain.handle(IPC_CHANNELS.LOGS_LIST, (_event, limit?: number) => listRecentLogs(db, limit));

  ipcMain.handle(IPC_CHANNELS.STOCKS_SEARCH, (_event, query: string, limit?: number) =>
    searchStocks(db, query, limit),
  );

  ipcMain.handle(IPC_CHANNELS.STOCKS_STATUS, () => ({
    count: countStocks(db),
    lastSyncedAt: getLastStocksSyncedAt(db),
  }));

  ipcMain.handle(IPC_CHANNELS.STOCKS_REFRESH, async () => {
    await ensureStocksCached(db, true);
    return { count: countStocks(db), lastSyncedAt: getLastStocksSyncedAt(db) };
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

  ipcMain.handle(IPC_CHANNELS.WATCHLIST_REMOVE, (_event, groupId: number, symbol: string) => {
    removeFromWatchlist(db, groupId, symbol);
  });

  ipcMain.handle(IPC_CHANNELS.WATCHLIST_GROUPS_LIST, () => listWatchlistGroups(db));

  ipcMain.handle(IPC_CHANNELS.WATCHLIST_GROUP_CREATE, (_event, name: string) =>
    createWatchlistGroup(db, name),
  );

  ipcMain.handle(IPC_CHANNELS.WATCHLIST_GROUP_RENAME, (_event, id: number, name: string) => {
    renameWatchlistGroup(db, id, name);
  });

  ipcMain.handle(IPC_CHANNELS.WATCHLIST_GROUP_DELETE, (_event, id: number) => {
    deleteWatchlistGroup(db, id);
  });

  ipcMain.handle(IPC_CHANNELS.RANKING_LIST, (_event, params: GetRankingsParams) => getRankings(db, params));

  ipcMain.on(IPC_CHANNELS.MARKET_SUBSCRIBE, (_event, symbols: WsSymbolRef[]) => {
    wsClient?.setSymbols(symbols);
  });

  wsClient?.onTick((tick) => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC_CHANNELS.MARKET_TICK_EVENT, tick);
    }
  });

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
