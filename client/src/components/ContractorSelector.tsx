/**
 * ContractorSelector — Cascading contractor selector with customer filter and search
 * 
 * Features:
 * - Optional customer pre-filter (cascading: select customer → see only their contractors)
 * - Type-to-search by contractor name
 * - Shows contractor country and email for disambiguation
 * - Supports filtering by contractor status (default: active)
 * - Supports country filter (only show contractors from a specific country)
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, X } from "lucide-react";

export interface ContractorSelectorProps {
  value: number; // selected contractorId
  onValueChange: (contractorId: number) => void;
  /** If true, show customer selector above contractor selector */
  showCustomerFilter?: boolean;
  /** Pre-selected customerId (controlled externally) */
  customerId?: number;
  onCustomerChange?: (customerId: number | undefined) => void;
  /** Which contractor statuses to include (default: active) */
  allowedStatuses?: string[];
  /** Only show contractors from this country code */
  countryFilter?: string;
  /** Label for the contractor field */
  label?: string;
  /** Whether field is required */
  required?: boolean;
  /** Error styling class */
  errorClass?: string;
  /** Placeholder text */
  placeholder?: string;
  disabled?: boolean;
}

export default function ContractorSelector({
  value,
  onValueChange,
  showCustomerFilter = true,
  customerId: externalCustomerId,
  onCustomerChange,
  allowedStatuses = ["active"],
  countryFilter,
  label = "Contractor",
  required = false,
  errorClass = "",
  placeholder = "Search or select contractor...",
  disabled = false,
}: ContractorSelectorProps) {
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
  const { data: contractorsData } = trpc.contractors.list.useQuery({ limit: 500 });
  const { data: customersData } = trpc.customers.list.useQuery({ limit: 200 });

  const customersList = customersData?.data || [];
  const allContractors = contractorsData?.data || [];

  // Filter contractors by status, customer, country, and search term
  const filteredContractors = useMemo(() => {
    let list = allContractors;

    // Filter by allowed statuses
    if (allowedStatuses.length > 0) {
      list = list.filter((c: any) => allowedStatuses.includes(c.status));
    }

    // Filter by country
    if (countryFilter) {
      list = list.filter((c: any) => c.country === countryFilter);
    }

    // Filter by customer
    if (activeCustomerId !== "all") {
      const cid = parseInt(activeCustomerId);
      list = list.filter((c: any) => c.customerId === cid);
    }

    // Filter by search term (name, email)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      list = list.filter((c: any) => {
        const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
        const email = (c.email || "").toLowerCase();
        return fullName.includes(term) || email.includes(term);
      });
    }

    return list;
  }, [allContractors, allowedStatuses, countryFilter, activeCustomerId, searchTerm]);

  // Get selected contractor display name
  const selectedContractor = useMemo(() => {
    if (!value) return null;
    return allContractors.find((c: any) => c.id === value) || null;
  }, [value, allContractors]);

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
    // Clear contractor selection when customer changes
    if (value) {
      const con = allContractors.find((c: any) => c.id === value);
      if (con && val !== "all" && String(con.customerId) !== val) {
        onValueChange(0);
      }
    }
  };

  const handleSelectContractor = (contractorId: number) => {
    onValueChange(contractorId);
    setIsOpen(false);
    setSearchTerm("");
  };

  const handleClear = () => {
    onValueChange(0);
    setSearchTerm("");
  };

  // Get customer name for a contractor
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

      {/* Contractor selector with search */}
      <div className="space-y-1.5">
        {label && (
          <Label>
            {label} {required && <span className="text-red-500">*</span>}
          </Label>
        )}
        <div className="relative" ref={dropdownRef}>
          {/* Display selected contractor or search input */}
          {selectedContractor && !isOpen ? (
            <div
              className={`flex items-center justify-between h-9 px-3 rounded-md border bg-background text-sm cursor-pointer hover:bg-muted/50 ${errorClass} ${disabled ? "opacity-50 pointer-events-none" : ""}`}
              onClick={() => { if (!disabled) { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 50); } }}
            >
              <span>
                <span className="font-medium">{selectedContractor.firstName} {selectedContractor.lastName}</span>
                <span className="text-muted-foreground ml-2">
                  {selectedContractor.country}
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
              {filteredContractors.length > 0 ? (
                filteredContractors.map((con: any) => (
                  <div
                    key={con.id}
                    className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground ${con.id === value ? "bg-accent/50" : ""}`}
                    onClick={() => handleSelectContractor(con.id)}
                  >
                    <div>
                      <span className="font-medium">{con.firstName} {con.lastName}</span>
                      {con.email && (
                        <span className="text-xs text-muted-foreground ml-1.5">({con.email})</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      {activeCustomerId === "all" && getCustomerName(con.customerId) && (
                        <span className="truncate max-w-[120px]">{getCustomerName(con.customerId)}</span>
                      )}
                      <span className="font-mono">{con.country}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-3 py-4 text-sm text-center text-muted-foreground">
                  {searchTerm ? "No contractors match your search" : "No contractors available"}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
