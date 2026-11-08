/**
 * Tauri helpers.
 * Vanilla-JS port of frontend/src/lib/tauri.ts.
 *
 * The React version imported `openUrl` from @tauri-apps/plugin-opener, which
 * ultimately calls `invoke('plugin:opener|open_url', { url, with })` through
 * the IPC bridge that Tauri v2 exposes as `window.__TAURI_INTERNALS__.invoke`.
 * Without a bundler we call that command directly, which keeps the exact same
 * behaviour (open in the system browser) and falls back to window.open on the
 * plain web build.
 *
 * Three layers make sure a link can never replace the app with a web page:
 *   1. `installLinkRouter()` intercepts clicks on any <a href> that points
 *      outside the app and hands it to the opener (browser / mail / dialer).
 *   2. Inside Tauri `window.open` is patched to do the same, so target=_blank
 *      anchors and window.open() calls don't spawn an in-app window either.
 *   3. src-tauri/src/lib.rs cancels such navigations natively and opens the URL
 *      through the OS as a last resort.
 */
window.YW = window.YW || {};

(function (YW) {
  'use strict';

  /** Schemes that must be handled by the OS, never by the webview. */
  const EXTERNAL_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];
  /** Hosts the bundled frontend is served from (tauri.localhost on Android). */
  const APP_HOSTS = [
    'localhost',
    'tauri.localhost',
    'ipc.localhost',
    '127.0.0.1',
    '::1',
    '[::1]',
  ];

  // Saved before the Tauri build patches window.open, so the fallbacks below
  // can still reach the original implementation.
  const nativeWindowOpen =
    typeof window.open === 'function' ? window.open.bind(window) : null;

  let routerInstalled = false;

  /** Detect if the app is running inside Tauri (desktop/mobile). */
  function isTauri() {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }

  /** Parses an href against the current document URL; null when unusable. */
  function parseHref(href) {
    try {
      return new URL(href, window.location.href);
    } catch (err) {
      return null;
    }
  }

  /** True when the URL belongs to the app bundle itself (our own assets). */
  function isAppUrl(url) {
    const scheme = url.protocol;
    if (scheme === 'tauri:' || scheme === 'asset:' || scheme === 'ipc:') {
      return true;
    }
    if (APP_HOSTS.indexOf(url.hostname) !== -1) return true;
    // On the plain web build the app is just a page on some site, so anything
    // on the same origin is ours and must not be pushed into a new tab.
    const here = window.location;
    return (
      (here.protocol === 'http:' || here.protocol === 'https:') &&
      url.origin === here.origin
    );
  }

  /**
   * True for hrefs that belong in the system browser / mail client / dialer:
   * web pages, mailto: and tel: links. In-page fragments, javascript: URLs and
   * the app's own files stay in the webview.
   */
  function isExternalHref(href) {
    if (!href) return false;
    const trimmed = String(href).trim();
    // "#section" never leaves the document; "//host" is external (parseHref).
    if (!trimmed || trimmed.charAt(0) === '#') return false;
    const url = parseHref(trimmed);
    if (!url || EXTERNAL_SCHEMES.indexOf(url.protocol) === -1) return false;
    if (url.protocol === 'mailto:' || url.protocol === 'tel:') return true;
    return !isAppUrl(url);
  }

  /** Opens a URL in the system's default external browser / a new tab. */
  async function openExternal(url) {
    const target = String(url);
    const internals = isTauri() ? window.__TAURI_INTERNALS__ : null;
    if (!internals || typeof internals.invoke !== 'function') {
      if (nativeWindowOpen) {
        nativeWindowOpen(target, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    try {
      await internals.invoke('plugin:opener|open_url', {
        url: target,
        with: null,
      });
    } catch (err) {
      console.error('Failed to open URL in the system browser:', err);
      // Not window.open(): inside Tauri that is the patched version below, so
      // the call would loop. The native webview navigation is cancelled by the
      // Rust guard, which retries through the OS opener instead.
      if (nativeWindowOpen) {
        nativeWindowOpen(target, '_blank', 'noopener,noreferrer');
      }
    }
  }

  /** Document-level click handler: routes external anchors outside the app. */
  function routeClick(event) {
    // A component may have handled the click already (or cancelled it).
    if (event.defaultPrevented) return;
    const target = event.target;
    const anchor =
      target && typeof target.closest === 'function'
        ? target.closest('a[href]')
        : null;
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!isExternalHref(href)) return;
    event.preventDefault();
    const url = parseHref(href.trim());
    openExternal(url ? url.href : href);
  }

  /**
   * Tauri turns window.open() into an in-app window, which is exactly what we
   * want to avoid for web links — send those to the OS browser instead.
   */
  function patchWindowOpen() {
    if (!nativeWindowOpen || window.open.__ywRouter) return;
    const patched = function (url) {
      // Plain popups (window.open()) keep their old behaviour.
      if (url === undefined || url === null || url === '') {
        return nativeWindowOpen();
      }
      if (!isExternalHref(String(url))) {
        return nativeWindowOpen(url, '_blank', 'noopener,noreferrer');
      }
      openExternal(String(url));
      return null;
    };
    patched.__ywRouter = true;
    window.open = patched;
  }

  /** Installs the link router once; safe to call from anywhere. */
  function installLinkRouter() {
    if (routerInstalled || typeof document === 'undefined') return;
    routerInstalled = true;
    // Bubble phase: element handlers run first and may call preventDefault(),
    // which routeClick then respects — so a link never opens twice.
    document.addEventListener('click', routeClick, false);
    document.addEventListener('auxclick', routeClick, false);
    if (isTauri()) patchWindowOpen();
  }

  YW.tauri = {
    isTauri: isTauri,
    openExternal: openExternal,
    isExternalHref: isExternalHref,
    installLinkRouter: installLinkRouter,
  };

  // Every script is loaded with `defer`, so the document exists by now.
  installLinkRouter();
})(window.YW);
