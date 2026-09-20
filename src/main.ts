import { config } from './config.js';
import { createServer } from './server.js';
try {
  const settings = config();
  const server = createServer(settings);
  server.on('error', () => { console.error('Não foi possível iniciar a API. Verifique endereço e porta.'); process.exitCode = 1; });
  server.listen(settings.port, settings.host, () => console.log(JSON.stringify({ event: 'listening', host: settings.host, port: settings.port, adapterConfigured: Boolean(settings.upstreamUrl) })));
  let stopping = false;
  const shutdown = (): void => {
    if (stopping) return; stopping = true;
    server.close(() => process.exit(0));
    setTimeout(() => server.closeAllConnections(), 10000).unref();
  };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
} catch (error) { console.error(error instanceof Error ? error.message : 'Configuração inválida'); process.exitCode = 1; }
