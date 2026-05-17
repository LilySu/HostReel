import 'server-only';
import type { NextRequest } from 'next/server';

/**
 * Best-effort client IP. Trusts the first hop in x-forwarded-for; if your
 * deployment sits behind multiple proxies, narrow this to your edge layer.
 * Returns null if nothing usable was supplied.
 */
export function clientIp(req: NextRequest): string | null {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();
  return null;
}

export function userAgent(req: NextRequest): string | null {
  return req.headers.get('user-agent');
}
