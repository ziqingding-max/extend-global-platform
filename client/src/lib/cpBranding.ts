/**
 * CP Branding Utilities
 *
 * Detects CP subdomain from the hostname and provides
 * branding context for white-label rendering.
 *
 * Domain patterns:
 *   - {subdomain}.extendglobal.ai → CP branded portal
 *   - app.extendglobal.ai → EG direct (no CP branding)
 *   - localhost / *.manus.space → dev mode, use path-based CP detection
 */

/** Known non-CP subdomains that should not trigger branding lookup */
const RESERVED_SUBDOMAINS = new Set([
  "app",
  "admin",
  "api",
  "www",
  "worker",
  "staging",
  "dev",
]);

/** Production domain suffix */
const PROD_DOMAIN = "extendglobal.ai";

/**
 * Extract CP subdomain from the current hostname.
 * Returns null if on a non-CP domain (admin, app, localhost without override).
 */
export function getCpSubdomain(): string | null {
  if (typeof window === "undefined") return null;

  const hostname = window.location.hostname;

  // Production: {subdomain}.extendglobal.ai
  if (hostname.endsWith(`.${PROD_DOMAIN}`)) {
    const sub = hostname.replace(`.${PROD_DOMAIN}`, "");
    if (!sub.includes(".") && !RESERVED_SUBDOMAINS.has(sub)) {
      return sub;
    }
    return null;
  }

  // Development: check URL param ?cp=subdomain for testing
  const params = new URLSearchParams(window.location.search);
  const cpParam = params.get("cp");
  if (cpParam) return cpParam;

  return null;
}

/**
 * Returns true if the current hostname is a CP-branded domain.
 */
export function isCpDomain(): boolean {
  return getCpSubdomain() !== null;
}

/**
 * Returns the CP Portal base path.
 * On CP subdomain: "/cp" (CP admin routes)
 * On non-CP domain: "/cp" (path-based fallback)
 */
export function getCpBasePath(): string {
  return "/cp";
}

/**
 * Constructs a full CP Portal path.
 * Usage: cpPath("/dashboard") → "/cp/dashboard"
 */
export function cpPath(path: string): string {
  const base = getCpBasePath();
  if (path === "/" || path === "") return base || "/cp";
  return `${base}${path}`;
}

/**
 * Returns the portal path for End Client routes on a CP domain.
 * On CP subdomain: "/portal" (same as non-CP, but branded)
 */
export function getCpPortalPath(): string {
  return "/portal";
}

/**
 * Returns the worker path for Worker routes on a CP domain.
 * On CP subdomain: "/worker" (same as non-CP, but branded)
 */
export function getCpWorkerPath(): string {
  return "/worker";
}

/** Branding data returned from the server */
export interface CpBrandingData {
  companyName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  subdomain: string;
}

/**
 * Convert a hex color to HSL CSS variable format for Shadcn UI.
 * Input: "#2563EB" → Output: "217.2 91.2% 59.8%"
 */
export function hexToHsl(hex: string): string {
  // Remove # prefix
  hex = hex.replace(/^#/, "");

  // Parse RGB
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return `0 0% ${Math.round(l * 100)}%`;
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/**
 * Apply CP branding colors to the document root as CSS variables.
 * This makes all Shadcn UI components automatically use the CP's brand color.
 */
export function applyCpBrandingColors(primaryColor: string | null): void {
  if (!primaryColor) return;

  const hsl = hexToHsl(primaryColor);
  const root = document.documentElement;

  // Override the primary color CSS variable
  // Shadcn UI uses oklch format, but HSL works as a fallback
  root.style.setProperty("--primary", `hsl(${hsl})`);

  // Also set a lighter version for hover states
  const [h, s, l] = hsl.split(" ");
  const lightL = Math.min(parseInt(l) + 10, 95);
  root.style.setProperty(
    "--primary-foreground",
    `hsl(${h} ${s} ${lightL > 50 ? "10%" : "98%"})`
  );
}

/**
 * Reset branding colors to EG defaults.
 */
export function resetBrandingColors(): void {
  const root = document.documentElement;
  root.style.removeProperty("--primary");
  root.style.removeProperty("--primary-foreground");
}
