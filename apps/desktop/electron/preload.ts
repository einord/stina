import electron from 'electron';
const { contextBridge, ipcRenderer } = electron;

contextBridge.exposeInMainWorld('stina', {
  getCount: () => ipcRenderer.invoke('get-count') as Promise<number>,
  increment: (by: number = 1) => ipcRenderer.invoke('increment', by) as Promise<number>,
  onCountChanged: (cb: (count: number) => void) => {
    const listener = (_: unknown, count: number) => cb(count);
    ipcRenderer.on('count-changed', listener);
    return () => ipcRenderer.off('count-changed', listener);
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<any>,
    updateProvider: (name: string, cfg: any) => ipcRenderer.invoke('settings:updateProvider', name, cfg) as Promise<any>,
    setActive: (name?: string) => ipcRenderer.invoke('settings:setActive', name) as Promise<any>,
  },
  chat: {
    get: () => ipcRenderer.invoke('chat:get') as Promise<any>,
    newSession: () => ipcRenderer.invoke('chat:newSession') as Promise<any>,
    send: (text: string) => ipcRenderer.invoke('chat:send', text) as Promise<any>,
    onChanged: (cb: (messages: any[]) => void) => {
      const listener = (_: unknown, msgs: any[]) => cb(msgs);
      ipcRenderer.on('chat-changed', listener);
      return () => ipcRenderer.off('chat-changed', listener);
    }
  },
});

export type PreloadAPI = typeof window & {
  stina: {
    getCount: () => Promise<number>;
    increment: (by?: number) => Promise<number>;
    onCountChanged: (cb: (count: number) => void) => () => void;
    settings: {
      get: () => Promise<any>;
      updateProvider: (name: string, cfg: any) => Promise<any>;
      setActive: (name?: string) => Promise<any>;
    }
  };
};
