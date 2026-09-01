import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/login(.*)',
  '/register(.*)',
  '/signup(.*)',
  '/privacy(.*)',
  '/terms(.*)',
  '/sso-callback(.*)',
  '/onboarding(.*)',
  '/api/auth/login(.*)',
  '/api/auth/register(.*)',
  '/api/auth/onboarding(.*)',
  '/api/auth/me(.*)',
]);

const isAdminRoute = createRouteMatcher([
  '/admin(.*)',
  '/api/admin(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) {
    return;
  }

  // Admin Route Protection
  if (isAdminRoute(req)) {
    // 1. If running in local admin mode or development, allow access
    if (process.env.ADMIN_MODE === 'true' || process.env.NODE_ENV !== 'production') {
      return;
    }

    // 2. In production, strictly check Clerk session claims role: "admin"
    const sessionAuth = await auth();
    const claims = sessionAuth.sessionClaims as any;
    const clerkRole = claims?.metadata?.role || claims?.role || claims?.publicMetadata?.role;

    if (clerkRole === 'admin') {
      return;
    }

    // Check local token cookie for ADMIN role
    const tokenCookie = req.cookies.get('token')?.value;
    if (tokenCookie) {
      try {
        const parts = tokenCookie.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          if (payload && payload.role === 'ADMIN') {
            return;
          }
        }
      } catch (e) {}
    }

    // Unauthorized non-admin hitting /admin in production gets redirected
    const redirectUrl = new URL('/dashboard', req.url);
    return NextResponse.redirect(redirectUrl);
  }

  // Fast-path: Check local token cookie FIRST to avoid remote Edge Middleware latency (~0.1ms)
  const tokenCookie = req.cookies.get('token')?.value;
  if (tokenCookie) {
    return;
  }

  // Fallback: Check Clerk session
  const { userId } = await auth();
  if (!userId) {
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
