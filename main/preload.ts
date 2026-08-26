import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

const handler = {
  send<T>(channel: string, value?: T) {
    ipcRenderer.send(channel, value);
  },
  invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
    return ipcRenderer.invoke(channel, ...args);
  },
  on<T>(channel: string, callback: (...args: T[]) => void) {
    const subscription = (_event: IpcRendererEvent, ...args: T[]) => callback(...args);
    ipcRenderer.on(channel, subscription);

    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
};

contextBridge.exposeInMainWorld('ipc', handler);

export type IpcHandler = typeof handler;
