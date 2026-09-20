export class RateLimiter {
  private readonly buckets = new Map<string, { count: number; reset: number }>();
  constructor(private readonly limit = 120, private readonly windowMs = 60000, private readonly capacity = 10000) {}
  take(key: string, now = Date.now()): boolean {
    // Fixed windows are inserted in expiry order. Prune only expired entries at the head.
    for (const [id, bucket] of this.buckets) {
      if (bucket.reset > now) break;
      this.buckets.delete(id);
    }
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.capacity) return false;
      bucket = { count: 0, reset: now + this.windowMs };
      this.buckets.set(key, bucket);
    }
    return ++bucket.count <= this.limit;
  }
}
