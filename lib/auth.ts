import 'server-only';
import { auth } from '@clerk/nextjs/server';

/**
 * Returns the current Clerk user ID. Use in route handlers and server
 * components that require an authenticated host.
 *
 * Throws a Response with 401 if not authenticated — Next.js route handlers
 * will surface this as a 401 to the client when caught at the boundary.
 *
 * Pair with `getPropertyForUser` / `getVideoForUser` / `getHotspotForUser`
 * from `lib/db/queries.ts` to enforce ownership.
 */
export async function requireUser(): Promise<string> {
  const { userId } = await auth();
  if (!userId) {
    throw new UnauthorizedError();
  }
  return userId;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor() {
    super('Forbidden');
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  constructor() {
    super('Not found');
    this.name = 'NotFoundError';
  }
}
