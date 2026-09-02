import 'dotenv/config';
import './env-setup';
import path from 'path';
import { app, BrowserWindow, Menu } from 'electron';
import serve from 'electron-serve';
import { createWindow } from './helpers/create-window';
import { registerSnapAnchor, registerSnapFollower } from './helpers/window-snap';
import { closeDb, getDb } from './db/connection';
import { getSetting } from './db/repositories/settings';
import { StrategyEngine } from './engine/scheduler';
import { IPC_CHANNELS } from './ipc/channels';
import {
  registerIpcHandlers,
  SETTINGS_KEY_TRADING_SUPPORT_ENABLED,
  type ChartWindowStock,
} from './ipc/register';
import { logger } from './logger';
import { hasTossApiCredentials, loadTossApiCredentials } from './toss-api/config';
import { fetchAndCacheAccounts } from './toss-api/endpoints/account';
import { ensureStocksCached } from './toss-api/stock-cache';
import { TossMarketWsClient } from './toss-api/ws-client';

// Windows는 알림(Notification)에 앱 이름/아이콘을 표시하려면 AppUserModelID가 필요하다 — 없으면
// 토스트에 실행 파일 이름(Electron)이 그대로 뜬다. electron-builder.yml의 appId와 값을 맞춘다.
if (process.platform === 'win32') {
  app.setAppUserModelId('kr.xingxing.toss-trader');
}

const isProd = process.env.NODE_ENV === 'production';
const devPort = process.argv[2];
// 패키징된 빌드는 electron-builder가 resources/icon.ico를 exe에 이미 심어두므로 별도 지정이 필요
// 없다. resources/ 디렉터리 자체가 배포 파일에 포함되지 않아 이 경로는 개발 모드에서만 존재한다.
const devIconPath = !isProd ? path.join(import.meta.dirname, '../resources/icon.ico') : undefined;

if (isProd) {
  serve({ directory: 'app' });
}

let wsClient: TossMarketWsClient | undefined;
let strategyEngine: StrategyEngine | undefined;

// 메인 창과 차트/일별시세/호가창 팝업 모두에서 F12로 개발자도구를 열 수 있게 한다.
function registerDevToolsToggle(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      win.webContents.toggleDevTools();
    }
  });
}

// 대시보드/시세 화면 등에서 종목을 클릭해 여는 차트 팝업 창 — 최대 하나만 유지한다. 이미 떠
// 있으면 새 창을 또 띄우는 대신 그 창을 포커스하고 표시 종목만 바꾼다(WINDOW_CHART_UPDATE_EVENT).
let chartWindow: BrowserWindow | null = null;
// 창 생성 직후(로딩 완료 전)에 다른 종목이 또 클릭되는 경우를 위한 큐 — chartWindow는
// createWindow() 직후 곧바로 할당되지만 페이지가 실제로 onChartWindowUpdate 리스너를 등록하기
// 전에 webContents.send()를 보내면 Electron IPC는 큐잉 없이 그 이벤트를 그냥 버린다. 그래서
// did-finish-load 전에는 여기 최신 요청만 남겨뒀다가, 로드가 끝난 뒤 한 번만 보낸다.
let chartWindowReady = false;
let pendingChartStock: ChartWindowStock | null = null;

async function openStockChartWindow(stock: ChartWindowStock): Promise<void> {
  if (chartWindow && !chartWindow.isDestroyed()) {
    chartWindow.focus();
    if (chartWindowReady) {
      chartWindow.webContents.send(IPC_CHANNELS.WINDOW_CHART_UPDATE_EVENT, stock);
    } else {
      pendingChartStock = stock;
    }
    return;
  }

  const win = createWindow('chart', {
    width: 900,
    height: 700,
    show: false,
    backgroundColor: '#ffffff',
    icon: devIconPath,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.js'),
    },
  });
  chartWindow = win;
  chartWindowReady = false;
  pendingChartStock = null;
  win.on('closed', () => {
    if (chartWindow === win) chartWindow = null;
  });
  win.once('ready-to-show', () => win.show());
  registerDevToolsToggle(win);
  win.webContents.once('did-finish-load', () => {
    chartWindowReady = true;
    if (pendingChartStock) {
      win.webContents.send(IPC_CHANNELS.WINDOW_CHART_UPDATE_EVENT, pendingChartStock);
      pendingChartStock = null;
    }
  });
  registerSnapFollower(win);

  const query = new URLSearchParams({
    symbol: stock.symbol,
    name: stock.name,
    market: stock.market,
  }).toString();
  if (isProd) {
    await win.loadURL(`app://./chart-window?${query}`);
  } else {
    await win.loadURL(`http://localhost:${devPort}/chart-window?${query}`);
  }
}

