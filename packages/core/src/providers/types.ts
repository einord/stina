import { ChatMessage } from '@stina/store';

export interface Provider {
  name: string;
  send(prompt: string, history: ChatMessage[]): Promise<string>;
  sendStream?: (
    prompt: string,
    history: ChatMessage[],
    onDelta: (delta: string) => void,
    signal?: AbortSignal,
  ) => Promise<string>;
}
