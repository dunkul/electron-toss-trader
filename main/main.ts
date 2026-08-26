import 'dotenv/config';
import './env-setup';
import path from 'path';
import { app } from 'electron';
import serve from 'electron-serve';
import { createWindow } from './helpers/create-window';
import { getDb } from './db/connection';
import { StrategyEngine } from './engine/scheduler';
import { registerIpcHandlers } from './ipc/register';
import { logger } from './logger';
import { hasTossApiCredentials } from './toss-api/config';
import { ensureStocksCached } from './toss-api/stock-cache';

const isProd = process.env.NODE_ENV === 'production';

if (isProd) {
  serve({ directory: 'app' });
}

(async () => {
  await app.whenReady();

  const db = getDb();
  registerIpcHandlers(db);

  if (hasTossApiCredentials()) {
    new StrategyEngine(db).start();
    ensureStocksCached(db).catch((err: unknown) => logger.error({ err }, 'stock master sync failed'));
  } else {
    logger.warn('TOSS_CLIENT_ID/TOSS_CLIENT_SECRET가 설정되지 않아 전략 엔진을 시작하지 않았습니다.');
  }

  const mainWindow = createWindow('main', {
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.js'),
    },
  });

  if (isProd) {
    await mainWindow.loadURL('app://./home');
  } else {
    const port = process.argv[2];
    await mainWindow.loadURL(`http://localhost:${port}/home`);
    mainWindow.webContents.openDevTools();
  }
})();

app.on('window-all-closed', () => {
  app.quit();
});
