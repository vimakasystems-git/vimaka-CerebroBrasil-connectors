import { createHash } from 'node:crypto';
import { assert, slug, specification } from './validation.js';
export function namespace(tenant) { return `cb-${createHash('sha256').update(tenant).digest('hex').slice(0, 20)}`; }
export function manifest(tenant, rawSpec, target) {
  slug(tenant, 'tenant');
  const s = specification(rawSpec);
  assert(['docker', 'podman', 'kubernetes'].includes(target), 'Destino inválido');
  const ns = namespace(tenant);
  const labels = { 'app.kubernetes.io/name': s.name, 'app.kubernetes.io/part-of': 'cerebro-fabric' };
  if (target !== 'kubernetes') {
    assert(s.replicas === 1, 'Compose local suporta uma réplica; use Kubernetes para escalar', 422);
    assert(s.secretRefs.length === 0, 'Referências de secrets disponíveis somente no Kubernetes nesta versão', 422);
    const environment = Object.fromEntries(Object.entries(s.env).map(([k, v]) => [k, v.replaceAll('$', () => '$$')]));
    return { name: `${ns}-${s.name}`, services: { [s.name]: {
      image: s.image, init: true, restart: 'unless-stopped', user: '10001:10001', read_only: true,
      cap_drop: ['ALL'], security_opt: ['no-new-privileges:true'], pids_limit: 256,
      tmpfs: ['/tmp:rw,noexec,nosuid,size=64m'], cpus: s.cpuMillis / 1000, mem_limit: `${s.memoryMiB}m`,
      environment, ports: [`127.0.0.1:${s.port}:${s.port}`], stop_grace_period: '30s',
      logging: { driver: 'json-file', options: { 'max-size': '10m', 'max-file': '3' } }
    } } };
  }
  const metadata = { name: s.name, namespace: ns, labels };
  const probe = { httpGet: { path: s.healthPath, port: 'http' }, timeoutSeconds: 2, periodSeconds: 10 };
  return { apiVersion: 'v1', kind: 'List', items: [
    { apiVersion: 'v1', kind: 'Namespace', metadata: { name: ns, labels: { 'pod-security.kubernetes.io/enforce': 'restricted' } } },
    { apiVersion: 'apps/v1', kind: 'Deployment', metadata, spec: {
      replicas: s.replicas, revisionHistoryLimit: 5, progressDeadlineSeconds: 300,
      strategy: { type: 'RollingUpdate', rollingUpdate: { maxUnavailable: 0, maxSurge: 1 } },
      selector: { matchLabels: labels }, template: { metadata: { labels }, spec: {
        automountServiceAccountToken: false, terminationGracePeriodSeconds: 30,
        securityContext: { runAsNonRoot: true, runAsUser: 10001, runAsGroup: 10001, fsGroup: 10001, seccompProfile: { type: 'RuntimeDefault' } },
        containers: [{ name: s.name, image: s.image, imagePullPolicy: 'IfNotPresent', ports: [{ name: 'http', containerPort: s.port }],
          env: [...Object.entries(s.env).map(([name, value]) => ({ name, value })), ...s.secretRefs.map(r => ({ name: r.env, valueFrom: { secretKeyRef: { name: r.name, key: r.key } } }))],
          securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ['ALL'] } },
          resources: { requests: { cpu: `${s.cpuMillis}m`, memory: `${s.memoryMiB}Mi` }, limits: { cpu: `${s.cpuMillis}m`, memory: `${s.memoryMiB}Mi` } },
          startupProbe: { ...probe, failureThreshold: 30 }, readinessProbe: { ...probe, failureThreshold: 3 }, livenessProbe: { ...probe, failureThreshold: 6 },
          volumeMounts: [{ name: 'tmp', mountPath: '/tmp' }]
        }], volumes: [{ name: 'tmp', emptyDir: { sizeLimit: '64Mi' } }]
      } }
    } },
    { apiVersion: 'v1', kind: 'Service', metadata, spec: { selector: labels, ports: [{ name: 'http', port: s.port, targetPort: 'http' }], type: 'ClusterIP' } },
    { apiVersion: 'networking.k8s.io/v1', kind: 'NetworkPolicy', metadata, spec: {
      podSelector: { matchLabels: labels }, policyTypes: ['Ingress', 'Egress'],
      ingress: [{ from: [{ podSelector: {} }], ports: [{ protocol: 'TCP', port: s.port }] }],
      egress: [{ to: [{ namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': 'kube-system' } }, podSelector: { matchLabels: { 'k8s-app': 'kube-dns' } } }], ports: [{ protocol: 'UDP', port: 53 }, { protocol: 'TCP', port: 53 }] }]
    } }
  ] };
}
