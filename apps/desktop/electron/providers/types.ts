import { ChatMessage } from '@stina/store';

export interface Provider {
  name: string;
  send(prompt: string, history: ChatMessage[]): Promise<string>;
}
