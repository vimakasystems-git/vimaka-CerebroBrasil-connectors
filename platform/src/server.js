import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from './store.js';
import { catalog } from './catalog.js';
import { manifest } from './manifests.js';
import { ApiError, assert, object } from './validation.js';
async function body(req) {
  assert(req.headers['content-type']?.split(';')[0].trim() === 'application/json', 'Use Content-Type: application/json', 415);
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; assert(size <= 32768, 'Corpo excede 32 KiB', 413); chunks.push(chunk); }
  let parsed;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError(400, 'JSON inválido'); }
  object(parsed); return parsed;
}
export function createServer(store, { rateLimit = 240, log = line => console.log(line) } = {}) {
  const buckets = new Map();
  const server = http.createServer(async (req, res) => {
    const requestId = randomUUID(), start = Date.now();
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Cache-Control', 'no-store');
    const send = (status, payload, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type });
      res.end(type.startsWith('application/json') ? JSON.stringify(payload) : payload);
    };
    res.on('finish', () => log(JSON.stringify({ requestId, method: req.method, status: res.statusCode, durationMs: Date.now() - start })));
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/healthz') return send(200, { status: 'ok' });
      if (req.method === 'GET' && url.pathname === '/readyz') { store.db.prepare('SELECT 1').get(); return send(200, { status: 'ready' }); }
      if (req.method === 'GET' && url.pathname === '/') return send(200, { name: 'CérebroBrasil Application Fabric', status: 'prototype', api: '/api/v1/catalog' });
      assert(url.pathname.startsWith('/api/'), 'Rota não encontrada', 404);
      const now = Date.now();
      for (const [key, b] of buckets) { if (b.reset > now) break; buckets.delete(key); }
      const ip = req.socket.remoteAddress;
      assert(buckets.has(ip) || buckets.size < 10000, 'Servidor ocupado', 503);
      const bucket = buckets.get(ip) ?? { count: 0, reset: now + 60000 };
      buckets.set(ip, bucket);
      if (++bucket.count > rateLimit) { res.setHeader('Retry-After', Math.ceil((bucket.reset - now) / 1000)); throw new ApiError(429, 'Limite de requisições excedido'); }
      const token = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '')?.[1];
      const actor = store.authenticate(token);
      assert(actor, 'Token ausente, inválido ou expirado', 401);
      if (!['GET', 'HEAD'].includes(req.method)) assert(['admin', 'operator'].includes(actor.role), 'Papel sem permissão de escrita', 403);
      const path = url.pathname;
      if (req.method === 'GET' && path === '/api/v1/me') return send(200, actor);
      if (req.method === 'GET' && path === '/api/v1/catalog') return send(200, catalog);
      if (req.method === 'GET' && path === '/api/v1/audit') return send(200, store.events(actor.tenant));
      if (path === '/api/v1/applications') {
        if (req.method === 'GET') return send(200, store.list(actor.tenant));
        if (req.method === 'POST') return send(201, store.create(actor, await body(req)));
      }
      const match = path.match(/^\/api\/v1\/applications\/([a-f0-9-]{36})(?:\/(revisions|rollback|manifest))?$/);
      if (match) {
        const [, id, action] = match;
        const app = store.get(actor.tenant, id);
        if (req.method === 'GET' && !action) return send(200, app);
        if (req.method === 'GET' && action === 'revisions') return send(200, store.history(actor.tenant, id));
        if (req.method === 'GET' && action === 'manifest') {
          const target = url.searchParams.get('target') ?? 'kubernetes';
          const result = manifest(actor.tenant, app.spec, target);
          store.audit(actor, 'manifest.export', `${id}:${app.revision}:${target}`);
          return send(200, result);
        }
        if (req.method === 'PUT' && !action) {
          const input = await body(req);
          assert(Object.keys(input).every(k => ['spec', 'expectedRevision'].includes(k)), 'Campo desconhecido');
          return send(200, store.update(actor, id, input.spec, input.expectedRevision));
        }
        if (req.method === 'POST' && action === 'rollback') {
          const input = await body(req);
          assert(Object.keys(input).every(k => ['version', 'expectedRevision'].includes(k)), 'Campo desconhecido');
          assert(Number.isInteger(input.version), 'version deve ser inteiro');
          return send(200, store.update(actor, id, undefined, input.expectedRevision, input.version));
        }
      }
      throw new ApiError(404, 'Rota não encontrada');
    } catch (error) {
      const status = error instanceof ApiError ? error.status : 500;
      if (status === 500) log(JSON.stringify({ requestId, event: 'internal-error', type: error.name }));
      if (!res.headersSent) send(status, { error: status === 500 ? 'Erro interno' : error.message, requestId });
      else res.end();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 5000;
  server.maxRequestsPerSocket = 100;
  server.on('connection', socket => socket.setTimeout(30000, () => socket.destroy()));
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.umask(0o077);
  const store = new Store(process.env.CEREBRO_DB ?? fileURLToPath(new URL('../data/fabric.sqlite', import.meta.url)));
  const server = createServer(store);
  const port = Number(process.env.PORT ?? 8080), host = process.env.HOST ?? '127.0.0.1';
  server.listen(port, host, () => console.log(JSON.stringify({ event: 'listening', host, port })));
  let closing = false;
  const close = () => {
    if (closing) return; closing = true;
    server.close(() => { store.close(); process.exit(0); });
    setTimeout(() => { server.closeAllConnections(); }, 10000).unref();
  };
  process.on('SIGTERM', close); process.on('SIGINT', close);
}
