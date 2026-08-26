import type { DatabaseSync } from 'node:sqlite';
import { ipcMain } from 'electron';
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
import { countStocks, searchStocks } from '../db/repositories/stocks';
import { logger } from '../logger';
import { notifySignal } from '../notify/notifier';
import { fetchAndCacheAccounts, getHoldings } from '../toss-api/endpoints/account';
import { ensureStocksCached, getLastStocksSyncedAt } from '../toss-api/stock-cache';
import { IPC_CHANNELS } from './channels';

export function registerIpcHandlers(db: DatabaseSync): void {
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
