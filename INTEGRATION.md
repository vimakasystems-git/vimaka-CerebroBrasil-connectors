# CérebroBrasil ↔ Bydodoo

Esta API é uma ponte backend, não um substituto do orquestrador existente. O checkout
não contém o RAG, prompts, agentes, banco de dados ou regras do CérebroBrasil/Bydodoo.
Esses recursos continuam sob responsabilidade do backend existente. Nenhuma migração,
remoção de dados, publicação ou chamada a pagamento é executada aqui.

Fluxo: backend Bydodoo autenticado → esta API → adapter HTTP CérebroBrasil.
O navegador recebe somente SiteSchema validado ou eventos de texto; o token interno
fica nos servidores. Não coloque INTERNAL_API_TOKEN em VITE_*, NEXT_PUBLIC_* ou HTML.

## Contrato proposto v1

- GET /health: liveness, sem autenticação.
- POST /v1/builder/plan: `{ "briefing": "...", "contextId": "opcional" }`.
  Resposta: SiteSchema v1.0, nunca HTML/JS. O adapter espera o mesmo corpo/resposta do upstream.
- POST /v1/ai/chat: `{ "messages": [{ "role": "user"|"assistant", "content": "..." }], "contextId": "opcional" }`.
  Resposta SSE: `data: {"type":"delta","text":"..."}`, depois `data: {"type":"done"}`.
  O adapter aceita apenas estes eventos do upstream; não encaminha ferramentas nem executa código.
- Não existem endpoints de publicação, domínios ou pagamentos. Sua implementação futura
  requer autorização humana vinculada à ação concreta no backend responsável.

CEREBRO_API_URL aponta para a raiz HTTPS do orquestrador; chamadas usam /v1/builder/plan
ou /v1/ai/chat e CEREBRO_API_TOKEN próprio. HTTP é aceito apenas em localhost.
O contrato precisa ser confirmado com o proprietário do backend real antes de produção.
Sem adapter configurado, endpoints AI retornam 503, nunca dados simulados.
Não repassamos cabeçalhos arbitrários, prompts de sistema ou identidades vindas do cliente.
Uma instalação/token corresponde a um domínio de confiança; não é autenticação de usuário
nem SaaS multitenant. contextId é opaco: o upstream deve aplicar a autorização de memória.

## Persistência e infraestrutura

PostgreSQL/pgvector e Redis locais são opcionais para desenvolvimento do backend.
O bridge é stateless e não os acessa: não copia nem reindexa documentos e não cria tabelas.
DATABASE_URL, REDIS_URL, OPENAI_API_KEY e AI_MODEL são variáveis reservadas do backend
conforme o codex-task.json. A ponte não chama modelos diretamente: isso preserva prompts,
RAG e agentes existentes. Configure esses valores somente no backend que os utiliza.
Limites de tráfego e concorrência são por processo; em múltiplas réplicas, configure também
um gateway com limites distribuídos, autenticação de usuários e TLS.
