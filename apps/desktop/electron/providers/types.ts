import { ChatMessage } from '@stina/store';

export interface Provider {
  name: string;
  send(prompt: string, history: ChatMessage[]): Promise<string>;
  // Optional streaming API; calls onDelta for each text chunk and resolves with the final text.
  sendStream?: (
    prompt: string,
    history: ChatMessage[],
    onDelta: (delta: string) => void,
  ) => Promise<string>;
}
