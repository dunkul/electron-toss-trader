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
