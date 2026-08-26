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
import { logger } from '../logger';
import { notifySignal } from '../notify/notifier';
import { fetchAndCacheAccounts, getHoldings } from '../toss-api/endpoints/account';

export function registerIpcHandlers(db: DatabaseSync): void {
  ipcMain.handle('accounts:list', async () => {
    try {
      return await fetchAndCacheAccounts(db);
    } catch (err) {
      logger.error({ err }, 'accounts:list failed');
      throw err;
    }
  });

  ipcMain.handle('accounts:holdings', async (_event, accountSeq: string) => getHoldings(db, accountSeq));

  ipcMain.handle('strategy:list', () => listStrategies(db));

  ipcMain.handle('strategy:create', (_event, input: CreateStrategyInput) => createStrategy(db, input));

  ipcMain.handle('strategy:update', (_event, id: number, input: UpdateStrategyInput) =>
    updateStrategy(db, id, input),
  );

  ipcMain.handle('strategy:toggle', (_event, id: number, isActive: boolean) =>
    toggleStrategy(db, id, isActive),
  );

  ipcMain.handle('strategy:delete', (_event, id: number) => {
    deleteStrategy(db, id);
  });

  ipcMain.handle('signals:list', (_event, limit?: number) => listRecentSignals(db, limit));

  ipcMain.handle('logs:list', (_event, limit?: number) => listRecentLogs(db, limit));

  ipcMain.handle('notifications:test', () => {
    notifySignal({
      strategyName: '테스트 전략',
      symbol: 'TEST',
      signal: 'BUY',
      price: 0,
      reason: '알림 테스트',
    });
  });
}
