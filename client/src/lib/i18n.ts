/**
 * i18n Stub Module — English Only
 *
 * This module provides a lightweight translation function that converts
 * dot-notation keys (e.g. "dashboard.total_employees") into readable
 * English text (e.g. "Total Employees").
 *
 * No multi-language support is needed; the system is English-only.
 */

/**
 * Convert a dot-notation key to human-readable English text.
 * Examples:
 *   "dashboard.total_employees" → "Total Employees"
 *   "adjustments.button.new"   → "New"
 *   "adminLogin.form.title"    → "Title"
 *   "status.active"            → "Active"
 */
function keyToText(key: string): string {
  if (!key || key.trim() === "") return key;

  // Take the last segment after the final dot
  const lastDot = key.lastIndexOf(".");
  const segment = lastDot >= 0 ? key.substring(lastDot + 1) : key;

  // Convert snake_case / camelCase to Title Case
  return segment
    // Insert space before uppercase letters (camelCase)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    // Replace underscores with spaces
    .replace(/_/g, " ")
    // Capitalize first letter of each word
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

type Locale = "en";

interface I18nReturn {
  /** Translate a key to English text */
  t: (key: string) => string;
  /** Current locale (always "en") */
  locale: Locale;
  /** Alias for locale */
  lang: Locale;
  /** No-op setter for locale */
  setLocale: (locale: Locale) => void;
  /** Alias for setLocale */
  setLang: (lang: Locale) => void;
}

/**
 * React hook for i18n (English-only stub).
 * Returns a `t()` function and locale info.
 */
export function useI18n(): I18nReturn {
  const t = (key: string): string => keyToText(key);

  return {
    t,
    locale: "en",
    lang: "en",
    setLocale: () => {},
    setLang: () => {},
  };
}

export default useI18n;
