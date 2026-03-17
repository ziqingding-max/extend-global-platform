
import { useState, useMemo, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, X, User, Briefcase } from "lucide-react";

export interface WorkerSelectorProps {
  value: string; // "emp-123" or "con-456"
  onValueChange: (value: string) => void;
  /** If true, show customer selector above worker selector */
  showCustomerFilter?: boolean;
  /** Pre-selected customerId (controlled externally) */
  customerId?: number;
  onCustomerChange?: (customerId: number | undefined) => void;
  /** Only show workers from this country code */
  countryFilter?: string;
  /** Label for the field */
  label?: string;
  /** Whether field is required */
  required?: boolean;
  /** Error styling class */
  errorClass?: string;
  /** Placeholder text */
  placeholder?: string;
  disabled?: boolean;
}

export default function WorkerSelector({
  value,
  onValueChange,
  showCustomerFilter = true,
  customerId: externalCustomerId,
  onCustomerChange,
  countryFilter,
  label = "Worker",
  required = false,
  errorClass = "",
  placeholder = "Search or select worker...",
  disabled = false,
}: WorkerSelectorProps) {
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
  const { data: contractorsData } = trpc.contractors.list.useQuery({ limit: 500 });
  const { data: customersData } = trpc.customers.list.useQuery({ limit: 200 });

  const customersList = customersData?.data || [];
  
  // Combine and normalize workers
  const allWorkers = useMemo(() => {
    const employees = (employeesData?.data || []).map(e => ({
      id: `emp-${e.id}`,
      originalId: e.id,
      name: `${e.firstName} ${e.lastName}`,
      code: e.employeeCode,
      country: e.country,
      customerId: e.customerId,
      type: "employee" as const,
      serviceType: e.serviceType // eor, visa_eor
    }));

    const contractors = (contractorsData?.data || []).map(c => ({
      id: `con-${c.id}`,
      originalId: c.id,
      name: `${c.firstName} ${c.lastName}`,
      code: c.contractorCode,
      country: c.country,
      customerId: c.customerId,
      type: "contractor" as const,
      serviceType: "aor" // implicit
    }));

    return [...employees, ...contractors];
  }, [employeesData, contractorsData]);

  // Filter workers
  const filteredWorkers = useMemo(() => {
    let list = allWorkers;

    // Filter by country
    if (countryFilter) {
      list = list.filter((w) => w.country === countryFilter);
    }

    // Filter by customer
    if (activeCustomerId !== "all") {
      const cid = parseInt(activeCustomerId);
      list = list.filter((w) => w.customerId === cid);
    }

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      list = list.filter((w) => {
        const fullName = w.name.toLowerCase();
        const code = (w.code || "").toLowerCase();
        return fullName.includes(term) || code.includes(term);
      });
    }

    return list;
  }, [allWorkers, countryFilter, activeCustomerId, searchTerm]);

  // Get selected worker display name
  const selectedWorker = useMemo(() => {
    if (!value) return null;
    return allWorkers.find((w) => w.id === value) || null;
  }, [value, allWorkers]);

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
    // Clear selection if customer changes and current selection is not in new customer
    if (value) {
      const w = allWorkers.find((w) => w.id === value);
      if (w && val !== "all" && String(w.customerId) !== val) {
        onValueChange("");
      }
    }
  };

  const handleSelectWorker = (workerId: string) => {
    onValueChange(workerId);
    setIsOpen(false);
    setSearchTerm("");
  };

  const handleClear = () => {
    onValueChange("");
    setSearchTerm("");
  };

  // Get customer name
  const getCustomerName = (customerId: number) => {
    const c = customersList.find((c) => c.id === customerId);
    return c?.companyName || "";
  };

  return (
    <div className="space-y-3">
      {/* Customer filter */}
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

      {/* Worker selector */}
      <div className="space-y-1.5">
        {label && (
          <Label>
            {label} {required && <span className="text-red-500">*</span>}
          </Label>
        )}
        <div className="relative" ref={dropdownRef}>
          {selectedWorker && !isOpen ? (
            <div
              className={`flex items-center justify-between h-9 px-3 rounded-md border bg-background text-sm cursor-pointer hover:bg-muted/50 ${errorClass} ${disabled ? "opacity-50 pointer-events-none" : ""}`}
              onClick={() => { if (!disabled) { setIsOpen(true); setTimeout(() => inputRef.current?.focus(), 50); } }}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                {selectedWorker.type === "employee" ? (
                  <User className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                ) : (
                  <Briefcase className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                )}
                <span className="truncate">
                  <span className="font-medium">{selectedWorker.name}</span>
                  <span className="text-muted-foreground ml-2 text-xs">
                    {selectedWorker.country} · {selectedWorker.code}
                  </span>
                </span>
                <Badge variant="secondary" className="text-[10px] h-4 px-1 ml-1 flex-shrink-0">
                  {selectedWorker.type === "employee" 
                    ? (selectedWorker.serviceType === "visa_eor" ? "Visa EOR" : "EOR") 
                    : "AOR"}
                </Badge>
              </div>
              <button
                type="button"
                className="ml-2 text-muted-foreground hover:text-foreground flex-shrink-0"
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
              {filteredWorkers.length > 0 ? (
                filteredWorkers.map((w) => (
                  <div
                    key={w.id}
                    className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground ${w.id === value ? "bg-accent/50" : ""}`}
                    onClick={() => handleSelectWorker(w.id)}
                  >
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{w.name}</span>
                        <Badge variant="outline" className={`text-[10px] h-4 px-1 ${
                          w.type === "employee" 
                            ? "bg-blue-50 text-blue-700 border-blue-200" 
                            : "bg-orange-50 text-orange-700 border-orange-200"
                        }`}>
                          {w.type === "employee" 
                            ? (w.serviceType === "visa_eor" ? "Visa EOR" : "EOR") 
                            : "AOR"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                        <span>{w.code}</span>
                        <span>·</span>
                        <span>{w.country}</span>
                        {activeCustomerId === "all" && getCustomerName(w.customerId) && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[100px]">{getCustomerName(w.customerId)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-3 py-4 text-sm text-center text-muted-foreground">
                  {searchTerm ? "No workers match your search" : "No workers available"}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
