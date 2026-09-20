# CérebroBrasil connectors

Conectores do cerebrobrasil.com.br para CLIs de cloud e integração backend com Bydodoo.

Este repositório contém:

- `src/`: ponte TypeScript CérebroBrasil ↔ Bydodoo, com autenticação, SiteSchema e streaming.
- `cerebroBrasil-AzureCLI-connector/`: conector Azure CLI existente, preservado e corrigido.
- `platform/`: protótipo separado do gerenciador de runtimes, com testes; não homologado para produção.

Leia [INTEGRATION.md](INTEGRATION.md) e [SECURITY.md](SECURITY.md) antes de integrar.
Os módulos reais de RAG, prompts, agentes e regras de negócio **não estão neste checkout**.
A ponte encaminha solicitações ao backend existente; não recria essa lógica nem altera dados.
O contrato remoto e o acesso aos produtos ainda precisam ser validados no ambiente real.

## Instalação e execução local

Use Node.js 24 LTS para executar todo o repositório, npm e, opcionalmente, Docker Compose.
A API da ponte aceita Node >=22.13; a plataforma separada requer Node 24.

```bash
npm ci
npm run setup
npm run check
npm test
npm run build
npm audit --audit-level=low
npm run check:secrets
```

`setup` cria `.env` com modo 0600 e segredos aleatórios, sem sobrescrever configuração existente.
Edite `.env` localmente e configure `CEREBRO_API_URL`, `CEREBRO_API_TOKEN` e `ALLOWED_ORIGINS`.
Não coloque o token interno no frontend. O token upstream é diferente do token deste bridge.
Sem upstream configurado, `/health` funciona, mas as rotas AI retornam 503.

```bash
# Opcional: infraestrutura local do backend; o bridge stateless não a utiliza.
docker compose up -d --wait postgres redis
npm run dev
```

A API escuta em `http://127.0.0.1:8080`. Verificação sem segredos:

```bash
curl --fail http://127.0.0.1:8080/health
```

As rotas AI devem ser chamadas pelo backend Bydodoo, com `Authorization: Bearer INTERNAL_API_TOKEN`.
O frontend renderiza apenas SiteSchema aprovado; `renderSite` em `src/site-schema.ts` é uma
implementação de referência sem scripts nem acesso a segredos. Streaming é texto, não HTML.
`npm run dev` recompila ao iniciar e observa `dist`; após editar TypeScript, execute `npm run build`.

A infraestrutura usa volumes locais próprios e portas apenas em loopback. Nunca use `down -v`
em bancos que contenham dados a preservar. Para parar os serviços sem remover dados:

```bash
docker compose stop
```

## Testes e revisão

```bash
npm run test:unit
npm run test:integration
npm run test:regression
npm run benchmark
npm run lint:shell
```

Os testes de integração abrem portas temporárias em localhost e usam upstream controlado.
Não chamam modelos pagos, Azure, domínios, publicação ou pagamentos. PostgreSQL/Redis reais
foram verificados separadamente; veja [docs/REVIEW.md](docs/REVIEW.md) para resultados e limites.
O pipeline CI executa instalação bloqueada, checagem, build, testes e auditoria.

## Plataforma experimental existente

```bash
cd platform
npm run init
npm start
```

API em `127.0.0.1:8080` (use `PORT=8081` se a ponte estiver ativa). O token é gravado em
`admin.token`, nunca exibido. Use `node src/cli.js help` para comandos. Não há console web
nesta revisão; a API inicia sem depender dos arquivos web que estavam ausentes.

## Azure CLI

Veja [o README do conector](cerebroBrasil-AzureCLI-connector/README.md).
O instalador de sistema requer Linux com dnf e sudo; não é necessário para rodar a ponte Node.
