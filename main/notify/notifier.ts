import { BrowserWindow, Notification } from 'electron';
import type { Market, Signal } from '../db/schema';
import { IPC_CHANNELS } from '../ipc/channels';
import { formatPriceWithUnit } from '../lib/currency';

export interface SignalNotification {
  strategyName: string;
  symbol: string;
  market: Market;
  signal: Signal;
  price?: number;
  reason?: string;
}

export function notifySignal(payload: SignalNotification): void {
  const title = `[${payload.signal}] ${payload.strategyName}`;
  const bodyParts = [payload.symbol];
  if (payload.price !== undefined) bodyParts.push(formatPriceWithUnit(payload.price, payload.market));
  if (payload.reason) bodyParts.push(payload.reason);

  if (Notification.isSupported()) {
    new Notification({ title, body: bodyParts.join(' · ') }).show();
  }

  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.STRATEGY_SIGNAL_EVENT, payload);
  }
}

// event는 FILL(전량체결)/PARTIAL_FILL(부분체결)만 전달한다 — PENDING/CANCELED 등 나머지
// 주문 이벤트는 이 앱이 직접 낸 주문이 아니어도(토스증권 앱 등 다른 채널의 주문 포함) 너무
// 잦게 울릴 수 있어 알림 대상에서 제외했다.
export interface OrderFillNotification {
  event: 'FILL' | 'PARTIAL_FILL';
  symbol: string;
  side: string;
  orderId: string;
  filledQuantity: string;
  averageFilledPrice: string | null;
  currency: string;
}

export function notifyOrderFill(payload: OrderFillNotification): void {
  const sideLabel = payload.side === 'BUY' ? '매수' : '매도';
  const eventLabel = payload.event === 'FILL' ? '전량체결' : '부분체결';
  const title = `[${eventLabel}] ${payload.symbol} ${sideLabel}`;
  const bodyParts = [`${Number(payload.filledQuantity).toLocaleString()}주`];
  if (payload.averageFilledPrice !== null) {
    const price = Number(payload.averageFilledPrice).toLocaleString();
    bodyParts.push(`@ ${payload.currency === 'USD' ? `$${price}` : `${price}원`}`);
  }

  if (Notification.isSupported()) {
    new Notification({ title, body: bodyParts.join(' ') }).show();
  }

  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.ORDER_FILL_EVENT, payload);
  }
}
