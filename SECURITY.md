# Segurança

- Segredos somente em .env local (0600), secret manager ou ambiente do servidor.
- Bearer obrigatório e comparação constante; token interno com pelo menos 32 caracteres.
- ALLOWED_ORIGINS usa origens exatas; Origin não permitido recebe 403 inclusive no preflight.
  Chamadas sem Origin são permitidas para integrações servidor-servidor e ainda exigem token.
- Não há endpoints que publiquem, comprem domínios ou façam pagamentos. Adicionar esses
  recursos exige aprovação humana explícita, não um booleano enviado pelo modelo.
- SiteSchema rejeita propriedades extras, HTML, JavaScript e URLs inseguras. Renderização
  usa escape de texto e componentes fixos; nunca eval, scripts gerados ou HTML arbitrário.
- Limites de corpo, resposta upstream, eventos SSE, concorrência, tempo e requisições.
  Upstream não segue redirects; desconexão do cliente cancela a chamada.
- Logs contêm somente ID, método, status e duração; não incluem headers, prompts ou respostas.
- Proxy confiável deve usar HTTPS. X-Forwarded-For não é confiado; configure limite no gateway.
- As respostas de chat são texto não confiável. Use textContent; não as injete como HTML.
- O bridge não recebe credenciais de clientes finais e não implementa autorização por usuário.
  Não exponha diretamente ao navegador usando o token interno compartilhado.
- platform/ é um protótipo separado, SQLite e tokens por tenant; não é produto homologado.
  Exportar manifest não significa deploy realizado. Secrets devem ser referências, não env.

Reporte vulnerabilidades privadamente aos mantenedores. Não inclua segredos em issues.
Testes locais com mocks não homologam o backend real, o isolamento de produção ou hardware.
