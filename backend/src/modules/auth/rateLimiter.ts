import type { RequestHandler } from 'express';
import { RateLimitedError } from './auth.errors.js';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const MAX_RATE_LIMITER_ENTRIES = 10_000;

/**
 * In-memory sliding window rate limiter middleware for sensitive auth operations.
 * Bounded by MAX_RATE_LIMITER_ENTRIES to prevent memory exhaustion DoS.
 * Automatically sets the HTTP Retry-After header on 429 responses.
 */
export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message?: string;
  keyGenerator?: (req: Parameters<RequestHandler>[0]) => string;
}): RequestHandler {
  const hits = new Map<string, RateLimitRecord>();
  const { windowMs, max, message } = options;

  // Cleanup expired entries periodically
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of hits.entries()) {
      if (record.resetAt <= now) {
        hits.delete(key);
      }
    }
  }, Math.max(windowMs, 60000));
  cleanupInterval.unref();

  return (req, res, next) => {
    // In test environment, bypass rate limiting unless testing rate limiting explicitly
    if (process.env.NODE_ENV === 'test' && req.headers['x-test-rate-limit'] !== 'true') {
      return next();
    }

    // Rely on Express's sanitized req.ip (which respects trust proxy configuration)
    // rather than raw unvetted x-forwarded-for headers to prevent IP spoofing
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    const key = options.keyGenerator ? options.keyGenerator(req) : `${ip}:${req.baseUrl || ''}${req.path}`;
    const now = Date.now();

    // Evict oldest entries if capacity limit is reached
    if (hits.size >= MAX_RATE_LIMITER_ENTRIES) {
      let evicted = 0;
      for (const [k, record] of hits.entries()) {
        if (record.resetAt <= now || evicted < 100) {
          hits.delete(k);
          evicted++;
        }
      }
    }

    const record = hits.get(key);
    if (!record || record.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (record.count >= max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
      res.setHeader('Retry-After', retryAfterSeconds);
      return next(new RateLimitedError(message ?? 'Too many requests, please try again later'));
    }

    record.count++;
    return next();
  };
}
