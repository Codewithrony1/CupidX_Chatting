import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    'better-sqlite3',
    '@prisma/adapter-better-sqlite3',
    'firebase-admin',
  ],
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
