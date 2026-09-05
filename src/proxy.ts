import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/login(.*)',
  '/signup(.*)',
  '/register(.*)',
  '/safety(.*)',
  '/community-guidelines(.*)',
  '/forgot-password(.*)',
  '/privacy(.*)',
  '/terms(.*)',
  '/sso-callback(.*)',
  '/api/auth/login(.*)',
  '/api/auth/register(.*)',
  '/api/auth/logout(.*)',
  '/api/auth/me(.*)',
  '/api/payment/qr(.*)',
  '/api/payment/status(.*)',
  '/api/webhook(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
