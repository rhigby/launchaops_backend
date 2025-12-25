import type { NextFunction, Request, Response } from "express";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { config } from "./config.js";
import { auth0JwtVerifier } from "./auth.js";

declare global {
  namespace Express {
    interface Request {
      user?: import("./auth.js").AuthUser;
    }
  }
}

const limiter = new RateLimiterMemory({
  points: config.rateLimitPoints,
  duration: config.rateLimitDurationSeconds
});

const issuer = `https://${config.auth0Domain}/`;
const verify = auth0JwtVerifier({ issuer, audience: config.auth0Audience });

export async function rateLimit(req: Request, res: Response, next: NextFunction) {
  try {
    await limiter.consume(req.ip || "unknown");
    next();
  } catch {
    res.status(429).json({ error: "rate_limited" });
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.header("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice("Bearer ".length) : "";
  if (!token) return res.status(401).json({ error: "missing_token" });

  try {
    req.user = await verify(token);
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}
