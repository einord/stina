import type { StinaAPI } from './types/ipc';

export {};

declare global {
  interface Window {
    stina: StinaAPI;
  }
}
