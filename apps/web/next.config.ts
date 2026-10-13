import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // packages/core xuất mã TypeScript nguồn, Next cần transpile trong monorepo.
  transpilePackages: ['@research-hub/core'],
};

export default nextConfig;
