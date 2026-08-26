import { BrowserWindow, Notification } from 'electron';
import type { Signal } from '../db/schema';
import { IPC_CHANNELS } from '../ipc/channels';

export interface SignalNotification {
  strategyName: string;
  symbol: string;
  signal: Signal;
  price?: number;
  reason?: string;
}

export function notifySignal(payload: SignalNotification): void {
  const title = `[${payload.signal}] ${payload.strategyName}`;
  const bodyParts = [payload.symbol];
  if (payload.price !== undefined) bodyParts.push(`${payload.price.toLocaleString()}원`);
  if (payload.reason) bodyParts.push(payload.reason);

  if (Notification.isSupported()) {
    new Notification({ title, body: bodyParts.join(' · ') }).show();
  }

  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(IPC_CHANNELS.STRATEGY_SIGNAL_EVENT, payload);
  }
}
