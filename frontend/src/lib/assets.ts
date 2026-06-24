/**
 * Returns the correct path for static assets when deployed
 * under a sub-path (e.g. GitHub Pages /yarik-weather/).
 *
 * Uses a compile-time constant so server/client render identically.
 * Only applies the prefix when building for GitHub Pages.
 */
const PREFIX = process.env.GITHUB_PAGES === 'true' ? '/yarik-weather' : '';

export function assetUrl(path: string): string {
  return PREFIX + path;
}
