import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isPublicRoute = createRouteMatcher([
  '/',
  '/login(.*)',
  '/register(.*)',
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

  const { userId } = await auth();
  const tokenCookie = req.cookies.get('token')?.value;

  // If neither Clerk session nor JWT token cookie exists, redirect unauthenticated user to /login
  if (!userId && !tokenCookie) {
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
