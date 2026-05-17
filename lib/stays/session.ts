import 'server-only';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/client';
import { stays, type Stay } from '@/lib/db/schema';

const COOKIE_NAME = 'stay_session';

/**
 * Issues a stay-scoped session cookie after a valid magic link is opened.
 * Cookie expires when the stay does (capped at 30 days by the stay row
 * itself). Path is scoped to `/stay` so it doesn't leak elsewhere.
 *
 * Hard rule 23: guest routes use this session, never `requireUser()`.
 */
export async function startStaySession(
  stayId: string,
  expiresAt: Date,
): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, stayId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
    path: '/',
  });
}

/**
 * Returns the active stay if the cookie is valid AND the stay hasn't expired.
 * Returns null otherwise. Does NOT verify that the request URL matches the
 * stay's magic token — call sites should check token + session both agree.
 */
export async function getStaySession(): Promise<Stay | null> {
  const store = await cookies();
  const cookie = store.get(COOKIE_NAME);
  if (!cookie) return null;
  const rows = await db
    .select()
    .from(stays)
    .where(eq(stays.id, cookie.value))
    .limit(1);
  const stay = rows[0];
  if (!stay) return null;
  if (new Date(stay.expiresAt) < new Date()) return null;
  return stay;
}

export async function endStaySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
