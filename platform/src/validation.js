import { catalog } from './catalog.js';
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function assert(ok, message, status = 400) { if (!ok) throw new ApiError(status, message); }
export function object(value) { assert(value && typeof value === 'object' && !Array.isArray(value), 'Objeto JSON obrigatório'); }
export function slug(value, field = 'name') {
  assert(typeof value === 'string' && /^[a-z][a-z0-9-]{0,30}[a-z0-9]$|^[a-z]$/.test(value), `${field}: use 1–32 letras minúsculas, números e hífens`);
  return value;
}
function integer(value, min, max, field) { assert(Number.isInteger(value) && value >= min && value <= max, `${field}: inteiro entre ${min} e ${max}`); return value; }
export function specification(input) {
  object(input);
  const allowed = ['name', 'runtime', 'image', 'port', 'replicas', 'cpuMillis', 'memoryMiB', 'healthPath', 'env', 'secretRefs'];
  assert(Object.keys(input).every(k => allowed.includes(k)), 'Campo desconhecido na especificação');
  const runtime = catalog.find(r => r.id === input.runtime);
  assert(runtime?.delivery === 'oci', 'Runtime não suporta deploy OCI nesta versão', 422);
  const name = slug(input.name);
  const imagePattern = /^(?:[a-z0-9]+(?:[.-][a-z0-9]+)*(?::[0-9]{1,5})?\/)?[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*(?::[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}|@sha256:[a-f0-9]{64})$/;
  assert(typeof input.image === 'string' && input.image.length <= 256 && imagePattern.test(input.image) && !input.image.endsWith(':latest'), 'Informe referência OCI válida com tag explícita (exceto latest) ou digest sha256');
  const healthPath = input.healthPath ?? '/health';
  assert(typeof healthPath === 'string' && /^\/[a-zA-Z0-9/_.-]*$/.test(healthPath) && healthPath.length <= 200, 'healthPath inválido');
  const env = input.env ?? {};
  object(env);
  assert(Object.keys(env).length <= 32, 'Máximo de 32 variáveis');
  for (const [key, value] of Object.entries(env)) {
    assert(/^[A-Z_][A-Z0-9_]{0,63}$/.test(key), 'Nome de variável inválido');
    assert(typeof value === 'string' && value.length <= 1024 && !value.includes('\0'), 'Valor de variável inválido');
    assert(!/PASSWORD|SECRET|TOKEN|PRIVATE_KEY|API_KEY|CREDENTIAL/.test(key), 'Use secretRefs para credenciais; não armazene segredos em env');
  }
  const secretRefs = input.secretRefs ?? [];
  assert(Array.isArray(secretRefs) && secretRefs.length <= 16, 'secretRefs deve ser lista de até 16 referências');
  const names = new Set(Object.keys(env));
  const refs = secretRefs.map(ref => {
    object(ref);
    assert(Object.keys(ref).every(k => ['env', 'name', 'key'].includes(k)), 'Campo de secretRef desconhecido');
    assert(typeof ref.env === 'string' && /^[A-Z_][A-Z0-9_]{0,63}$/.test(ref.env) && !names.has(ref.env), 'Variável secreta inválida ou duplicada');
    names.add(ref.env);
    slug(ref.name, 'secretRef.name');
    assert(typeof ref.key === 'string' && /^[a-zA-Z0-9_.-]{1,64}$/.test(ref.key), 'Chave de segredo inválida');
    return { env: ref.env, name: ref.name, key: ref.key };
  });
  return { name, runtime: runtime.id, image: input.image, port: integer(input.port ?? 8080, 1024, 65535, 'port'), replicas: integer(input.replicas ?? 1, 1, 20, 'replicas'), cpuMillis: integer(input.cpuMillis ?? 500, 100, 16000, 'cpuMillis'), memoryMiB: integer(input.memoryMiB ?? 256, 64, 65536, 'memoryMiB'), healthPath, env, secretRefs: refs };
}
