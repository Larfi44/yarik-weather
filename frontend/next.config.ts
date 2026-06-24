import type { NextConfig } from 'next';

const repo = process.env.GITHUB_REPOSITORY?.split('/')[1] || 'yarik-weather';
// Only use sub-path prefix when building for GitHub Pages
const isPages = process.env.GITHUB_PAGES === 'true';
const prefix = isPages ? `/${repo}` : '';

const nextConfig: NextConfig = {
  output: 'export',
  turbopack: {
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
  },
  basePath: prefix,
  assetPrefix: isPages ? `/${repo}/` : '',
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
