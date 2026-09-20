import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../src/store.js';
import { createServer } from '../src/server.js';
import { manifest, namespace } from '../src/manifests.js';
import { specification } from '../src/validation.js';
const spec = { name: 'example', runtime: 'nodejs', image: 'example/app:v1' };
function store(t) { const s = new Store(':memory:'); t.after(() => s.close()); return s; }
test('unit: persistent lifecycle, optimistic updates and rollback preserve history and tenancy', t => {
  const s = store(t), token = s.issueToken('alpha', 'admin'), actor = s.authenticate(token.token);
  const app = s.create(actor, spec);
  assert.equal(s.list('beta').length, 0); assert.throws(() => s.get('beta', app.id), { status: 404 });
  const updated = s.update(actor, app.id, { ...spec, image: 'example/app:v2' }, 1); assert.equal(updated.revision, 2);
  assert.throws(() => s.update(actor, app.id, spec, 1), { status: 409 });
  const rolled = s.update(actor, app.id, undefined, 2, 1); assert.equal(rolled.spec.image, spec.image);
  assert.equal(s.history('alpha', app.id).length, 3); assert.equal(s.events('alpha').length, 4);
  s.revoke(token.id); assert.equal(s.authenticate(token.token), undefined);
});
test('regression: failed update is atomic and does not add audit/revisions', t => {
  const s = store(t), actor = s.authenticate(s.issueToken('alpha', 'admin').token), app = s.create(actor, spec);
  const count = s.events('alpha').length;
  assert.throws(() => s.update(actor, app.id, { ...spec, name: 'different' }, 1));
  assert.equal(s.history('alpha', app.id).length, 1); assert.equal(s.events('alpha').length, count);
});
test('regression: a newer database schema is never downgraded', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'schema-')), 'db.sqlite');
  const db = new DatabaseSync(path); db.exec('PRAGMA user_version=7'); db.close();
  assert.throws(() => new Store(path), /mais nova/);
  const check = new DatabaseSync(path); assert.equal(check.prepare('PRAGMA user_version').get().user_version, 7); check.close();
});
test('unit: manifests preserve resource limits, tenant namespace and secret references', () => {
  const plan = manifest('alpha', { ...spec, secretRefs: [{ env: 'DB_PASSWORD', name: 'database', key: 'password' }] }, 'kubernetes');
  assert.notEqual(namespace('alpha'), namespace('beta'));
  const deployment = plan.items.find(x => x.kind === 'Deployment');
  assert.equal(deployment.metadata.namespace, namespace('alpha'));
  const pod = deployment.spec.template.spec, container = pod.containers[0];
  assert.equal(pod.automountServiceAccountToken, false); assert.equal(pod.securityContext.runAsNonRoot, true);
  assert.equal(container.env[0].valueFrom.secretKeyRef.name, 'database'); assert.ok(container.readinessProbe);
  assert.ok(plan.items.find(x => x.kind === 'NetworkPolicy'));
  const compose = manifest('alpha', { ...spec, env: { MESSAGE: '${NOT_A_SECRET}' } }, 'docker');
  assert.equal(compose.services.example.environment.MESSAGE, '$${NOT_A_SECRET}');
  assert.match(compose.services.example.ports[0], /^127\.0\.0\.1:/);
  assert.throws(() => manifest('alpha', { ...spec, replicas: 2 }, 'docker'), { status: 422 });
});
test('unit: runtime/secret/unknown field validation rejects unsafe specifications', () => {
  for (const extra of [{ runtime: 'cl1' }, { image: 'example/app:latest' }, { privileged: true }, { env: { OPENAI_API_KEY: 'secret' } }, { env: { PASSWORD: 'secret' } }]) assert.throws(() => specification({ ...spec, ...extra }));
});
test('integration: platform starts without missing web files and enforces Bearer, roles and tenants', async t => {
  const s = store(t), admin = s.issueToken('alpha', 'admin'), viewer = s.issueToken('alpha', 'viewer'), other = s.issueToken('beta', 'admin');
  const server = createServer(s, { log: () => {} }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/')).status, 200);
  assert.equal((await fetch(base + '/api/v1/catalog', { headers: { Authorization: admin.token } })).status, 401);
  const request = (token, path, body) => fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  assert.equal((await request(viewer.token, '/api/v1/applications', spec)).status, 403);
  const created = await request(admin.token, '/api/v1/applications', spec); assert.equal(created.status, 201); const app = await created.json();
  assert.equal((await request(other.token, '/api/v1/applications/' + app.id)).status, 404);
  assert.equal((await request(admin.token, '/api/v1/applications/' + app.id + '/manifest?target=docker')).status, 200);
});
test('regression: invalid OCI delimiters and malformed digests are rejected', () => {
  for (const image of ['a::v1', 'a@@sha256:123', 'registry:5000/app', 'a/:tag', 'a@sha256:nope']) assert.throws(() => specification({ ...spec, image }));
  for (const image of ['registry:5000/team/app:v1', 'ghcr.io/team/app:Release-1', 'app@sha256:' + 'a'.repeat(64)]) assert.equal(specification({ ...spec, image }).image, image);
});
