import type { Metadata, Viewport } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import { ClerkProvider } from '@clerk/nextjs';
import { AuthProvider } from '@/context/AuthContext';
import { SocketProvider } from '@/context/SocketContext';
import PWAInstallPrompt from '@/components/PWAInstallPrompt';
import { Analytics } from '@vercel/analytics/next';

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0d0014',
};

export const metadata: Metadata = {
  title: 'Cupidx — Connect. Chat. Move on.',
  description: 'Fast, mobile-friendly 1-to-1 direct and random chat web application with automatic ephemeral chat deletion on NEXT.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Cupidx',
  },
  keywords: ['Cupidx', 'random chat', 'direct chat', 'ephemeral messaging', 'private chat', '1-to-1 chat'],
  authors: [{ name: 'Cupidx Team' }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} dark h-full antialiased`}>
      <body className="font-sans min-h-full flex flex-col bg-slate-950 text-slate-100 overflow-x-hidden">
        <ClerkProvider>
          <AuthProvider>
            <SocketProvider>
              <PWAInstallPrompt />
              {children}
              <Analytics />
            </SocketProvider>
          </AuthProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
