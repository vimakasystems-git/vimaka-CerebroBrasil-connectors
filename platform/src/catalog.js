const oci = (id, name, artifact, notes) => ({ id, name, kind: 'runtime', delivery: 'oci', status: 'manifest-generator', artifact, targets: ['docker', 'podman', 'kubernetes'], notes });
const external = (id, name, kind, notes) => ({ id, name, kind, delivery: 'external', status: 'requires-adapter', targets: [], notes });
export const catalog = [
  oci('nodejs', 'Node.js', 'Imagem OCI com aplicação Node.js', 'Servidor HTTP deve escutar em 0.0.0.0; forneça imagem OCI compatível.'),
  oci('springboot', 'Spring Boot', 'Imagem OCI contendo JAR ou binário nativo', 'Actuator e encerramento gracioso devem ser configurados pela aplicação.'),
  oci('quarkus', 'Quarkus', 'Imagem OCI JVM ou nativa', 'SmallRye Health opcional; contrato HTTP configurável.'),
  oci('wildfly', 'WildFly', 'Imagem OCI com WAR/EAR instalado', 'Jakarta EE, JTA, JMS e datasources pertencem ao WildFly; não são reimplementados pelo painel.'),
  oci('python', 'Python', 'Imagem OCI ASGI/WSGI', 'Inclua servidor como Uvicorn ou Gunicorn na imagem.'),
  oci('dotnet', '.NET', 'Imagem OCI ASP.NET Core', 'Kestrel deve usar a porta configurada e usuário sem privilégios.'),
  oci('java', 'Java / JVM', 'Imagem OCI com aplicação e JRE', 'JVM de servidor; distinta do ambiente Android.'),
  oci('go', 'Go', 'Imagem OCI com binário', 'Inclua certificados CA se houver conexões TLS de saída.'),
  oci('rust', 'Rust', 'Imagem OCI com binário', 'Verifique libc e arquitetura do binário.'),
  oci('php', 'PHP', 'Imagem OCI com servidor HTTP', 'PHP-FPM isolado não atende o contrato HTTP; inclua gateway na imagem ou adapte a topologia.'),
  oci('ruby', 'Ruby', 'Imagem OCI com servidor Rack', 'Use servidor HTTP e graceful shutdown apropriados.'),
  oci('deno', 'Deno', 'Imagem OCI com aplicação', 'Permissões Deno devem estar restritas na própria imagem.'),
  oci('wasi', 'WASI', 'Imagem OCI com host WASI e adaptador HTTP', 'Não executa módulos .wasm diretamente nem instala RuntimeClass.'),
  { id: 'docker', name: 'Docker', kind: 'engine', status: 'manifest-generator', targets: ['docker'], notes: 'Exportação Compose; execução pelo operador.' },
  { id: 'podman', name: 'Podman', kind: 'engine', status: 'manifest-generator', targets: ['podman'], notes: 'Compose requer provider compatível instalado; preferir rootless.' },
  { id: 'kubernetes', name: 'Kubernetes', kind: 'orchestrator', status: 'manifest-generator', targets: ['kubernetes'], notes: 'Deployment, Service, Namespace e NetworkPolicy; aplicação pelo operador.' },
  external('android-sdk', 'Android SDK / JVM de build', 'toolchain', 'Requer runner com JDK, SDK, licenças aceitas e Gradle; execução de APK usa Android/ART. Adapter de build pendente.'),
  external('xcode', 'Xcode', 'toolchain', 'Requer runner macOS, Xcode e credenciais de assinatura; adapter pendente.'),
  external('mainframe', 'Mainframe', 'integration', 'Contrato proposto via z/OS Connect para CICS/IMS/MQ/Db2; exige endpoint, identidade e testes no ambiente do cliente.'),
  external('biological-neuro-computing', 'Biological neuro computing', 'hardware', 'Integração experimental depende de fornecedor, hardware e protocolo. Não é runtime OCI genérico.'),
  external('cl1', 'Cortical Labs CL1', 'hardware', 'SDK/simulador oficial disponível; adapter, aquisição de dados e validação física ainda pendentes. Não há controle de hardware nesta versão.')
];
