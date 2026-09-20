import { readFileSync, openSync, writeFileSync, closeSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
process.umask(0o077);
try {
  let template = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  const password = randomBytes(32).toString('hex');
  const redis = randomBytes(32).toString('hex');
  const values = {
    INTERNAL_API_TOKEN: randomBytes(32).toString('base64url'),
    POSTGRES_PASSWORD: password, REDIS_PASSWORD: redis,
    DATABASE_URL: `postgresql://cerebro:${password}@127.0.0.1:5432/cerebro`,
    REDIS_URL: `redis://:${redis}@127.0.0.1:6379`
  };
  for (const [key, value] of Object.entries(values)) template = template.replace(new RegExp(`^${key}=$`, 'm'), `${key}=${value}`);
  const fd = openSync(new URL('../.env', import.meta.url), 'wx', 0o600);
  try { writeFileSync(fd, template); } finally { closeSync(fd); }
  console.log('.env criado com modo 0600. Configure CEREBRO_API_URL e CEREBRO_API_TOKEN localmente; não envie os valores ao Git.');
} catch (error) {
  if (error.code === 'EEXIST') console.log('.env já existe e foi preservado.');
  else { console.error('Não foi possível criar .env. Verifique as permissões locais.'); process.exitCode = 1; }
}
