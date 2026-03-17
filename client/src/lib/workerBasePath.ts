import { isWorkerDomain } from "./portalBasePath";

/**
 * Returns the base path prefix for worker portal routes.
 * - On worker subdomain (worker.extendglobal.ai): "" (routes are at root)
 * - On admin/other: "/worker"
 */
export function getWorkerBasePath(): string {
  return isWorkerDomain() ? "" : "/worker";
}

/**
 * Constructs a full worker portal path.
 * Usage: workerPath("/login") → "/worker/login" or "/login" depending on domain
 */
export function workerPath(path: string): string {
  const base = getWorkerBasePath();
  if (path === "/" || path === "") return base || "/";
  return `${base}${path}`;
}
