import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/v/(.*)', // public guest views
  '/api/public/(.*)', // public guest API
  '/api/media/(.*)', // media stream endpoint (slugs guard discoverability)
  '/api/upload-local/(.*)', // dev presigned uploads (HMAC token is the auth)
  '/api/stripe/webhook', // signature is the auth
  '/api/clerk/webhook', // svix signature is the auth
  '/stay/(.*)', // guest stays use stay-session cookies, not Clerk
  '/verify/(.*)', // public verification pages — no PII shown
  '/api/stay/(.*)', // guest event + complete routes use stay-session
  '/demo', // sample-tour preview for prospective hosts
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  // Run on all paths except Next.js internals and static files
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
