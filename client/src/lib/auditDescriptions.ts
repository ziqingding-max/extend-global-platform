/**
 * Human-readable audit log description formatter
 * Converts raw action + entityType + changes into clear, understandable descriptions
 */

const ENTITY_LABELS: Record<string, string> = {
  customer: "Customer",
  employee: "Employee",
  payroll_run: "Payroll Run",
  payroll_item: "Payroll Item",
  invoice: "Invoice",
  invoices: "Invoices",
  invoice_item: "Invoice Item",
  adjustment: "Adjustment",
  leave_record: "Leave Record",
  country_config: "Country/Region",
  leave_type: "Leave Type",
  exchange_rate: "Exchange Rate",
  exchange_rates: "Exchange Rates",
  billing_entity: "Billing Entity",
  employee_document: "Employee Document",
  employee_contract: "Employee Contract",
  customer_pricing: "Customer Pricing",
  customer_contact: "Customer Contact",
  customer_contract: "Customer Contract",
  sales_lead: "Sales Lead",
  user: "User",
  system: "System",
};

const ACTION_LABELS: Record<string, string> = {
  create: "Created",
  update: "Updated",
  delete: "Deleted",
  approve: "Approved",
  reject: "Rejected",
  cancel: "Cancelled",
  auto_fill: "Auto-filled",
  batch_create: "Batch created",
  batch_update: "Batch updated",
  generate: "Generated",
  regenerate: "Regenerated",
  initialize: "Initialized",
  upsert: "Updated",
  update_role: "Changed role of",
  activate: "Activated",
  deactivate: "Deactivated",
  upload_receipt: "Uploaded receipt for",
  auto_create: "Auto-created",
  auto_lock_monthly: "Auto-locked monthly data",
  employee_auto_activated: "Auto-activated",
  employee_auto_added_to_payroll: "Auto-added to payroll",
  payroll_run_auto_created: "Auto-created",
  employee_auto_on_leave: "Auto-marked on leave",
  employee_auto_return_from_leave: "Auto-returned from leave",
  payroll_submit_lock: "Submitted and locked",
  fetch_live: "Fetched live rates for",
  convert_to_customer: "Converted to customer",
};

/**
 * Parse the changes JSON field to extract meaningful details
 */
function parseChanges(changes: any): string {
  if (!changes) return "";
  
  try {
    const parsed = typeof changes === "string" ? JSON.parse(changes) : changes;
    
    // If it's a simple string, return it
    if (typeof parsed === "string") return parsed;
    
    // If it has a description field, use it
    if (parsed.description) return parsed.description;
    
    // If it has name/companyName, show it
    if (parsed.companyName) return `"${parsed.companyName}"`;
    if (parsed.name) return `"${parsed.name}"`;
    
    // If it has employee info
    if (parsed.firstName && parsed.lastName) return `${parsed.firstName} ${parsed.lastName}`;
    if (parsed.employeeName) return parsed.employeeName;
    
    // If it has invoiceNumber
    if (parsed.invoiceNumber) return `#${parsed.invoiceNumber}`;
    
    // If it has status changes
    if (parsed.from && parsed.to) return `${parsed.from} → ${parsed.to}`;
    if (parsed.oldStatus && parsed.newStatus) return `${parsed.oldStatus} → ${parsed.newStatus}`;
    
    // If it has a message
    if (parsed.message) return parsed.message;
    
    // If it has count info
    if (parsed.count !== undefined) return `${parsed.count} items`;
    
    // If it has currency pair info
    if (parsed.fromCurrency && parsed.toCurrency) return `${parsed.fromCurrency} → ${parsed.toCurrency}`;
    
    // For objects with a few key fields, show them
    const keys = Object.keys(parsed);
    if (keys.length <= 3) {
      return keys.map(k => `${k}: ${parsed[k]}`).join(", ");
    }
    
    return "";
  } catch {
    if (typeof changes === "string") return changes;
    return "";
  }
}

/**
 * Format an audit log entry into a human-readable description
 */
export function formatAuditDescription(log: {
  action: string;
  entityType: string;
  entityId?: number | null;
  changes?: any;
  userName?: string | null;
}): string {
  const actionLabel = ACTION_LABELS[log.action] || log.action;
  const entityLabel = ENTITY_LABELS[log.entityType] || log.entityType;
  const details = parseChanges(log.changes);
  
  // Special cases for system actions
  if (log.action === "auto_lock_monthly") {
    return `System auto-locked adjustments and leave records for the month${details ? ` — ${details}` : ""}`;
  }
  
  if (log.action === "employee_auto_activated") {
    return `System auto-activated employee #${log.entityId}${details ? ` (${details})` : ""}`;
  }
  
  if (log.action === "employee_auto_added_to_payroll") {
    return `System auto-added employee to payroll run #${log.entityId}${details ? ` — ${details}` : ""}`;
  }
  
  if (log.action === "payroll_run_auto_created") {
    return `System auto-created payroll run #${log.entityId}${details ? ` — ${details}` : ""}`;
  }
  
  if (log.action === "employee_auto_on_leave") {
    return `System marked employee #${log.entityId} as on leave${details ? ` — ${details}` : ""}`;
  }
  
  if (log.action === "employee_auto_return_from_leave") {
    return `System returned employee #${log.entityId} from leave${details ? ` — ${details}` : ""}`;
  }
  
  if (log.action === "fetch_live") {
    return `Fetched live exchange rates from ECB${details ? ` — ${details}` : ""}`;
  }
  
  if (log.action === "initialize") {
    return `Initialized ${entityLabel.toLowerCase()} defaults${details ? ` — ${details}` : ""}`;
  }
  
  if (log.action === "auto_fill") {
    return `Auto-filled payroll run #${log.entityId} with employee data${details ? ` — ${details}` : ""}`;
  }
  
  if (log.action === "payroll_submit_lock") {
    return `Submitted and locked payroll run #${log.entityId}${details ? ` — ${details}` : ""}`;
  }
  
  // Standard pattern: "Action EntityType #ID — details"
  const parts: string[] = [actionLabel, entityLabel.toLowerCase()];
  
  if (log.entityId) {
    parts.push(`#${log.entityId}`);
  }
  
  let result = parts.join(" ");
  
  if (details) {
    result += ` — ${details}`;
  }
  
  return result;
}

/**
 * Get a short summary for Dashboard Recent Activity
 */
export function formatActivitySummary(log: {
  action: string;
  entityType: string;
  entityId?: number | null;
  changes?: any;
  resolvedUserName?: string | null;
  userName?: string | null;
  userId?: number | null;
}): string {
  const desc = formatAuditDescription(log);
  const who = log.resolvedUserName || log.userName;
  if (who) return `${who}: ${desc}`;
  return desc;
}
