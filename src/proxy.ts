import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/',
  '/login',
  '/register',
  '/signup',
  '/privacy',
  '/terms',
  '/sso-callback',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/auth/me',
  '/api/payment/qr',
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PATHS.some((p) => p !== '/' && pathname.startsWith(p + '/'));
}

function isAdmin(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin/');
}

export default function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // 1. Static asset bypass
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|json|css|js|txt)$/)
  ) {
    return NextResponse.next();
  }

  // 2. Allow public routes
  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const isApiRoute = pathname.startsWith('/api/');
  const tokenCookie = req.cookies.get('token')?.value;
  const authHeader = req.headers.get('authorization');

  // 3. Admin routes gate
  if (isAdmin(pathname)) {
    if (process.env.ADMIN_MODE === 'true' || process.env.NODE_ENV !== 'production') {
      return NextResponse.next();
    }

    if (tokenCookie) {
      try {
        const parts = tokenCookie.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          if (payload && payload.role === 'ADMIN') {
            return NextResponse.next();
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

  // 4. Protected Routes gate (Strict verification)
  if (!tokenCookie && !authHeader) {
    if (isApiRoute) {
      return NextResponse.json({ error: 'Unauthorized. Please log in first.' }, { status: 401 });
    }
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
