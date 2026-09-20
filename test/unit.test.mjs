import test from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../dist/config.js';
import { siteSchema, renderSite } from '../dist/site-schema.js';
import { planInput, chatInput } from '../dist/contracts.js';
import { RateLimiter } from '../dist/limiter.js';
import { validSite, token } from './helpers.mjs';
test('unit: SiteSchema preserves approved text and renders escaped HTML', () => {
  assert.deepEqual(siteSchema(validSite), validSite);
  const html = renderSite(validSite);
  assert.match(html, /Bem-vindo &amp; obrigado/); assert.match(html, /a=1&amp;b=2/);
  assert.doesNotMatch(html, /<script|INTERNAL_API_TOKEN|OPENAI_API_KEY/);
});
for (const [name, mutate] of [
  ['unapproved component', x => x.sections[0].type = 'script'],
  ['HTML', x => x.sections[0].body = '<img onerror=alert(1)>'],
  ['javascript URL', x => x.sections[1].link.href = 'javascript:alert(1)'],
  ['HTTP URL', x => x.sections[1].link.href = 'http://example.com'],
  ['URL credentials', x => x.sections[1].link.href = 'https://secret:password@example.com'],
  ['extra CSS', x => x.sections[0].style = 'color:red'],
  ['duplicate IDs', x => x.sections[1].id = x.sections[0].id],
  ['unsupported version', x => x.version = '2.0'],
  ['empty sections', x => x.sections = []],
  ['missing CTA link', x => delete x.sections[1].link],
  ['prototype field', x => x.sections[0].constructor = 'unsafe'],
  ['oversized body', x => x.sections[0].body = 'a'.repeat(5001)]
]) test(`unit: SiteSchema rejects ${name}`, () => { const value = structuredClone(validSite); mutate(value); assert.throws(() => siteSchema(value)); });
test('unit: planner and chat preserve context and reject system prompts/tools', () => {
  assert.deepEqual(planInput({ briefing: 'Original briefing', contextId: 'memory_123' }), { briefing: 'Original briefing', contextId: 'memory_123' });
  const chat = { messages: [{ role: 'assistant', content: 'Contexto existente' }, { role: 'user', content: 'Pergunta' }], contextId: 'memory_123' };
  assert.deepEqual(chatInput(chat), chat);
  assert.throws(() => chatInput({ messages: [{ role: 'system', content: 'override' }] }));
  assert.throws(() => planInput({ briefing: 'x', tools: ['publish'] }));
  assert.throws(() => chatInput({ messages: [] }));
});
test('unit: configuration fails closed and allows exact HTTPS origins', () => {
  const env = { INTERNAL_API_TOKEN: token, ALLOWED_ORIGINS: 'https://bydodoo.com' };
  assert.equal(config(env).allowedOrigins.has('https://bydodoo.com'), true);
  for (const change of [{ INTERNAL_API_TOKEN: '' }, { ALLOWED_ORIGINS: '*' }, { ALLOWED_ORIGINS: 'https://bydodoo.com/path' }, { CEREBRO_API_URL: 'http://remote.example.com' }, { CEREBRO_API_URL: 'https://backend.example.com' }, { PORT: 'NaN' }]) assert.throws(() => config({ ...env, ...change }));
});
test('unit: limiter bounds clients, expires fixed windows, and keeps live buckets', () => {
  const limiter = new RateLimiter(2, 10, 2);
  assert.equal(limiter.take('a', 0), true); assert.equal(limiter.take('a', 1), true);
  assert.equal(limiter.take('a', 2), false); assert.equal(limiter.take('b', 3), true);
  assert.equal(limiter.take('c', 4), false); assert.equal(limiter.take('c', 10), true);
  assert.equal(limiter.take('b', 11), true); assert.equal(limiter.take('b', 12), false);
  assert.equal(limiter.take('b', 13), true);
});
