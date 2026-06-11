/**
 * Returns the correct path for static assets when deployed
 * under a sub-path (e.g. GitHub Pages /yarik-weather/).
 *
 * Uses a compile-time constant so server/client render identically.
 */
const PREFIX = process.env.NODE_ENV === 'production' ? '/yarik-weather' : '';

export function assetUrl(path: string): string {
  return PREFIX + path;
}
