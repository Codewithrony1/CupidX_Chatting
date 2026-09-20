import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/login(.*)',
  '/signup(.*)',
  '/register(.*)',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/safety(.*)',
  '/community-guidelines(.*)',
  '/forgot-password(.*)',
  '/privacy(.*)',
  '/terms(.*)',
  '/refund(.*)',
  '/contact(.*)',
  '/sso-callback(.*)',
  '/auth-callback(.*)',
  '/vip(.*)',
  '/premium(.*)',
  '/api/auth/login(.*)',
  '/api/auth/register(.*)',
  '/api/auth/logout(.*)',
  '/api/auth/me(.*)',
  '/api/auth/onboarding(.*)',
  '/api/profile(.*)',
  '/api/chat(.*)',
  '/api/matchmaking(.*)',
  '/api/settings/random-chat(.*)',
  '/api/payment/qr(.*)',
  '/api/payment/status(.*)',
  '/api/webhook(.*)',
  '/api/cron(.*)',
  '/api/social(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  const isAdminPath = req.nextUrl.pathname === '/admin'
    || req.nextUrl.pathname.startsWith('/admin/')
    || req.nextUrl.pathname === '/api/admin'
    || req.nextUrl.pathname.startsWith('/api/admin/');

  if (isAdminPath) {
    const host = req.headers.get('host')?.toLowerCase() || '';
    const isLocalAdminServer = process.env.ADMIN_MODE === 'true' && (
      host === 'localhost:3000' ||
      host === '127.0.0.1:3000' ||
      host === '[::1]:3000' ||
      host === 'localhost:3001' ||
      host === '127.0.0.1:3001' ||
      host === '[::1]:3001'
    );

    // Never expose admin UI or admin APIs outside the dedicated local server.
    if (!isLocalAdminServer) {
      return new NextResponse('Not Found', { status: 404 });
    }

    // Local admin mode intentionally supports the adminAuth fallback without Clerk.
    return;
  }

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
