/**
 * Returns the correct path for static assets when deployed
 * under a sub-path (e.g. GitVerse Pages /yarik-weather/).
 *
 * Uses a compile-time constant so server/client render identically.
 * For GitVerse Pages we emit RELATIVE paths (./...) — this matches the
 * relative `assetPrefix` in next.config.ts and works from any sub-path.
 */
const PREFIX = process.env.GITVERSE_PAGES === 'true' ? './' : '';

export function assetUrl(path: string): string {
  return PREFIX + path;
}
