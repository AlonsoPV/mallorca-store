import type { NextFunction, Request, Response } from "express";

export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  const forwarded = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const https = forwarded === "https" || req.protocol === "https";
  if (process.env.NODE_ENV === "production" && https) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
}
