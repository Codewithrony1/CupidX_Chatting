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
  '/api/auth/login(.*)',
  '/api/auth/register(.*)',
  '/api/auth/logout(.*)',
  '/api/auth/me(.*)',
  '/api/payment/qr(.*)',
]);

const isAdminRoute = createRouteMatcher([
  '/admin(.*)',
  '/api/admin(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) {
    return;
  }

  const isApiRoute = req.nextUrl.pathname.startsWith('/api/');

  // 1. Admin Route Protection
  if (isAdminRoute(req)) {
    if (process.env.ADMIN_MODE === 'true' || process.env.NODE_ENV !== 'production') {
      return;
    }

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

    if (isApiRoute) {
      return NextResponse.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }
    const redirectUrl = new URL('/dashboard', req.url);
    return NextResponse.redirect(redirectUrl);
  }

  // 2. Protected Routes (Client Pages + APIs)
  const tokenCookie = req.cookies.get('token')?.value;
  const { userId } = await auth();

  if (!userId && !tokenCookie) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 });
    }
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