// 차트 팝업과 같은 구조의 일별시세 팝업 창 — 최대 하나만 유지하고, 이미 떠 있으면 포커스 후
// 표시 종목만 바꾼다.
let dailyPricesWindow: BrowserWindow | null = null;
let dailyPricesWindowReady = false;
let pendingDailyPricesStock: ChartWindowStock | null = null;

async function openDailyPricesWindow(stock: ChartWindowStock): Promise<void> {
  if (dailyPricesWindow && !dailyPricesWindow.isDestroyed()) {
    dailyPricesWindow.focus();
    if (dailyPricesWindowReady) {
      dailyPricesWindow.webContents.send(IPC_CHANNELS.WINDOW_DAILY_PRICES_UPDATE_EVENT, stock);
    } else {
      pendingDailyPricesStock = stock;
    }
    return;
  }

  const win = createWindow('daily-prices', {
    width: 480,
    height: 720,
    show: false,
    backgroundColor: '#ffffff',
    icon: devIconPath,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.js'),
    },
  });
  dailyPricesWindow = win;
  dailyPricesWindowReady = false;
  pendingDailyPricesStock = null;
  win.on('closed', () => {
    if (dailyPricesWindow === win) dailyPricesWindow = null;
  });
  win.once('ready-to-show', () => win.show());
  registerDevToolsToggle(win);
  win.webContents.once('did-finish-load', () => {
    dailyPricesWindowReady = true;
    if (pendingDailyPricesStock) {
      win.webContents.send(IPC_CHANNELS.WINDOW_DAILY_PRICES_UPDATE_EVENT, pendingDailyPricesStock);
      pendingDailyPricesStock = null;
    }
  });
  registerSnapFollower(win);

  const query = new URLSearchParams({
    symbol: stock.symbol,
    name: stock.name,
    market: stock.market,
  }).toString();
  if (isProd) {
    await win.loadURL(`app://./daily-prices-window?${query}`);
  } else {
    await win.loadURL(`http://localhost:${devPort}/daily-prices-window?${query}`);
  }
}

// 차트 등 다른 팝업에서 종목을 클릭했을 때, 일별시세 창이 이미 떠 있다면 그 창도 같은 종목으로
// 맞춰준다. 안 떠 있으면 아무것도 하지 않는다 — 사용자가 연 적 없는 창을 이 클릭으로 새로
// 띄우면 안 되므로(그 경우는 openDailyPricesWindow 쪽 몫이다).
function syncDailyPricesWindowIfOpen(stock: ChartWindowStock): void {
  if (!dailyPricesWindow || dailyPricesWindow.isDestroyed()) return;
  if (dailyPricesWindowReady) {
    dailyPricesWindow.webContents.send(IPC_CHANNELS.WINDOW_DAILY_PRICES_UPDATE_EVENT, stock);
  } else {
    pendingDailyPricesStock = stock;
  }
}

// 차트/일별시세 팝업과 같은 구조의 호가창 팝업 창 — 최대 하나만 유지하고, 이미 떠 있으면
// 포커스 후 표시 종목만 바꾼다.
let orderbookWindow: BrowserWindow | null = null;
let orderbookWindowReady = false;
let pendingOrderbookStock: ChartWindowStock | null = null;

async function openOrderbookWindow(stock: ChartWindowStock): Promise<void> {
  if (orderbookWindow && !orderbookWindow.isDestroyed()) {
    orderbookWindow.focus();
    if (orderbookWindowReady) {
      orderbookWindow.webContents.send(IPC_CHANNELS.WINDOW_ORDERBOOK_UPDATE_EVENT, stock);
    } else {
      pendingOrderbookStock = stock;
    }
    return;
  }

  // 매매지원이 켜져 있으면 호가 래더 옆에 거래화면(TradingPanel)이 붙어 폭이 670px보다
  // 좁아지면 레이아웃이 깨진다 — 창을 그 아래로 줄일 수 없게 최소 폭을 고정한다.
  const tradingSupportEnabled =
    (await getSetting(getDb(), SETTINGS_KEY_TRADING_SUPPORT_ENABLED)) === '1';

  const win = createWindow('orderbook', {
    width: 720,
    height: 800,
    minWidth: tradingSupportEnabled ? 680 : undefined,
    show: false,
    backgroundColor: '#ffffff',
    icon: devIconPath,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.js'),
    },
  });
  orderbookWindow = win;
  orderbookWindowReady = false;
  pendingOrderbookStock = null;
  win.on('closed', () => {
    if (orderbookWindow === win) orderbookWindow = null;
  });
  win.once('ready-to-show', () => win.show());
  registerDevToolsToggle(win);
  win.webContents.once('did-finish-load', () => {
    orderbookWindowReady = true;
    if (pendingOrderbookStock) {
      win.webContents.send(IPC_CHANNELS.WINDOW_ORDERBOOK_UPDATE_EVENT, pendingOrderbookStock);
      pendingOrderbookStock = null;
    }
  });
  registerSnapFollower(win);

  const query = new URLSearchParams({
    symbol: stock.symbol,
    name: stock.name,
    market: stock.market,
  }).toString();
  if (isProd) {
    await win.loadURL(`app://./orderbook-window?${query}`);
  } else {
    await win.loadURL(`http://localhost:${devPort}/orderbook-window?${query}`);
  }
}

