import 'server-only';
import { randomBytes } from 'node:crypto';

/**
 * Stay magic token — 32 chars, URL-safe (base64url). Hard rule 22: treat as
 * a bearer credential; never log it in plain text outside secure debug logs.
 */
export function newMagicToken(): string {
  return randomBytes(24).toString('base64url');
}
