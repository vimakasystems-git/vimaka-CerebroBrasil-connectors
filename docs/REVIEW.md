# Revisão de código e segurança

Escopo: checkout `vimaka-CerebroBrasil-connectors` e instruções lidas de
`/home/douglas/Downloads/codex-task.json`. O diretório `platform/` estava incompleto;
nenhum código dos backends CérebroBrasil/Bydodoo, RAG, prompts ou agentes estava presente.
A alteração prévia de permissão executável do conector Azure foi preservada.

## Problemas corrigidos

| Gravidade | Problema | Correção / evidência |
|---|---|---|
| Alta | Plataforma falhava ao importar HTML/JS/CSS inexistentes | Removida dependência de UI ausente; teste inicia servidor real |
| Alta | Header sem Bearer era aceito | Formato estrito, com teste HTTP de regressão |
| Alta | Escape `$` do Compose não escapava, por semântica de replaceAll | Callback de substituição; teste preserva variável literal |
| Alta | Credenciais API_KEY podiam entrar em env comum | Validação exige referência de secret; teste de rejeição |
| Média | Arquivo de token era reaberto após criação exclusiva | Escrita e fsync no descritor original; revoga token se gravação falhar; teste de symlink |
| Média | Banco com versão futura podia receber user_version=1 | Recusa versões futuras, preserva metadados; teste SQLite |
| Média | Referências OCI malformadas aceitas | Validação de estrutura e digest; testes positivos e negativos |
| Média | Limpeza do rate limit varria todos os clientes por request | Remoção pela ordem de expiração, custo amortizado; teste de janela/capacidade |
| Média | Instalador Azure dependia do diretório corrente | Resolve origem usando BASH_SOURCE; teste com cwd diferente |
| Baixa | doctor retornava sucesso com dependências ausentes | Exit code não zero; comandos login/status preservados |

## Integração adicionada

API backend com Bearer, allowlist de origens, TypeScript strict, limites de corpo/stream,
concorrência, timeout, cancelamento e backpressure. Adapter HTTP sem redirects. SiteSchema
v1.0 rejeita campos extras, HTML/JS, componentes desconhecidos e URLs inseguras. Renderer
escapa texto. Nenhuma ação de publicação, pagamento ou compra de domínio é implementada.
Não há dependências de runtime externas; TypeScript/tipos de Node são apenas de desenvolvimento.
Segredos locais ficam fora do Git e fora dos artefatos do renderer.

## Validação

- Instalação reproduzível com `npm ci`, check TypeScript/sintaxe, build e ShellCheck.
- 46 testes passaram, sem falhas ou skips neste ambiente: 39 da ponte/conectores e 7 da plataforma. Incluem testes unitários, HTTP de integração e regressão.
- `npm audit --audit-level=low`: nenhuma vulnerabilidade conhecida no momento da execução.
- PostgreSQL e Redis iniciados via Compose com healthchecks OK. `pg_available_extensions`
  confirmou pgvector 0.8.6 disponível (sem habilitar extensão nem migrar dados).
  Redis autenticado respondeu PONG.
- Microbenchmark local: 5.000 clientes, 20.000 chamadas; limpeza antiga ~1.213 ms, nova ~3,5 ms.
  Medição sintética única do limitador, não throughput ou latência de produção.

## Limites materiais

Não houve homologação dos sites reais, de identidade por usuário, do RAG, dos agentes ou de
regras de negócio externas. A integração aguarda URL, credenciais e confirmação do contrato
upstream; a ausência de configuração resulta em 503. A ponte não usa PostgreSQL/Redis diretamente
nem faz chamada direta à OpenAI: esses recursos permanecem no orquestrador existente.
O ambiente local não é produção. TLS de borda, autorização de usuário, quotas distribuídas,
observabilidade externa, backups e aprovação humana de ações futuras pertencem à implantação.
Os testes de Azure usam CLI mockada; não alteram assinatura nem fazem login numa conta real.
A varredura de segredos local compara valores de .env; não certifica todo o histórico Git.

## Conectores adicionados no remoto durante a revisão

A branch incorpora `origin/main` em `fa7efac`, que acrescentou os conectores API e Codex.
Também foram corrigidos:

- Token API em argv do curl: agora vai por stdin, sem redirects e sem ler .curlrc.
- Caminho sem `/` podia transformar o host em userinfo e mudar o destino: validação de
  URL/path, HTTPS remoto obrigatório, rejeição de credenciais na URL e limites de tempo.
- `--data` aceitava leitura de arquivo com `@`: alterado para `--data-raw`.
- Configurações sensíveis: permissões privadas, substituição atômica e rejeição de symlinks.
- Builders RPM independem de cwd e são testados com rpmbuild controlado.
- Instaladores Codex baixam o script completo antes de executar; HTTPS e timeout obrigatórios.
  Removido `pacman -Sy` para evitar atualização parcial da base antes de instalar.

O canal de instalação do Codex foi conferido na
[documentação oficial da OpenAI](https://developers.openai.com/pt-BR/docs/codex/cli).
Os testes não reinstalam o Codex nem executam os gerenciadores de pacotes da máquina.
