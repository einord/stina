import { Provider } from './types';
import { ChatMessage } from '@stina/store';
import { toolSpecs, runTool } from '../tools';
import { toChatHistory } from './utils';

export class OllamaProvider implements Provider {
  name = 'ollama';
  constructor(private cfg: any) {}
  async send(prompt: string, history: ChatMessage[]): Promise<string> {
    const host = this.cfg?.host ?? 'http://localhost:11434';
    const model = this.cfg?.model ?? 'llama3.1:8b';
    const messages = toChatHistory(history).map(m => ({ role: m.role, content: m.content }));
    let res = await fetch(`${host}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, messages, stream: false, tools: toolSpecs.ollama }) });
    if (!res.ok) throw new Error(`Ollama ${res.status}`);
    let j: any = await res.json();
    const msg = j?.message;
    const toolCalls = msg?.tool_calls ?? [];
    if (toolCalls.length > 0) {
      const toolResults = [] as any[];
      for (const tc of toolCalls) {
        const name = tc.function?.name;
        let args: any = {};
        try { args = JSON.parse(tc.function?.arguments ?? '{}'); } catch {}
        const result = await runTool(name, args);
        toolResults.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
      }
      const messages2 = [...messages, msg, ...toolResults];
      res = await fetch(`${host}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, messages: messages2, stream: false, tools: toolSpecs.ollama }) });
      if (!res.ok) throw new Error(`Ollama ${res.status}`);
      j = await res.json();
    }
    return j?.message?.content ?? '(no content)';
  }
}