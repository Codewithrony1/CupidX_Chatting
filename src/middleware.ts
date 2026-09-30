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
      process.env.ADMIN_MODE === 'true' &&
      (host === 'localhost:3000' ||
        host === '127.0.0.1:3000' ||
        host === '[::1]:3000' ||
        host === 'localhost:3001' ||
        host === '127.0.0.1:3001' ||
        host === '[::1]:3001');

    if (!isLocalHost) {
      return new NextResponse('Not Found', { status: 404 });
    }

    const adminSecret = process.env.ADMIN_SECRET;
    if (adminSecret) {
      const providedSecret = req.headers.get('x-admin-secret');
      const isAdminApi = pathname === '/api/admin' || pathname.startsWith('/api/admin/');
      if (isAdminApi && providedSecret !== adminSecret) {
        return new NextResponse('Forbidden', { status: 403 });
      }
    }
    return NextResponse.next();
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
