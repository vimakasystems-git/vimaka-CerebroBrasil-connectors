import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { assert, slug, specification } from './validation.js';
const digest = token => createHash('sha256').update(token).digest('hex');
export class Store {
  constructor(path) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    const version = this.db.prepare('PRAGMA user_version').get().user_version;
    if (version > 1) { this.db.close(); throw new Error('Versão de banco mais nova que esta aplicação'); }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS tokens (id TEXT PRIMARY KEY, hash TEXT UNIQUE NOT NULL, tenant TEXT NOT NULL, role TEXT NOT NULL, created TEXT NOT NULL, expires TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS apps (id TEXT PRIMARY KEY, tenant TEXT NOT NULL, name TEXT NOT NULL, revision INTEGER NOT NULL, spec TEXT NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL, UNIQUE(tenant,name));
      CREATE TABLE IF NOT EXISTS revisions (app_id TEXT NOT NULL REFERENCES apps(id), version INTEGER NOT NULL, spec TEXT NOT NULL, created TEXT NOT NULL, PRIMARY KEY(app_id,version));
      CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, tenant TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, resource TEXT NOT NULL, created TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS apps_tenant ON apps(tenant);
      CREATE INDEX IF NOT EXISTS audit_tenant ON audit(tenant,id);
      PRAGMA user_version=1;`);
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  audit(actor, action, resource) {
    this.db.prepare('INSERT INTO audit(tenant,actor,action,resource,created) VALUES(?,?,?,?,?)').run(actor.tenant, actor.id, action, resource, new Date().toISOString());
  }
  issueToken(tenant, role, days = 30) {
    slug(tenant, 'tenant');
    assert(['admin', 'operator', 'viewer'].includes(role), 'Papel inválido');
    assert(Number.isInteger(days) && days >= 1 && days <= 365, 'Validade entre 1 e 365 dias');
    const token = randomBytes(32).toString('base64url');
    const id = randomUUID();
    const expires = new Date(Date.now() + days * 86400000).toISOString();
    this.transaction(() => {
      this.db.prepare('INSERT INTO tokens(id,hash,tenant,role,created,expires) VALUES(?,?,?,?,?,?)').run(id, digest(token), tenant, role, new Date().toISOString(), expires);
      this.audit({ tenant, id: 'local-cli' }, 'token.issue', id);
    });
    return { id, token, tenant, role, expires };
  }
  authenticate(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
    const row = this.db.prepare('SELECT id,tenant,role,expires FROM tokens WHERE hash=? AND revoked=0 AND expires>?').get(digest(token), new Date().toISOString());
    return row;
  }
  revoke(id) {
    return this.transaction(() => {
      const row = this.db.prepare('SELECT tenant FROM tokens WHERE id=? AND revoked=0').get(id);
      assert(row, 'Token não encontrado', 404);
      this.db.prepare('UPDATE tokens SET revoked=1 WHERE id=?').run(id);
      this.audit({ tenant: row.tenant, id: 'local-cli' }, 'token.revoke', id);
    });
  }
  decode(row) { return row && { ...row, spec: JSON.parse(row.spec), state: 'configured' }; }
  list(tenant) { return this.db.prepare('SELECT * FROM apps WHERE tenant=? ORDER BY updated DESC').all(tenant).map(r => this.decode(r)); }
  get(tenant, id) {
    const row = this.db.prepare('SELECT * FROM apps WHERE tenant=? AND id=?').get(tenant, id);
    assert(row, 'Aplicação não encontrada', 404);
    return this.decode(row);
  }
  create(actor, input) {
    const spec = specification(input);
    return this.transaction(() => {
      assert(this.db.prepare('SELECT count(*) AS n FROM apps WHERE tenant=?').get(actor.tenant).n < 100, 'Limite de 100 aplicações por tenant atingido', 409);
      assert(!this.db.prepare('SELECT id FROM apps WHERE tenant=? AND name=?').get(actor.tenant, spec.name), 'Nome já cadastrado', 409);
      const id = randomUUID(), now = new Date().toISOString(), json = JSON.stringify(spec);
      this.db.prepare('INSERT INTO apps VALUES(?,?,?,?,?,?,?)').run(id, actor.tenant, spec.name, 1, json, now, now);
      this.db.prepare('INSERT INTO revisions VALUES(?,?,?,?)').run(id, 1, json, now);
      this.audit(actor, 'application.create', id);
      return this.get(actor.tenant, id);
    });
  }
  update(actor, id, input, expected, rollbackVersion) {
    return this.transaction(() => {
      const current = this.get(actor.tenant, id);
      assert(Number.isInteger(expected) && expected === current.revision, 'Revisão desatualizada; recarregue a aplicação', 409);
      let spec;
      if (rollbackVersion !== undefined) {
        assert(Number.isInteger(rollbackVersion) && rollbackVersion >= 1 && rollbackVersion < current.revision, 'Versão de rollback inválida');
        const old = this.db.prepare('SELECT spec FROM revisions WHERE app_id=? AND version=?').get(id, rollbackVersion);
        assert(old, 'Versão não encontrada', 404);
        spec = specification(JSON.parse(old.spec));
      } else spec = specification(input);
      assert(spec.name === current.name, 'Nome é imutável; crie outra aplicação para renomear');
      assert(current.revision < 1000, 'Limite de 1000 revisões atingido', 409);
      const now = new Date().toISOString(), revision = current.revision + 1, json = JSON.stringify(spec);
      this.db.prepare('UPDATE apps SET revision=?,spec=?,updated=? WHERE id=?').run(revision, json, now, id);
      this.db.prepare('INSERT INTO revisions VALUES(?,?,?,?)').run(id, revision, json, now);
      this.audit(actor, rollbackVersion !== undefined ? 'application.rollback' : 'application.update', `${id}:${revision}`);
      return this.get(actor.tenant, id);
    });
  }
  history(tenant, id) {
    this.get(tenant, id);
    return this.db.prepare('SELECT version,spec,created FROM revisions WHERE app_id=? ORDER BY version DESC').all(id).map(r => ({ ...r, spec: JSON.parse(r.spec) }));
  }
  events(tenant) { return this.db.prepare('SELECT id,actor,action,resource,created FROM audit WHERE tenant=? ORDER BY id DESC LIMIT 200').all(tenant); }
  close() { this.db.close(); }
}
