import type { NextConfig } from 'next';

// Build for GitVerse Pages with NEXT_PUBLIC_GITVERSE_PAGES=true (see package.json).
// GitVerse Pages requires all styles/scripts to use RELATIVE paths (./...),
// so we use a relative asset prefix instead of a basePath — the exported site
// then works from any sub-path, e.g. https://<owner>.gitverse.site/yarik-weather
const isGitVerse =
  process.env.NEXT_PUBLIC_GITVERSE_PAGES === 'true';

const nextConfig: NextConfig = {
  output: 'export',
  // Explicitly inject the flag into client bundles (Turbopack doesn't always
  // inline shell-level NEXT_PUBLIC_* vars into client code on its own)
  env: {
    NEXT_PUBLIC_GITVERSE_PAGES: process.env.NEXT_PUBLIC_GITVERSE_PAGES || '',
  },
  turbopack: {
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
    root: __dirname,
  },
  assetPrefix: isGitVerse ? './' : '',
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
