/**
 * App base path helpers for bridging MemoryRouter's origin-relative URLs and
 * the browser's public URL bar when mux is served behind a path-rewriting
 * reverse proxy.
 *
 * Background: `history.pushState(state, "", url)` and `history.replaceState`
 * ignore `<base href>` per the HTML spec — they resolve `url` against the
 * document URL. So when our MemoryRouter calls `replaceState(null, "", "/settings")`,
 * a path-app proxy prefix like `/@user/ws.main/apps/mux/` is stripped from
 * the URL bar. On refresh, the browser requests `/settings` (bypassing the
 * proxy entirely) and 404s.
 *
 * Fix: the server-injected `<base href>` already climbs to the SPA root
 * regardless of nesting depth, so `new URL(document.baseURI).pathname` gives
 * us the public path prefix. We capture it once at module load — before any
 * `replaceState` call can corrupt `window.location.pathname` — and use it to
 * translate router-internal paths to public URLs and back.
 */

function isBrowserWithBase(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }
  // Electron file:// reloads always boot through index.html and restore via
  // localStorage; no proxy prefix to manage there.
  if (window.location.protocol === "file:") {
    return false;
  }
  return true;
}

function computeAppBasePath(): string {
  if (!isBrowserWithBase()) {
    return "/";
  }

  // Only trust `document.baseURI` if there's an explicit `<base>` element.
  // Without one, `baseURI` falls back to the document URL, which would make
  // us incorrectly treat every current URL as a "proxy prefix".
  const baseEl = document.querySelector("base[href]");
  if (!baseEl) {
    return "/";
  }

  try {
    const baseUri = new URL(document.baseURI);
    // The server-injected `<base href>` always ends in `/`, so the resolved
    // pathname does too. Be defensive and trim a non-slash-terminated path
    // to its parent directory.
    const pathname = baseUri.pathname;
    if (pathname.endsWith("/")) {
      return pathname;
    }
    const lastSlash = pathname.lastIndexOf("/");
    return lastSlash >= 0 ? pathname.slice(0, lastSlash + 1) : "/";
  } catch {
    return "/";
  }
}

// Cache the base path at module load so it's captured before MemoryRouter's
// first `useUrlSync` pass can overwrite `window.location` via `replaceState`.
// Callers that need to refresh after DOM changes can use `refreshAppBasePath`.
let cachedAppBasePath: string | null = null;

/**
 * Returns the app's base path (the public prefix under which mux is served),
 * always ending in `/`. Returns `"/"` when there is no proxy prefix (direct
 * origin access, Electron, or no `<base href>`).
 *
 * Cached at first call. Safe for hot paths.
 */
export function getAppBasePath(): string {
  cachedAppBasePath ??= computeAppBasePath();
  return cachedAppBasePath;
}

/**
 * Force a recomputation of the cached base path. Intended for tests that
 * swap `globalThis.window` between cases.
 */
export function refreshAppBasePath(): void {
  cachedAppBasePath = null;
}

/**
 * Convert a browser-URL-bar path (e.g. `/@user/ws.main/apps/mux/settings`)
 * into a router-internal path (e.g. `/settings`). Accepts a full
 * `pathname + search + hash` string; returns the same shape.
 *
 * Identity when there is no proxy prefix or when `pathWithSearchAndHash`
 * doesn't start with the prefix.
 */
export function stripAppBasePath(pathWithSearchAndHash: string): string {
  const base = getAppBasePath();
  if (base === "/") {
    return pathWithSearchAndHash;
  }
  // Base ends in "/". Match either exactly the base (e.g. "/prefix/") or
  // the base followed by more path (e.g. "/prefix/settings").
  const baseNoTrailing = base.slice(0, -1);
  if (pathWithSearchAndHash === baseNoTrailing) {
    return "/";
  }
  if (pathWithSearchAndHash.startsWith(base)) {
    return "/" + pathWithSearchAndHash.slice(base.length);
  }
  return pathWithSearchAndHash;
}

/**
 * Convert a router-internal path (e.g. `/settings`) into a browser-URL-bar
 * path (e.g. `/@user/ws.main/apps/mux/settings`). Accepts a full
 * `pathname + search + hash` string; returns the same shape.
 *
 * Identity when there is no proxy prefix.
 */
export function joinAppBasePath(routerPath: string): string {
  const base = getAppBasePath();
  if (base === "/") {
    return routerPath;
  }
  if (routerPath === "/") {
    return base;
  }
  if (!routerPath.startsWith("/")) {
    // Defensive: router paths should always be absolute, but if a caller
    // hands us a relative one, just append it to the base.
    return base + routerPath;
  }
  // Base ends in "/", router path starts with "/", so drop one slash.
  return base + routerPath.slice(1);
}
