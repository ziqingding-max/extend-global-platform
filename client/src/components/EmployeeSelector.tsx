/**
 * EmployeeSelector — Cascading employee selector with customer filter and search
 * 
 * Features:
 * - Optional customer pre-filter (cascading: select customer → see only their employees)
 * - Type-to-search by employee name
 * - Shows employee country and code for disambiguation
 * - Supports filtering by employee status (default: active + on_leave)
 * - Supports country filter (only show employees from a specific country)
 * - Supports excluding specific employee IDs (e.g. already added to payroll)
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, X } from "lucide-react";

export interface EmployeeSelectorProps {
  value: number; // selected employeeId
  onValueChange: (employeeId: number) => void;
  /** If true, show customer selector above employee selector */
  showCustomerFilter?: boolean;
  /** Pre-selected customerId (controlled externally) */
  customerId?: number;
  onCustomerChange?: (customerId: number | undefined) => void;
  /** Which employee statuses to include (default: active, on_leave) */
  allowedStatuses?: string[];
  /** Only show employees from this country code */
  countryFilter?: string;
  /** Exclude these employee IDs from the dropdown (e.g. already in payroll) */
  excludeEmployeeIds?: number[];
  /** Label for the employee field */
  label?: string;
  /** Whether field is required */
  required?: boolean;
  /** Error styling class */
  errorClass?: string;
  /** Placeholder text */
  placeholder?: string;
  disabled?: boolean;
}

export default function EmployeeSelector({
  value,
  onValueChange,
  showCustomerFilter = true,
  customerId: externalCustomerId,
  onCustomerChange,
  allowedStatuses = ["active", "on_leave"],
  countryFilter,
  excludeEmployeeIds = [],
  label = "Employee",
  required = false,
  errorClass = "",
  placeholder = "Search or select employee...",
  disabled = false,
}: EmployeeSelectorProps) {
  const [internalCustomerId, setInternalCustomerId] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Use external customerId if provided, otherwise internal
  const activeCustomerId = externalCustomerId !== undefined
    ? (externalCustomerId > 0 ? String(externalCustomerId) : "all")
    : internalCustomerId;

  // Fetch data
  const { data: employeesData } = trpc.employees.list.useQuery({ limit: 500 });
  const { data: customersData } = trpc.customers.list.useQuery({ limit: 200 });

  const customersList = customersData?.data || [];
  const allEmployees = employeesData?.data || [];

  // Filter employees by status, customer, country, exclusion list, and search term
  const filteredEmployees = useMemo(() => {
    let list = allEmployees;

    // Filter by allowed statuses
    if (allowedStatuses.length > 0) {
      list = list.filter((e) => allowedStatuses.includes(e.status));
    }

    // Filter by country
    if (countryFilter) {
      list = list.filter((e) => e.country === countryFilter);
    }

    // Filter by customer
    if (activeCustomerId !== "all") {
      const cid = parseInt(activeCustomerId);
      list = list.filter((e) => e.customerId === cid);
    }

    // Exclude specific employee IDs
    if (excludeEmployeeIds.length > 0) {
      const excludeSet = new Set(excludeEmployeeIds);
      list = list.filter((e) => !excludeSet.has(e.id));
    }

    // Filter by search term (name, code, email)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      list = list.filter((e) => {
        const fullName = `${e.firstName} ${e.lastName}`.toLowerCase();
        const code = (e.employeeCode || "").toLowerCase();
        const email = (e.email || "").toLowerCase();
        return fullName.includes(term) || code.includes(term) || email.includes(term);
      });
    }

    return list;
  }, [allEmployees, allowedStatuses, countryFilter, activeCustomerId, excludeEmployeeIds, searchTerm]);

  // Get selected employee display name
  const selectedEmployee = useMemo(() => {
    if (!value) return null;
    return allEmployees.find((e) => e.id === value) || null;
  }, [value, allEmployees]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCustomerChange = (val: string) => {
    setInternalCustomerId(val);
    onCustomerChange?.(val === "all" ? undefined : parseInt(val));
    // Clear employee selection when customer changes
    if (value) {
      const emp = allEmployees.find((e) => e.id === value);
      if (emp && val !== "all" && String(emp.customerId) !== val) {
        onValueChange(0);
      }
    }
  };

  const handleSelectEmployee = (empId: number) => {
    onValueChange(empId);
    setIsOpen(false);
    setSearchTerm("");
  };

  const handleClear = () => {
    onValueChange(0);
    setSearchTerm("");
  };

  // Get customer name for an employee
  const getCustomerName = (customerId: number) => {
    const c = customersList.find((c) => c.id === customerId);
    return c?.companyName || "";
  };

  return (
    <div className="space-y-3">
      {/* Customer filter (optional) */}
      {showCustomerFilter && externalCustomerId === undefined && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Filter by Customer</Label>
          <Select value={activeCustomerId} onValueChange={handleCustomerChange} disabled={disabled}>
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="All customers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {customersList.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.companyName}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Employee selector with search */}
      <div className="space-y-1.5">
        {label && (
          <Label>
            {label} {required && <span className="text-red-500">*</span>}
          </Label>
        )}
        <div className="relative" ref={dropdownRef}>
          {/* Display selected employee or search input */}
          {selectedEmployee && !isOpen ? (
            <div
              className={`flex items-center justify-between h-9 px-3 rounded-md border bg-background text-sm cursor-pointer hover:bg-muted/50 ${errorClass} ${disabled ? "opacity-50 pointer-events-none" : ""}`}
              onClick={() => { if (!disabled) { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 50); } }}
            >
              <span>
                <span className="font-medium">{selectedEmployee.firstName} {selectedEmployee.lastName}</span>
                <span className="text-muted-foreground ml-2">
                  {selectedEmployee.country}
                  {selectedEmployee.employeeCode && ` · ${selectedEmployee.employeeCode}`}
                </span>
              </span>
              <button
                type="button"
                className="ml-2 text-muted-foreground hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); handleClear(); }}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                ref={inputRef}
                className={`pl-8 h-9 text-sm ${errorClass}`}
                placeholder={placeholder}
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setIsOpen(true); }}
                onFocus={() => setIsOpen(true)}
                disabled={disabled}
              />
            </div>
          )}

          {/* Dropdown */}
          {isOpen && !disabled && (
            <div className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md">
              {filteredEmployees.length > 0 ? (
                filteredEmployees.map((emp) => (
                  <div
                    key={emp.id}
                    className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground ${emp.id === value ? "bg-accent/50" : ""}`}
                    onClick={() => handleSelectEmployee(emp.id)}
                  >
                    <div>
                      <span className="font-medium">{emp.firstName} {emp.lastName}</span>
                      {emp.employeeCode && (
                        <span className="text-xs text-muted-foreground ml-1.5">({emp.employeeCode})</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      {activeCustomerId === "all" && getCustomerName(emp.customerId) && (
                        <span className="truncate max-w-[120px]">{getCustomerName(emp.customerId)}</span>
                      )}
                      <span className="font-mono">{emp.country}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-3 py-4 text-sm text-center text-muted-foreground">
                  {searchTerm ? "No employees match your search" : "No employees available"}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
