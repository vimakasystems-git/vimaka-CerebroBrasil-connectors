import { performance } from 'node:perf_hooks';
import { RateLimiter } from '../dist/limiter.js';
const clients = 5000, requests = 20000;
const buckets = new Map(Array.from({ length: clients }, (_, n) => [String(n), { reset: 60000, count: 0 }]));
const limiter = new RateLimiter(requests, 60000, clients);
for (let i = 0; i < clients; i++) limiter.take(String(i), 0);
let start = performance.now();
for (let i = 0; i < requests; i++) {
  for (const [key, value] of buckets) if (value.reset <= 1) buckets.delete(key);
  buckets.get(String(i % clients)).count++;
}
const beforeMs = performance.now() - start;
start = performance.now();
for (let i = 0; i < requests; i++) limiter.take(String(i % clients), 1);
const afterMs = performance.now() - start;
console.log(JSON.stringify({ clients, requests, beforeMs: +beforeMs.toFixed(2), afterMs: +afterMs.toFixed(2), scope: 'Synthetic limiter only; not end-to-end throughput' }, null, 2));
