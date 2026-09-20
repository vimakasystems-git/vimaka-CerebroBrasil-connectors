import type { Config } from './config.js';
import type { PlanInput, ChatInput } from './contracts.js';
import { ensure, HttpError, keys, record } from './errors.js';
export type ChatEvent = { type: 'delta'; text: string } | { type: 'done' };
export interface CerebroAdapter {
  plan(input: PlanInput, signal: AbortSignal): Promise<unknown>;
  chat(input: ChatInput, signal: AbortSignal): AsyncIterable<ChatEvent>;
}
const maximumResponse = 1024 * 1024;
export async function limitedText(response: Response, signal: AbortSignal): Promise<string> {
  ensure(response.body, 'Resposta upstream vazia', 502);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = []; let bytes = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      ensure(bytes <= maximumResponse, 'Resposta upstream excede limite', 502); chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks).toString('utf8');
}
export class HttpCerebroAdapter implements CerebroAdapter {
  constructor(private readonly settings: Pick<Config, 'upstreamUrl' | 'upstreamToken'>, private readonly fetcher: typeof fetch = fetch) {}
  private async request(path: string, input: unknown, signal: AbortSignal): Promise<Response> {
    ensure(this.settings.upstreamUrl && this.settings.upstreamToken, 'Adapter CérebroBrasil não configurado', 503);
    const response = await this.fetcher(new URL(path, this.settings.upstreamUrl), {
      method: 'POST', redirect: 'error', signal,
      headers: { Authorization: `Bearer ${this.settings.upstreamToken}`, 'Content-Type': 'application/json', Accept: path.endsWith('/chat') ? 'text/event-stream' : 'application/json' },
      body: JSON.stringify(input)
    });
    if (!response.ok) { await response.body?.cancel(); throw new HttpError(502, 'Falha no backend CérebroBrasil'); }
    return response;
  }
  async plan(input: PlanInput, signal: AbortSignal): Promise<unknown> {
    const response = await this.request('/v1/builder/plan', input, signal);
    if (!response.headers.get('content-type')?.startsWith('application/json')) {
      await response.body?.cancel(); throw new HttpError(502, 'Tipo de resposta upstream inválido');
    }
    const text = await limitedText(response, signal);
    try { return JSON.parse(text) as unknown; } catch { throw new HttpError(502, 'JSON upstream inválido'); }
  }
  async *chat(input: ChatInput, signal: AbortSignal): AsyncGenerator<ChatEvent> {
    const response = await this.request('/v1/ai/chat', input, signal);
    if (!response.headers.get('content-type')?.startsWith('text/event-stream') || !response.body) {
      await response.body?.cancel(); throw new HttpError(502, 'Stream upstream inválido');
    }
    const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
    let pending = '', bytes = 0, completed = false;
    try {
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        ensure(bytes <= maximumResponse, 'Stream upstream excede limite', 502);
        pending += decoder.decode(value, { stream: true });
        // Normalize CRLF after accumulating, including boundaries split across network chunks.
        pending = pending.replaceAll('\r\n', '\n');
        let end: number;
        while ((end = pending.indexOf('\n\n')) !== -1) {
          const frame = pending.slice(0, end); pending = pending.slice(end + 2);
          ensure(frame.length <= 65536, 'Evento upstream excede limite', 502);
          const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
          if (!data) continue;
          let event: unknown;
          try { event = JSON.parse(data) as unknown; } catch { throw new HttpError(502, 'Evento upstream inválido'); }
          record(event);
          if (event.type === 'done') { keys(event, ['type']); completed = true; yield { type: 'done' }; return; }
          keys(event, ['type', 'text']);
          ensure(event.type === 'delta' && typeof event.text === 'string' && event.text.length <= 16000, 'Evento upstream não permitido', 502);
          yield { type: 'delta', text: event.text };
        }
        ensure(pending.length <= 65536, 'Evento upstream excede limite', 502);
      }
      ensure(completed, 'Stream upstream terminou sem confirmação', 502);
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
}
