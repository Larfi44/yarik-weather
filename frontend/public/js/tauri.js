/**
 * Tauri helpers.
 * Vanilla-JS port of frontend/src/lib/tauri.ts.
 *
 * The React version imported `openUrl` from @tauri-apps/plugin-opener, which
 * ultimately calls `invoke('plugin:opener|open_url', { url, with })` through
 * the IPC bridge that Tauri v2 exposes as `window.__TAURI_INTERNALS__.invoke`.
 * Without a bundler we call that command directly, which keeps the exact same
 * behaviour (open in the system browser) and falls back to window.open.
 */
window.YW = window.YW || {};

(function (YW) {
  'use strict';

  /** Detect if the app is running inside Tauri (desktop/mobile). */
  function isTauri() {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }

  /** Opens a URL in the system's default external browser / a new tab. */
  async function openExternal(url) {
    try {
      const internals = window.__TAURI_INTERNALS__;
      if (!internals || typeof internals.invoke !== 'function') {
        throw new Error('Not running inside Tauri');
      }
      await internals.invoke('plugin:opener|open_url', { url: url, with: null });
    } catch (err) {
      console.error('Failed to open URL:', err);
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  YW.tauri = { isTauri: isTauri, openExternal: openExternal };
})(window.YW);
