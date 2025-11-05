export {};

declare global {
  interface Window {
    __TAURI__?: {
      invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
    };
  }
}
