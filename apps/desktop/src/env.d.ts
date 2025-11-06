export {};

declare global {
  interface Window {
    stina: {
      getCount: () => Promise<number>;
      increment: (by?: number) => Promise<number>;
      onCountChanged: (cb: (count: number) => void) => () => void;
      settings: {
        get: () => Promise<any>;
        updateProvider: (name: string, cfg: any) => Promise<any>;
        setActive: (name?: string) => Promise<any>;
      };
      mcp: {
        getServers: () => Promise<any>;
        upsertServer: (server: { name: string; url: string }) => Promise<any>;
        removeServer: (name: string) => Promise<any>;
        setDefault: (name?: string) => Promise<any>;
        listTools: (serverOrName?: string) => Promise<any>;
      };
      chat: {
        get: () => Promise<any[]>;
        newSession: () => Promise<any[]>;
        send: (text: string) => Promise<any>;
        cancel: (id: string) => Promise<boolean>;
        onChanged: (cb: (messages: any[]) => void) => () => void;
        onStream: (
          cb: (chunk: { id: string; delta?: string; done?: boolean; start?: boolean }) => void,
        ) => () => void;
      };
    };
  }
}
