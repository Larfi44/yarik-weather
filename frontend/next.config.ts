import type { NextConfig } from 'next';

const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] || 'yarik-weather';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: process.env.NODE_ENV === 'production' ? `/${repo}` : '',
  assetPrefix: process.env.NODE_ENV === 'production' ? `/${repo}/` : '',
  images: {
    unoptimized: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  devIndicators: false,
  trailingSlash: true,
};

export default nextConfig;
