import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/signup',
  '/register',
  '/sign-in',
  '/sign-up',
  '/safety',
  '/community-guidelines',
  '/forgot-password',
  '/privacy',
  '/terms',
  '/refund',
  '/contact',
  '/sso-callback',
  '/auth-callback',
  '/setup-profile',
  '/onboarding',
  '/api/auth',
  '/api/health',
  '/api/payment/qr',
  '/api/payment/status',
  '/api/webhook',
  '/api/cron',
  '/uploads',
];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Admin Security Boundary: localhost only in ADMIN_MODE
  const isAdminPath =
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/api/admin' ||
    pathname.startsWith('/api/admin/');

  if (isAdminPath) {
    const host = (req.headers.get('host') ?? '').toLowerCase();
    const isLocalHost =
      (host === 'localhost:3000' ||
        host === '127.0.0.1:3000' ||
        host === '[::1]:3000' ||
        host === 'localhost:3001' ||
        host === '127.0.0.1:3001' ||
        host === '[::1]:3001');

    const adminSecret = process.env.ADMIN_SECRET;
    const providedSecret = req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('admin_secret');
    const hasSecretMatch = Boolean(adminSecret && providedSecret === adminSecret);

    const token = req.cookies.get('token')?.value;
    const clerkSession = req.cookies.get('__session')?.value;
    const hasSession = Boolean(token || clerkSession);

    // If local dev or valid secret or has active session, let request reach route handler
    // (The route handler performs authoritative server-side role === 'ADMIN' verification)
    if (isLocalHost || hasSecretMatch || hasSession) {
      return NextResponse.next();
    }

    if (pathname.startsWith('/api/admin')) {
      return new NextResponse(JSON.stringify({ error: 'Admin authorization required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Allow public routes
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  // 3. Protected route: verify native JWT cookie ('token') or Clerk session ('__session')
  const token = req.cookies.get('token')?.value;
  const clerkSession = req.cookies.get('__session')?.value;

  if (!token && !clerkSession) {
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
