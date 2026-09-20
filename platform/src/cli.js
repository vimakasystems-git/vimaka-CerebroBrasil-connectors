import { readFileSync, writeFileSync, openSync, closeSync, fsyncSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
process.umask(0o077);
const [command, ...args] = process.argv.slice(2);
const dbPath = process.env.CEREBRO_DB ?? fileURLToPath(new URL('../data/fabric.sqlite', import.meta.url));
try {
  if (command === 'init' || command === 'token') {
    const [tenant = 'default', role = 'admin', output = 'admin.token'] = args;
    const store = new Store(dbPath);
    try {
      // Write through the exclusive descriptor; never reopen a path after checking it.
      const fd = openSync(output, 'wx', 0o600);
      let result;
      try {
        result = store.issueToken(tenant, role);
        writeFileSync(fd, result.token + '\n');
        fsyncSync(fd);
      } catch (error) {
        if (result) store.revoke(result.id);
        throw error;
      } finally { closeSync(fd); }
      console.log(JSON.stringify({ ...result, token: undefined, tokenFile: output }, null, 2));
    } finally { store.close(); }
  } else if (command === 'revoke') {
    const store = new Store(dbPath);
    try { store.revoke(args[0]); console.log('Token revogado'); } finally { store.close(); }
  } else if (['list', 'catalog', 'create', 'export', 'rollback', 'audit'].includes(command)) {
    const base = new URL(process.env.CEREBRO_URL ?? 'http://127.0.0.1:8080');
    if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname))) throw new Error('Use HTTPS fora de localhost');
    const token = readFileSync(process.env.CEREBRO_TOKEN_FILE ?? 'admin.token', 'utf8').trim();
    let path = '/api/v1/applications', method = 'GET', input;
    if (command === 'catalog') path = '/api/v1/catalog';
    if (command === 'audit') path = '/api/v1/audit';
    if (command === 'create') { method = 'POST'; input = JSON.parse(readFileSync(args[0], 'utf8')); }
    if (command === 'export') path += `/${encodeURIComponent(args[0])}/manifest?target=${encodeURIComponent(args[1] ?? 'kubernetes')}`;
    if (command === 'rollback') { path += `/${encodeURIComponent(args[0])}/rollback`; method = 'POST'; input = { version: Number(args[1]), expectedRevision: Number(args[2]) }; }
    const response = await fetch(new URL(path, base), { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: input && JSON.stringify(input), redirect: 'error', signal: AbortSignal.timeout(10000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('Uso: node src/cli.js init|token [tenant] [admin|operator|viewer] [arquivo.token]\n  revoke ID\n  list | catalog | audit\n  create spec.json\n  export APP_ID docker|podman|kubernetes\n  rollback APP_ID VERSAO REVISAO_ATUAL\nVariáveis: CEREBRO_DB, CEREBRO_URL, CEREBRO_TOKEN_FILE');
    if (command && command !== 'help') process.exitCode = 1;
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
