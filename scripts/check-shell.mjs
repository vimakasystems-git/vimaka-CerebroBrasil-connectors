import { spawnSync } from 'node:child_process';
export const files = [
  'cerebroBrasil-AzureCLI-connector/cerebrobrasil-azure', 'cerebroBrasil-AzureCLI-connector/install.sh',
  'cerebroBrasil-API-RPM-connector/SOURCES/cerebrobrasil', 'cerebroBrasil-API-RPM-connector/build-rpm.sh',
  'cerebroBrasil-OpenAI-Codex-RPM-connector/SOURCES/cerebrobrasil-codex', 'cerebroBrasil-OpenAI-Codex-RPM-connector/build-rpm.sh',
  'cerebroBrasil-OpenAI-Codex-connector/install-codex-linux.sh'
];
const lint = process.argv.includes('--lint');
for (const args of lint ? [files] : files.map(file => ['-n', file])) {
  const result = spawnSync(lint ? 'shellcheck' : 'bash', args, { stdio: 'inherit' });
  if (result.error) console.error('Não foi possível executar a verificação shell.');
  if (result.error || result.status !== 0) { process.exitCode = result.status || 1; break; }
}
