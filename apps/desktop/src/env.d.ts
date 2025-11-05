export {};

declare global {
  interface Window {
    stina: {
      getCount: () => Promise<number>;
      increment: (by?: number) => Promise<number>;
      onCountChanged: (cb: (count: number) => void) => () => void;
    };
  }
}