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

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) {
    return;
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
