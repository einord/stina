import { EventEmitter } from 'node:events';

export type WarningKind = 'tools-disabled';
export interface WarningEvent {
  type: WarningKind;
  message: string;
}

const emitter = new EventEmitter();

export function emitWarning(event: WarningEvent): void {
  emitter.emit('warning', event);
}

export function onWarning(listener: (event: WarningEvent) => void): () => void {
  emitter.on('warning', listener);
  return () => emitter.off('warning', listener);
}
