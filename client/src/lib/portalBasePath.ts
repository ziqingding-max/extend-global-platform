/**
 * Portal Base Path Utility
 *
 * Detects whether the current hostname is a portal subdomain (app.geahr.com)
 * and returns the appropriate base path for portal routes.
 *
 * - On app.geahr.com → base path is "" (portal routes at root: /login, /dashboard, etc.)
 * - On admin.geahr.com or any other host → base path is "/portal" (portal routes at /portal/login, etc.)
 * - In development (localhost) → base path is "/portal" (path-based routing for convenience)
 */

const PORTAL_SUBDOMAINS = ["app.geahr.com"];
const WORKER_SUBDOMAINS = ["worker.geahr.com"];

/**
 * Returns true if the current hostname is a worker portal subdomain
 */
export function isWorkerDomain(): boolean {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return WORKER_SUBDOMAINS.some((d) => hostname === d);
}

/**
 * Returns true if the current hostname is a portal subdomain
 */
export function isPortalDomain(): boolean {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname;
  return PORTAL_SUBDOMAINS.some((d) => hostname === d);
}

/**
 * Returns true if the current hostname is an admin subdomain
 */
export function isAdminDomain(): boolean {
  if (typeof window === "undefined") return true;
  return !isPortalDomain();
}

/**
 * Returns the base path prefix for portal routes.
 * - On portal subdomain: "" (routes are at root)
 * - On admin/other: "/portal"
 */
export function getPortalBasePath(): string {
  return isPortalDomain() ? "" : "/portal";
}

/**
 * Constructs a full portal path.
 * Usage: portalPath("/login") → "/portal/login" or "/login" depending on domain
 */
export function portalPath(path: string): string {
  const base = getPortalBasePath();
  if (path === "/" || path === "") return base || "/";
  return `${base}${path}`;
}

/**
 * Returns the portal origin URL for constructing invite/reset links.
 * When on admin domain, the portal links should point to the portal domain.
 * When on portal domain, use current origin.
 */
export function getPortalOrigin(): string {
  if (typeof window === "undefined") return "";
  // If we're already on the portal domain, use current origin
  if (isPortalDomain()) return window.location.origin;
  // If we're on admin domain, construct the portal origin
  // In production: admin.geahr.com → app.geahr.com
  const hostname = window.location.hostname;
  if (hostname === "admin.geahr.com") {
    return `${window.location.protocol}//app.geahr.com`;
  }
  // Fallback for dev/manus.space: use current origin (path-based routing)
  return window.location.origin;
}
