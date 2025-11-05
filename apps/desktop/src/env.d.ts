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
      }
    };
  }
}