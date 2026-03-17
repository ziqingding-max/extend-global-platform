// ── Admin Constants ──
export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

// ── Portal Constants (strictly separate from admin) ──
export const PORTAL_COOKIE_NAME = "portal_session";
export const PORTAL_UNAUTHED_ERR_MSG = 'Portal: Please login (20001)';
export const PORTAL_FORBIDDEN_ERR_MSG = 'Portal: Insufficient permissions (20002)';
export const PORTAL_JWT_EXPIRY = '7d';
export const PORTAL_INVITE_EXPIRY_HOURS = 72; // Invite link valid for 72 hours
