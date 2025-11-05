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
});

export type PreloadAPI = typeof window & {
  stina: {
    getCount: () => Promise<number>;
    increment: (by?: number) => Promise<number>;
    onCountChanged: (cb: (count: number) => void) => () => void;
  };
};