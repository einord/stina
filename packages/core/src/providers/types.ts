import { InteractionMessage } from '@stina/store';

export interface Provider {
  name: string;
  send(prompt: string, history: InteractionMessage[]): Promise<string>;
  sendStream?: (
    prompt: string,
    history: InteractionMessage[],
    onDelta: (delta: string) => void,
    signal?: AbortSignal,
  ) => Promise<string>;
}
