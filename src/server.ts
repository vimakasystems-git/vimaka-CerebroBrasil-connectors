import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { once } from 'node:events';
import type { Config } from './config.js';
import { HttpCerebroAdapter, type CerebroAdapter, type ChatEvent } from './adapter.js';
import { chatInput, planInput } from './contracts.js';
import { ensure, HttpError } from './errors.js';
import { RateLimiter } from './limiter.js';
import { siteSchema } from './site-schema.js';
async function jsonBody(req: IncomingMessage): Promise<unknown> {
  ensure(req.headers['content-type']?.split(';')[0]?.trim() === 'application/json', 'Use application/json', 415);
  ensure(!req.headers['content-encoding'] || req.headers['content-encoding'] === 'identity', 'Content-Encoding não suportado', 415);
  if (req.headers['content-length']) ensure(Number(req.headers['content-length']) <= 65536, 'Corpo excede 64 KiB', 413);
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk as Uint8Array); size += buffer.byteLength;
    ensure(size <= 65536, 'Corpo excede 64 KiB', 413); chunks.push(buffer);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch { throw new HttpError(400, 'JSON inválido'); }
}
async function writeEvent(res: ServerResponse, event: ChatEvent, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  if (!res.write(`data: ${JSON.stringify(event)}\n\n`)) await once(res, 'drain', { signal });
}
interface Options { adapter?: CerebroAdapter; log?: (line: string) => void; rateLimit?: number; maxConcurrent?: number; timeoutMs?: number }
export function createServer(settings: Config, options: Options = {}): http.Server {
  const adapter = options.adapter ?? new HttpCerebroAdapter(settings);
  const log = options.log ?? console.log;
  const limiter = new RateLimiter(options.rateLimit ?? 120);
  const tokenHash = createHash('sha256').update(settings.internalToken).digest();
  let active = 0;
  const server = http.createServer({ maxHeaderSize: 16384 }, async (req, res) => {
    const requestId = randomUUID(), started = Date.now();
    res.setHeader('X-Request-Id', requestId); res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    const send = (status: number, data: unknown): void => {
      if (res.destroyed) return;
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data));
    };
    res.once('finish', () => log(JSON.stringify({ requestId, method: req.method, status: res.statusCode, durationMs: Date.now() - started })));
    const abort = new AbortController();
    res.once('close', () => abort.abort());
    let reserved = false;
    const deadline = setTimeout(() => abort.abort(new Error('deadline')), options.timeoutMs ?? 60000);
    deadline.unref();
    try {
      const origin = req.headers.origin;
      res.setHeader('Vary', 'Origin');
      if (origin !== undefined) {
        ensure(settings.allowedOrigins.has(origin), 'Origem não permitida', 403);
        res.setHeader('Access-Control-Allow-Origin', origin);
      }
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (req.method === 'GET' && path === '/health') return send(200, { status: 'ok' });
      ensure(['/v1/ai/chat', '/v1/builder/plan'].includes(path), 'Rota não encontrada', 404);
      if (req.method === 'OPTIONS') {
        ensure(origin && req.headers['access-control-request-method'] === 'POST', 'Preflight inválido', 403);
        const requested = req.headers['access-control-request-headers']?.toString().toLowerCase().split(',').map(h => h.trim()) ?? [];
        ensure(requested.every(h => ['authorization', 'content-type'].includes(h)), 'Header não permitido', 403);
        res.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Authorization, Content-Type' }); res.end(); return;
      }
      ensure(limiter.take(req.socket.remoteAddress ?? 'unknown'), 'Limite de requisições excedido', 429);
      const header = req.headers.authorization ?? '';
      const candidate = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(header)?.[1];
      ensure(candidate && timingSafeEqual(createHash('sha256').update(candidate).digest(), tokenHash), 'Não autorizado', 401);
      ensure(req.method === 'POST', 'Método não permitido', 405);
      ensure(active < (options.maxConcurrent ?? 16), 'Capacidade temporariamente esgotada', 503);
      active++; reserved = true;
      const body = await jsonBody(req);
      if (path === '/v1/builder/plan') {
        const input = planInput(body);
        const raw = await adapter.plan(input, abort.signal);
        let plan;
        try { plan = siteSchema(raw); } catch { throw new HttpError(502, 'Backend retornou SiteSchema inválido'); }
        return send(200, plan);
      }
      const input = chatInput(body);
      let streamed = false, completed = false;
      try {
        for await (const event of adapter.chat(input, abort.signal)) {
          if (!streamed) { res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'X-Accel-Buffering': 'no' }); streamed = true; }
          await writeEvent(res, event, abort.signal);
          if (event.type === 'done') { completed = true; break; }
        }
        ensure(completed, 'Stream upstream incompleto', 502); res.end();
      } catch (error) {
        if (error instanceof HttpError && error.status === 503) throw error;
        throw new HttpError(502, 'Falha no stream do backend');
      }
    } catch (error) {
      const status = abort.signal.aborted ? 504 : error instanceof HttpError ? error.status : 502;
      const message = abort.signal.aborted ? 'Tempo limite excedido' : error instanceof HttpError ? error.message : 'Falha na integração';
      if (!res.headersSent && (status === 429 || status === 503)) res.setHeader('Retry-After', '60');
      if (!res.headersSent) send(status, { error: message, requestId });
      else if (!res.destroyed) res.end(`data: ${JSON.stringify({ type: 'error', error: 'Stream interrompido', requestId })}\n\n`);
    } finally { clearTimeout(deadline); if (reserved) active--; }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  server.on('connection', socket => socket.setTimeout(65000, () => socket.destroy()));
  return server;
}
