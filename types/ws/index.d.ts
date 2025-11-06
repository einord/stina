import { EventEmitter } from 'node:events';

declare module 'ws' {
  export type RawData = string | Buffer | ArrayBuffer | Buffer[];

  export default class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    readonly readyState: number;
    constructor(address: string, options?: Record<string, unknown>);
    once(event: 'open', listener: () => void): this;
    once(event: 'error', listener: (err: Error) => void): this;
    on(event: 'message', listener: (data: RawData) => void): this;
    send(data: string | Buffer): void;
    close(): void;
  }
}
