/**
 * CurrencyAmount — Display and input component for currency amounts
 * 
 * Handles large amounts (KRW, VND, IDR can be billions) with proper formatting:
 * - Thousand separators for display
 * - Zero-decimal currencies (KRW, VND, IDR, JPY, etc.) show no decimal places
 * - Standard currencies show 2 decimal places
 * - Input supports large numbers without scientific notation
 */

/** Currencies that use 0 decimal places */
const ZERO_DECIMAL_CURRENCIES = new Set([
  "KRW", "VND", "IDR", "JPY", "TWD", "CLP", "ISK", "UGX", "RWF",
  "PYG", "GNF", "KMF", "XAF", "XOF", "XPF", "BIF", "DJF", "MGA",
  "VUV",
]);

/**
 * Get the number of decimal places for a currency
 */
export function getCurrencyDecimals(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
}

/**
 * Format a number/string amount with thousand separators and proper decimals
 */
export function formatCurrencyAmount(
  amount: string | number | null | undefined,
  currency: string = "USD",
  options?: { showCurrency?: boolean }
): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num)) return "—";
  
  const decimals = getCurrencyDecimals(currency);
  const formatted = num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  
  if (options?.showCurrency) {
    return `${currency} ${formatted}`;
  }
  return formatted;
}

/**
 * Display component for currency amounts
 */
export function CurrencyDisplay({
  amount,
  currency = "USD",
  showCurrency = false,
  className = "",
}: {
  amount: string | number | null | undefined;
  currency?: string;
  showCurrency?: boolean;
  className?: string;
}) {
  return (
    <span className={`font-mono ${className}`}>
      {formatCurrencyAmount(amount, currency, { showCurrency })}
    </span>
  );
}

/**
 * Input component for currency amounts that handles large numbers properly
 * Uses text input to avoid scientific notation issues with large numbers
 */
export function CurrencyInput({
  value,
  onChange,
  currency = "USD",
  className = "",
  placeholder,
  readOnly = false,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  currency?: string;
  className?: string;
  placeholder?: string;
  readOnly?: boolean;
  disabled?: boolean;
}) {
  const decimals = getCurrencyDecimals(currency);
  
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    
    // Allow empty, negative sign, or valid number patterns
    if (val === "" || val === "-") {
      onChange(val);
      return;
    }
    
    // Remove any non-numeric characters except decimal point and minus
    val = val.replace(/[^0-9.\-]/g, "");
    
    // Ensure only one decimal point
    const parts = val.split(".");
    if (parts.length > 2) {
      val = parts[0] + "." + parts.slice(1).join("");
    }
    
    // For zero-decimal currencies, remove decimal point
    if (decimals === 0) {
      val = val.replace(/\./g, "");
    }
    
    // Limit decimal places
    if (decimals > 0 && parts.length === 2 && parts[1].length > decimals) {
      val = parts[0] + "." + parts[1].substring(0, decimals);
    }
    
    onChange(val);
  };
  
  return (
    <input
      type="text"
      inputMode="decimal"
      className={`flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 font-mono ${readOnly ? "bg-muted" : ""} ${className}`}
      value={value}
      onChange={handleChange}
      placeholder={placeholder || (decimals === 0 ? "0" : "0.00")}
      readOnly={readOnly}
      disabled={disabled}
    />
  );
}

export default CurrencyDisplay;
