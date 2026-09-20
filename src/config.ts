import { ensure } from './errors.js';
export interface Config {
  host: string; port: number; internalToken: string; allowedOrigins: ReadonlySet<string>;
  upstreamUrl: string | undefined; upstreamToken: string | undefined;
}
export function secureUrl(input: string): URL {
  let url: URL;
  try { url = new URL(input); } catch { throw new Error('URL de configuração inválida'); }
  ensure(!url.username && !url.password && !url.search && !url.hash, 'URL deve estar sem credenciais, query ou fragmento');
  ensure(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)), 'HTTPS obrigatório fora de localhost');
  return url;
}
export function config(env: NodeJS.ProcessEnv = process.env): Config {
  const internalToken = env.INTERNAL_API_TOKEN ?? '';
  ensure(/^[A-Za-z0-9_-]{32,256}$/.test(internalToken), 'INTERNAL_API_TOKEN deve ter 32–256 caracteres seguros');
  const allowedOrigins = new Set((env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean).map(value => {
    const trimmed = value.trim(), url = secureUrl(trimmed);
    ensure(url.origin === trimmed, 'ALLOWED_ORIGINS aceita apenas origens exatas, sem path');
    return url.origin;
  }));
  ensure(allowedOrigins.size > 0, 'ALLOWED_ORIGINS obrigatório');
  const upstreamUrl = env.CEREBRO_API_URL ? secureUrl(env.CEREBRO_API_URL).href : undefined;
  if (upstreamUrl) ensure(new URL(upstreamUrl).pathname === '/', 'CEREBRO_API_URL deve apontar para a raiz da API');
  const upstreamToken = env.CEREBRO_API_TOKEN || undefined;
  ensure(Boolean(upstreamUrl) === Boolean(upstreamToken), 'Configure URL e token upstream juntos');
  if (upstreamToken) ensure(/^[\x21-\x7E]{16,512}$/.test(upstreamToken), 'CEREBRO_API_TOKEN inválido');
  const port = Number(env.PORT ?? 8080);
  ensure(Number.isInteger(port) && port > 0 && port <= 65535, 'PORT inválida');
  return { host: env.HOST ?? '127.0.0.1', port, internalToken, allowedOrigins, upstreamUrl, upstreamToken };
}
