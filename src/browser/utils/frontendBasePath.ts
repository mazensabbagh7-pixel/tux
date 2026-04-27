import { getAppProxyBasePathFromPathname, stripAppProxyBasePath } from "@/common/appProxyBasePath";

function getInitialAppProxyBasePath(): string | null {
  // Startup-time module initialization must tolerate partial DOM shims in tests or
  // unusual hosts. A defined-but-incomplete `window` should behave like no browser
  // window rather than poisoning every route helper import.
  if (typeof window === "undefined" || !window.location) {
    return null;
  }

  return getAppProxyBasePathFromPathname(window.location.pathname);
}

export const INITIAL_APP_PROXY_BASE_PATH = getInitialAppProxyBasePath();

function normalizeRootRelativePath(pathname: string): string {
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

export function stripInitialAppProxyBasePathFromPathname(pathname: string): string {
  if (!INITIAL_APP_PROXY_BASE_PATH) {
    return pathname;
  }

  const strippedPathname = stripAppProxyBasePath(pathname);
  return strippedPathname.basePath === INITIAL_APP_PROXY_BASE_PATH
    ? strippedPathname.routePathname
    : pathname;
}

export function prependInitialAppProxyBasePath(pathname: string): string {
  const rootRelativePathname = normalizeRootRelativePath(pathname);
  return INITIAL_APP_PROXY_BASE_PATH
    ? `${INITIAL_APP_PROXY_BASE_PATH}${rootRelativePathname}`
    : rootRelativePathname;
}

export function resolveBrowserAssetUrl(pathname: string): string {
  const proxiedPathname = prependInitialAppProxyBasePath(pathname);
  return typeof document === "undefined"
    ? proxiedPathname
    : new URL(proxiedPathname, document.baseURI).toString();
}
