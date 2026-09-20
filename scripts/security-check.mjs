import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const exposed = files.filter(file => /(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.env.example') || /\.(?:token|sqlite)(?:$|[.-])/.test(file));
if (exposed.length) { console.error('Arquivos sensíveis candidatos ao Git:', exposed.join(', ')); process.exit(1); }
let secrets = [];
try {
  secrets = readFileSync('.env', 'utf8').split('\n').filter(line => /^[A-Z_]*(?:TOKEN|KEY|PASSWORD)=/.test(line)).map(line => line.slice(line.indexOf('=') + 1)).filter(value => value.length >= 16);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
function builtFiles(dir) {
  try { return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? builtFiles(join(dir, entry.name)) : [join(dir, entry.name)]); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
for (const file of new Set([...files, ...builtFiles('dist')])) {
  const contents = readFileSync(file, 'utf8');
  if (secrets.some(secret => contents.includes(secret))) { console.error(`Segredo local encontrado em ${file}; valor omitido.`); process.exit(1); }
}
console.log('Nenhum arquivo secreto candidato ao Git ou valor secreto do .env encontrado no código/build. Não substitui auditoria de segredos histórica.');
