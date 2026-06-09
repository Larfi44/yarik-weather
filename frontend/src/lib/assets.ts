/**
 * Returns the correct path for static assets when deployed
 * under a sub-path (e.g. GitHub Pages /yarik-weather/).
 */
export function assetUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  // Get the base path from the current location
  const parts = window.location.pathname.split('/').filter(Boolean);
  // If we're on a sub-path like /yarik-weather/..., use it as prefix
  return parts.length > 0
    ? `/${parts[0]}${path.startsWith('/') ? path : `/${path}`}`
    : path;
}
