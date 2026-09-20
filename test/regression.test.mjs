import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, chmodSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const connector = resolve('cerebroBrasil-AzureCLI-connector/cerebrobrasil-azure');
function mock(t, tools) {
  const dir = mkdtempSync(join(tmpdir(), 'cerebro-regression-'));
  for (const [name, contents] of Object.entries(tools)) { writeFileSync(join(dir, name), '#!/bin/bash\n' + contents); chmodSync(join(dir, name), 0o755); }
  return dir;
}
test('regression: Azure subscription remains one literal argument without shell execution', t => {
  const dir = mock(t, { az: 'printf "%s\\n" "$@" >> "$TEST_CAPTURE"\n' });
  const capture = join(dir, 'args'), marker = join(dir, 'should-not-exist');
  const subscription = `Customer subscription $(touch ${marker})`;
  const result = spawnSync('bash', [connector, 'set-subscription', subscription], { env: { ...process.env, PATH: `${dir}:/usr/bin:/bin`, TEST_CAPTURE: capture }, encoding: 'utf8' });
  assert.equal(result.status, 0); assert.match(readFileSync(capture, 'utf8'), /Customer subscription \$\(touch/);
  assert.throws(() => statSync(marker), { code: 'ENOENT' });
});
test('regression: doctor reports missing dependencies with a failure status', t => {
  const dir = mock(t, {});
  const result = spawnSync('/bin/bash', [connector, 'doctor'], { env: { ...process.env, PATH: dir }, encoding: 'utf8' });
  assert.equal(result.status, 1); assert.match(result.stdout, /NÃO INSTALADO/);
});
test('regression: login and status still delegate to official az CLI', t => {
  const dir = mock(t, { az: 'printf "%s\\n" "$@"\n' });
  const env = { ...process.env, PATH: `${dir}:/usr/bin:/bin` };
  assert.equal(spawnSync('bash', [connector, 'login'], { env, encoding: 'utf8' }).stdout.trim(), 'login');
  assert.match(spawnSync('bash', [connector, 'status'], { env, encoding: 'utf8' }).stdout, /account\nshow/);
  assert.equal(spawnSync('bash', [connector, 'set-subscription'], { env }).status, 1);
});
test('regression: installer resolves connector from script directory, not cwd', { skip: process.getuid?.() !== 0 ? 'installer root precondition' : false }, t => {
  const dir = mock(t, {
    dnf: 'exit 0\n',
    rpm: 'if [[ "$1" == "-E" ]]; then echo 9; fi\n',
    install: 'printf "%s\\n" "$@" > "$TEST_CAPTURE"\n'
  });
  const capture = join(dir, 'install-args');
  const result = spawnSync('bash', [resolve('cerebroBrasil-AzureCLI-connector/install.sh')], { cwd: dir, env: { ...process.env, PATH: `${dir}:/usr/bin:/bin`, TEST_CAPTURE: capture }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.ok(readFileSync(capture, 'utf8').split('\n').includes(connector));
});
test('regression: setup preserves existing .env and never prints secrets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cerebro-setup-')); mkdirSync(join(dir, 'scripts'));
  writeFileSync(join(dir, 'scripts/setup.mjs'), readFileSync('scripts/setup.mjs'));
  writeFileSync(join(dir, '.env.example'), readFileSync('.env.example'));
  const first = spawnSync(process.execPath, [join(dir, 'scripts/setup.mjs')], { encoding: 'utf8' });
  assert.equal(first.status, 0); const before = readFileSync(join(dir, '.env'), 'utf8');
  assert.equal(statSync(join(dir, '.env')).mode & 0o777, 0o600);
  const secret = before.match(/^INTERNAL_API_TOKEN=(.+)$/m)[1]; assert.ok(!first.stdout.includes(secret));
  spawnSync(process.execPath, [join(dir, 'scripts/setup.mjs')]);
  assert.equal(readFileSync(join(dir, '.env'), 'utf8'), before);
});
test('regression: token CLI does not overwrite files or symlink targets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cerebro-token-')), target = join(dir, 'existing.token'), link = join(dir, 'link.token');
  writeFileSync(target, 'preserve'); symlinkSync(target, link);
  const env = { ...process.env, CEREBRO_DB: join(dir, 'test.sqlite') };
  const cli = resolve('platform/src/cli.js');
  assert.equal(spawnSync(process.execPath, [cli, 'token', 'tenant', 'admin', link], { env }).status, 1);
  assert.equal(readFileSync(target, 'utf8'), 'preserve');
  const newToken = join(dir, 'new.token');
  const result = spawnSync(process.execPath, [cli, 'token', 'tenant', 'admin', newToken], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.equal(statSync(newToken).mode & 0o777, 0o600);
  assert.ok(!result.stdout.includes(readFileSync(newToken, 'utf8').trim()));
});
const apiCli = resolve('cerebroBrasil-API-RPM-connector/SOURCES/cerebrobrasil');
test('regression: API CLI keeps token out of argv and validates destination before curl', t => {
  const dir = mock(t, { curl: 'printf "%s\\n" "$@" > "$TEST_CAPTURE"; cat > "$TEST_CAPTURE.headers"\n' });
  const capture = join(dir, 'curl-args');
  const env = { ...process.env, PATH: `${dir}:/usr/bin:/bin`, XDG_CONFIG_HOME: join(dir, 'config'), TEST_CAPTURE: capture };
  const run = (args, input) => spawnSync('bash', [apiCli, ...args], { env, encoding: 'utf8', input });
  assert.equal(run(['config', 'set-url', 'https://api.example.com']).status, 0);
  const secret = 'test-token-not-for-production';
  assert.equal(run(['config', 'set-token'], secret + '\n').status, 0);
  assert.equal(statSync(join(dir, 'config/cerebrobrasil/token')).mode & 0o777, 0o600);
  assert.equal(run(['get', '/v1/health']).status, 0);
  const args = readFileSync(capture, 'utf8');
  assert.ok(!args.includes(secret)); assert.ok(args.includes('@-')); assert.ok(args.includes('https://api.example.com/v1/health'));
  assert.equal(readFileSync(capture + '.headers', 'utf8'), `Authorization: Bearer ${secret}\n`);
  for (const path of ['@evil.example', '//evil.example', '/back\\slash', '/bad\npath']) assert.equal(run(['get', path]).status, 1);
  for (const url of ['http://remote.example', 'https://user:pass@evil.example', 'https://api.example?url=evil', 'https://api.example/#secret']) assert.equal(run(['config', 'set-url', url]).status, 1);
  assert.equal(run(['config', 'set-url', 'http://127.0.0.1:8080']).status, 0);
  assert.equal(run(['post', '/v1/test', '@private-file']).status, 0); assert.ok(readFileSync(capture, 'utf8').includes('--data-raw'));
});
test('regression: API CLI rejects symlinked credential file without overwriting target', t => {
  const dir = mock(t, {}), conf = join(dir, 'config/cerebrobrasil'); mkdirSync(conf, { recursive: true });
  const target = join(dir, 'preserve'); writeFileSync(target, 'unchanged'); symlinkSync(target, join(conf, 'token'));
  const result = spawnSync('bash', [apiCli, 'config', 'set-token'], { env: { ...process.env, XDG_CONFIG_HOME: join(dir, 'config') }, input: 'new-token\n' });
  assert.equal(result.status, 1); assert.equal(readFileSync(target, 'utf8'), 'unchanged');
});
test('regression: Codex run forwards literal arguments without evaluating shell code', t => {
  const dir = mock(t, { codex: 'printf "%s\\n" "$@"\n' });
  const result = spawnSync('bash', [resolve('cerebroBrasil-OpenAI-Codex-RPM-connector/SOURCES/cerebrobrasil-codex'), 'run', 'exec', 'literal $(echo unsafe)'], { env: { ...process.env, PATH: `${dir}:/usr/bin:/bin` }, encoding: 'utf8' });
  assert.equal(result.status, 0); assert.equal(result.stdout, 'exec\nliteral $(echo unsafe)\n');
});
test('regression: RPM builders find source files outside caller cwd', t => {
  for (const folder of ['cerebroBrasil-API-RPM-connector', 'cerebroBrasil-OpenAI-Codex-RPM-connector']) {
    const dir = mock(t, { rpmbuild: 'top="${2#_topdir }"; mkdir -p "$top/RPMS/noarch"; printf test > "$top/RPMS/noarch/test.rpm"\n' });
    const project = join(dir, 'project'); mkdirSync(join(project, 'SOURCES'), { recursive: true }); mkdirSync(join(project, 'SPECS'));
    writeFileSync(join(project, 'build-rpm.sh'), readFileSync(join(folder, 'build-rpm.sh')));
    const source = folder.includes('API') ? 'cerebrobrasil' : 'cerebrobrasil-codex';
    const spec = folder.includes('API') ? 'cerebrobrasil-api-connector.spec' : 'cerebrobrasil-openai-codex-connector.spec';
    writeFileSync(join(project, 'SOURCES', source), 'test'); writeFileSync(join(project, 'SPECS', spec), 'test');
    const result = spawnSync('bash', [join(project, 'build-rpm.sh')], { cwd: dir, env: { ...process.env, PATH: `${dir}:/usr/bin:/bin` }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); assert.equal(readFileSync(join(project, 'dist/test.rpm'), 'utf8'), 'test');
  }
});
test('regression: Codex installers never execute partially downloaded scripts', t => {
  for (const file of ['cerebroBrasil-OpenAI-Codex-connector/install-codex-linux.sh', 'cerebroBrasil-OpenAI-Codex-RPM-connector/SOURCES/cerebrobrasil-codex']) {
    const dir = mock(t, { curl: 'while [[ $# -gt 0 ]]; do if [[ "$1" == "-o" ]]; then shift; printf \'printf executed > "$TEST_EXEC"\\n\' > "$1"; fi; shift; done; exit "$TEST_CURL_EXIT"\n' });
    const snippet = readFileSync(file, 'utf8').match(/\(\n    umask 077[\s\S]*?\n  \)/)[0];
    const marker = join(dir, 'executed');
    const env = { ...process.env, PATH: `${dir}:/usr/bin:/bin`, TEST_EXEC: marker, TEST_CURL_EXIT: '1' };
    assert.notEqual(spawnSync('bash', ['-e', '-c', snippet], { env }).status, 0);
    assert.throws(() => statSync(marker), { code: 'ENOENT' });
    assert.equal(spawnSync('bash', ['-e', '-c', snippet], { env: { ...env, TEST_CURL_EXIT: '0' } }).status, 0);
    assert.equal(readFileSync(marker, 'utf8'), 'executed');
  }
});
