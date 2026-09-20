import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from '../dist/server.js';
import { HttpCerebroAdapter } from '../dist/adapter.js';
import { listen, post, settings, token, validSite } from './helpers.mjs';
const good = { plan: async () => validSite, async *chat() { yield { type: 'delta', text: 'Olá' }; yield { type: 'done' }; } };
async function app(t, options = {}) { return listen(t, createServer(settings, { log: () => {}, adapter: good, ...options })); }
test('integration: health and valid plan; no secrets in responses or logs', async t => {
  const logs = [], base = await app(t, { log: line => logs.push(line) });
  assert.equal((await fetch(base + '/health')).status, 200);
  const response = await post(base, '/v1/builder/plan'); assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), validSite);
  assert.ok(response.headers.get('content-security-policy'));
  assert.doesNotMatch(logs.join(''), new RegExp(token)); assert.doesNotMatch(logs.join(''), /institucional/);
});
test('integration: authentication, origins, and CORS preflight', async t => {
  const base = await app(t);
  for (const authorization of ['', token, 'Basic ' + token, 'Bearer wrong']) assert.equal((await post(base, '/v1/builder/plan', undefined, { Authorization: authorization })).status, 401);
  for (const origin of ['https://evil.example', 'null', 'https://bydodoo.com.evil.example']) assert.equal((await post(base, '/v1/builder/plan', undefined, { Origin: origin })).status, 403);
  assert.equal((await fetch(base + '/health', { headers: { Origin: 'https://evil.example' } })).status, 403);
  const allowed = await post(base, '/v1/builder/plan', undefined, { Origin: 'https://bydodoo.com' }); assert.equal(allowed.status, 200); assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://bydodoo.com');
  const preflight = await fetch(base + '/v1/builder/plan', { method: 'OPTIONS', headers: { Origin: 'https://bydodoo.com', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } }); assert.equal(preflight.status, 204);
});
test('integration: invalid input, oversized bodies and prohibited routes never reach backend', async t => {
  let calls = 0;
  const base = await app(t, { adapter: { ...good, plan: async () => { calls++; return validSite; } } });
  assert.equal((await post(base, '/v1/builder/plan', { briefing: '', publish: true })).status, 400);
  assert.equal((await post(base, '/v1/builder/plan', { briefing: 'x'.repeat(70000) })).status, 413);
  assert.equal((await post(base, '/v1/builder/plan', {}, { 'Content-Type': 'text/plain' })).status, 415);
  for (const path of ['/v1/publish', '/v1/payments', '/v1/domains/purchase']) assert.equal((await post(base, path)).status, 404);
  assert.equal(calls, 0);
});
test('integration: malformed upstream plan is rejected, missing adapter is 503', async t => {
  const base = await app(t, { adapter: { ...good, plan: async () => ({ ...validSite, html: '<script>' }) } });
  assert.equal((await post(base, '/v1/builder/plan')).status, 502);
  const unconfigured = await listen(t, createServer(settings, { log: () => {} }));
  assert.equal((await post(unconfigured, '/v1/builder/plan')).status, 503);
  assert.equal((await post(unconfigured, '/v1/ai/chat', { messages: [{ role: 'user', content: 'Oi' }] })).status, 503);
});
test('integration: upstream adapter forwards exact context and private upstream token', async t => {
  let received;
  const upstream = await listen(t, http.createServer(async (req, res) => {
    let body = ''; for await (const chunk of req) body += chunk;
    received = { path: req.url, token: req.headers.authorization, input: JSON.parse(body) };
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(validSite));
  }));
  const base = await app(t, { adapter: new HttpCerebroAdapter({ upstreamUrl: upstream, upstreamToken: 'upstream-private-token' }) });
  const input = { briefing: 'Preserve minha regra de negócio', contextId: 'existing-memory' };
  const response = await post(base, '/v1/builder/plan', input);
  assert.equal(response.status, 200); assert.deepEqual(received, { path: '/v1/builder/plan', token: 'Bearer upstream-private-token', input });
});
test('integration: SSE handles fragmented UTF-8 and CRLF, preserves backpressure contract', async t => {
  const upstream = await listen(t, http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const data = Buffer.from('data: {"type":"delta","text":"Olá 🧠"}\r\n\r\ndata: {"type":"done"}\r\n\r\n');
    let i = 0;
    const timer = setInterval(() => { if (i === data.length) { clearInterval(timer); res.end(); } else res.write(data.subarray(i, ++i)); }, 1);
    res.on('close', () => clearInterval(timer));
  }));
  const base = await app(t, { adapter: new HttpCerebroAdapter({ upstreamUrl: upstream, upstreamToken: 'private' }) });
  const response = await post(base, '/v1/ai/chat', { messages: [{ role: 'user', content: 'Oi' }] });
  assert.equal(response.status, 200); const text = await response.text(); assert.match(text, /Olá 🧠/); assert.match(text, /"type":"done"/);
});
test('integration: SSE errors do not echo upstream secrets or tool requests', async t => {
  const upstream = await listen(t, http.createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end('data: {"type":"tool","secret":"DO-NOT-LEAK"}\n\n'); }));
  const base = await app(t, { adapter: new HttpCerebroAdapter({ upstreamUrl: upstream, upstreamToken: 'private' }) });
  const response = await post(base, '/v1/ai/chat', { messages: [{ role: 'user', content: 'Oi' }] });
  assert.equal(response.status, 502); assert.doesNotMatch(await response.text(), /DO-NOT-LEAK/);
});
test('integration: upstream redirects are not followed', async t => {
  let destinationCalls = 0;
  const destination = await listen(t, http.createServer((_req, res) => { destinationCalls++; res.end('no'); }));
  const upstream = await listen(t, http.createServer((_req, res) => { res.writeHead(307, { Location: destination }); res.end(); }));
  const base = await app(t, { adapter: new HttpCerebroAdapter({ upstreamUrl: upstream, upstreamToken: 'private' }) });
  assert.equal((await post(base, '/v1/builder/plan')).status, 502); assert.equal(destinationCalls, 0);
});
test('integration: timeout cancels upstream and concurrency rejects excess requests', async t => {
  let started; const running = new Promise(resolve => { started = resolve; });
  const adapter = { ...good, plan: (_input, signal) => new Promise((_resolve, reject) => { started(); signal.addEventListener('abort', () => reject(signal.reason), { once: true }); }) };
  const base = await app(t, { adapter, timeoutMs: 100, maxConcurrent: 1 });
  const first = post(base, '/v1/builder/plan'); await running;
  assert.equal((await post(base, '/v1/builder/plan')).status, 503); assert.equal((await first).status, 504);
});
test('integration: rate limit produces 429', async t => {
  const base = await app(t, { rateLimit: 1 });
  assert.equal((await post(base, '/v1/builder/plan')).status, 200);
  const response = await post(base, '/v1/builder/plan'); assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'), '60');
});
test('integration: oversized upstream output and truncated SSE are rejected', async t => {
  const upstream = await listen(t, http.createServer((req, res) => {
    if (req.url.endsWith('/chat')) { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end('data: {"type":"delta","text":"partial"}\n\n'); }
    else { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ title: 'a'.repeat(1024 * 1024) })); }
  }));
  const base = await app(t, { adapter: new HttpCerebroAdapter({ upstreamUrl: upstream, upstreamToken: 'private' }) });
  assert.equal((await post(base, '/v1/builder/plan')).status, 502);
  const response = await post(base, '/v1/ai/chat', { messages: [{ role: 'user', content: 'Oi' }] });
  const text = await response.text(); assert.match(text, /"type":"error"/); assert.doesNotMatch(text, /"type":"done"/);
});
test('integration: disconnect aborts upstream work', async t => {
  let started, cancelled;
  const begin = new Promise(resolve => { started = resolve; });
  const aborted = new Promise(resolve => { cancelled = resolve; });
  const adapter = { ...good, plan: (_input, signal) => new Promise((_resolve, reject) => {
    started(); signal.addEventListener('abort', () => { cancelled(); reject(signal.reason); }, { once: true });
  }) };
  const base = await app(t, { adapter, timeoutMs: 5000 });
  const controller = new AbortController();
  const response = fetch(base + '/v1/builder/plan', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ briefing: 'Original' }), signal: controller.signal }).catch(() => {});
  await begin; controller.abort(); await response;
  let timer;
  try { await Promise.race([aborted, new Promise((_resolve, reject) => { timer = setTimeout(() => reject(new Error('upstream not cancelled')), 1000); })]); } finally { clearTimeout(timer); }
});
