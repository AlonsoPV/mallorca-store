import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function consumeRateLimit(
  key: string,
  max: number,
  windowMs: number,
  now = Date.now(),
  store = buckets,
): { allowed: boolean; retryAfterMs: number } {
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: windowMs };
  }
  if (current.count >= max) {
    return { allowed: false, retryAfterMs: Math.max(0, current.resetAt - now) };
  }
  current.count += 1;
  return { allowed: true, retryAfterMs: Math.max(0, current.resetAt - now) };
}

export function rateLimit({
  name,
  windowMs,
  max,
}: {
  name: string;
  windowMs: number;
  max: number;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    const result = consumeRateLimit(`${name}:${ip}`, max, windowMs);
    if (!result.allowed) {
      res.setHeader("Retry-After", String(Math.ceil(result.retryAfterMs / 1000) || 1));
      res.status(429).json({ error: "Demasiados intentos. Intenta de nuevo más tarde." });
      return;
    }
    next();
  };
}
