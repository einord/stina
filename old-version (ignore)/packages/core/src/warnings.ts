import { EventEmitter } from 'node:events';

export type WarningKind = 'tools-disabled';
export interface WarningEvent {
  type: WarningKind;
  message: string;
}

const emitter = new EventEmitter();

/**
 * Emits a warning event so interested parties (like ChatManager) can react.
 * Use this from anywhere a provider or tool detects a configuration issue.
 */
export function emitWarning(event: WarningEvent): void {
  emitter.emit('warning', event);
}

/**
 * Subscribes to warning events, returning an unsubscribe helper.
 * Call this in consumers that display warnings to users.
 * @param listener Callback invoked for each warning.
 */
export function onWarning(listener: (event: WarningEvent) => void): () => void {
  emitter.on('warning', listener);
  return () => emitter.off('warning', listener);
}
