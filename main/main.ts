import 'dotenv/config';
import './env-setup';
import path from 'path';
import { app, Menu } from 'electron';
import serve from 'electron-serve';
import { createWindow } from './helpers/create-window';
import { closeDb, getDb } from './db/connection';
import { StrategyEngine } from './engine/scheduler';
import { registerIpcHandlers } from './ipc/register';
import { logger } from './logger';
import { hasTossApiCredentials } from './toss-api/config';
import { ensureStocksCached } from './toss-api/stock-cache';
import { TossMarketWsClient } from './toss-api/ws-client';

const isProd = process.env.NODE_ENV === 'production';

if (isProd) {
  serve({ directory: 'app' });
}

let wsClient: TossMarketWsClient | undefined;
let strategyEngine: StrategyEngine | undefined;

(async () => {
  await app.whenReady();

  const db = getDb();

  if (hasTossApiCredentials()) {
    strategyEngine = new StrategyEngine(db);
    strategyEngine.start();
    wsClient = new TossMarketWsClient(db);
    wsClient.start().catch((err: unknown) => logger.error({ err }, 'market ws client failed to start'));
    ensureStocksCached(db).catch((err: unknown) => logger.error({ err }, 'stock master sync failed'));
  } else {
    logger.warn('TOSS_CLIENT_ID/TOSS_CLIENT_SECRET가 설정되지 않아 전략 엔진을 시작하지 않았습니다.');
  }

  registerIpcHandlers(db, wsClient);

  Menu.setApplicationMenu(null);

  const mainWindow = createWindow('main', {
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.js'),
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  if (isProd) {
    await mainWindow.loadURL('app://./home');
  } else {
    const port = process.argv[2];
    await mainWindow.loadURL(`http://localhost:${port}/home`);
  }
})();

app.on('window-all-closed', () => {
  app.quit();
});

// 전략 엔진 타이머와 WS 연결을 정리하고 DB 핸들을 닫은 뒤 종료한다 — 없어도 프로세스 종료 시
// OS가 다 회수하긴 하지만, WS는 정상 종료 프레임 없이 그냥 끊기고 타이머는 clear 없이 죽는다.
app.on('before-quit', () => {
  strategyEngine?.stop();
  wsClient?.stop();
  closeDb().catch((err: unknown) => logger.error({ err }, 'failed to close db on quit'));
});
