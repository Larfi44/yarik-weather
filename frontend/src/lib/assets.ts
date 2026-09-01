/**
 * Returns the correct path for static assets when deployed
 * under a sub-path (e.g. GitVerse Pages /yarik-weather/).
 *
 * Uses a compile-time constant so server/client render identically.
 * For GitVerse Pages we emit RELATIVE paths (./...) — this matches the
 * relative `assetPrefix` in next.config.ts and works from any sub-path.
 *
 * NOTE: must be a NEXT_PUBLIC_* env var so it is inlined into the
 * client-side bundle (plain env vars are only visible to Node/SSR).
 */
const PREFIX =
  process.env.NEXT_PUBLIC_GITVERSE_PAGES === 'true' ? './' : '';

export function assetUrl(path: string): string {
  // Avoid ".<//" double slash when concatenating "./" with a "/"-leading path
  return PREFIX ? PREFIX + path.replace(/^\//, '') : path;
}
