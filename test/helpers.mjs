import { once } from 'node:events';
export const token = 'test-only-token-'.repeat(3);
export const settings = { host: '127.0.0.1', port: 8080, internalToken: token, allowedOrigins: new Set(['https://bydodoo.com']), upstreamUrl: undefined, upstreamToken: undefined };
export const validSite = { version: '1.0', title: 'CérebroBrasil', locale: 'pt-BR', theme: 'light', sections: [{ id: 'welcome', type: 'hero', title: 'Olá', body: 'Bem-vindo & obrigado' }, { id: 'contact', type: 'cta', title: 'Contato', link: { label: 'Abrir', href: 'https://example.com/?a=1&b=2' } }] };
export async function listen(t, server) {
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}`;
}
export function post(base, path, body = { briefing: 'Um site institucional' }, headers = {}) {
  return fetch(base + path, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}
