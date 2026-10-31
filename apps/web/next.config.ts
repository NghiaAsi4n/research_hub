import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // packages/core xuất mã TypeScript nguồn, Next cần transpile trong monorepo.
  transpilePackages: ['@research-hub/core'],
  serverExternalPackages: ['pdfjs-dist'],
  // Font nhúng cho bản PDF nằm trong packages/core; copy theo route xuất file để Vercel có file.
  outputFileTracingIncludes: {
    '/api/export/**': ['../../packages/core/src/assets/fonts/**'],
  },
};

export default nextConfig;