// syncDailyPricesWindowIfOpen과 같은 목적 — 호가창이 이미 떠 있을 때만 표시 종목을 맞춰준다.
function syncOrderbookWindowIfOpen(stock: ChartWindowStock): void {
  if (!orderbookWindow || orderbookWindow.isDestroyed()) return;
  if (orderbookWindowReady) {
    orderbookWindow.webContents.send(IPC_CHANNELS.WINDOW_ORDERBOOK_UPDATE_EVENT, stock);
  } else {
    pendingOrderbookStock = stock;
  }
}

// 시세/차트 페이지는 페이지 안에 이미 차트(ChartCard)가 있어 차트 팝업이 중복이므로, 그 페이지에
// 진입할 때 호출해 팝업이 떠 있으면 닫는다. 일별시세/호가창 팝업은 그 페이지에 없는 기능이라
// 대상이 아니다.
function closeChartWindowIfOpen(): void {
  if (chartWindow && !chartWindow.isDestroyed()) chartWindow.close();
}

(async () => {
  await app.whenReady();

  const db = getDb();
  await loadTossApiCredentials(db);

  if (hasTossApiCredentials()) {
    strategyEngine = new StrategyEngine(db);
    strategyEngine.start();
    wsClient = new TossMarketWsClient(db);
    wsClient.start().catch((err: unknown) => logger.error({ err }, 'market ws client failed to start'));
    // 계좌 주문 체결 알림(personal:order)은 이 앱이 주문을 내지 않아도(토스증권 앱 등 다른
    // 채널의 주문 포함) 항상 받는다 — 매매지원 토글과 무관하게 부팅 시 한 번만 구독을 선언한다.
    fetchAndCacheAccounts(db)
      .then((accounts) => wsClient?.setOrderAccounts(accounts.map((account) => String(account.accountSeq))))
      .catch((err: unknown) => logger.error({ err }, 'failed to load accounts for order-event subscription'));
    ensureStocksCached(db).catch((err: unknown) => logger.error({ err }, 'stock master sync failed'));
  } else {
    logger.warn('TOSS_CLIENT_ID/TOSS_CLIENT_SECRET가 설정되지 않아 전략 엔진을 시작하지 않았습니다.');
  }

  registerIpcHandlers(
    db,
    wsClient,
    (stock) => {
      openStockChartWindow(stock).catch((err: unknown) =>
        logger.error({ err, stock }, 'failed to open chart window'),
      );
    },
    (stock) => {
      openDailyPricesWindow(stock).catch((err: unknown) =>
        logger.error({ err, stock }, 'failed to open daily prices window'),
      );
    },
    (stock) => {
      openOrderbookWindow(stock).catch((err: unknown) =>
        logger.error({ err, stock }, 'failed to open orderbook window'),
      );
    },
    (stock) => syncDailyPricesWindowIfOpen(stock),
    (stock) => syncOrderbookWindowIfOpen(stock),
    () => closeChartWindowIfOpen(),
  );

  Menu.setApplicationMenu(null);

  const mainWindow = createWindow('main', {
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: '#ffffff',
    icon: devIconPath,
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.js'),
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });
  registerSnapAnchor(mainWindow);

  // 메인 윈도우를 닫으면 차트/일별시세 팝업 창도 함께 닫는다 — 안 그러면 팝업만 남아
  // window-all-closed가 발생하지 않아 프로그램이 완전히 종료되지 않는다.
  mainWindow.on('close', () => {
    if (chartWindow && !chartWindow.isDestroyed()) chartWindow.close();
    if (dailyPricesWindow && !dailyPricesWindow.isDestroyed()) dailyPricesWindow.close();
    if (orderbookWindow && !orderbookWindow.isDestroyed()) orderbookWindow.close();
  });

  registerDevToolsToggle(mainWindow);

  if (isProd) {
    await mainWindow.loadURL('app://./home');
  } else {
    await mainWindow.loadURL(`http://localhost:${devPort}/home`);
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
