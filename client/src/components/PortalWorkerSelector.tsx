/**
 * Portal Worker Selector
 *
 * A unified worker selector for the client portal that combines
 * EOR employees and AOR contractors in a single searchable dropdown.
 * Uses portalTrpc (scoped to customer) instead of admin trpc.
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { portalTrpc } from "@/lib/portalTrpc";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, X, User, Briefcase } from "lucide-react";

interface NormalizedWorker {
  id: string; // "emp-123" or "con-456"
  originalId: number;
  name: string;
  code: string;
  country: string;
  currency: string;
  type: "employee" | "contractor";
  serviceType?: string;
}

export interface PortalWorkerSelectorProps {
  value: string; // "emp-123" or "con-456"
  onValueChange: (value: string, worker: NormalizedWorker | null) => void;
  label?: string;
  required?: boolean;
  errorClass?: string;
  placeholder?: string;
  disabled?: boolean;
}

export default function PortalWorkerSelector({
  value,
  onValueChange,
  label = "Worker",
  required = false,
  errorClass = "",
  placeholder = "Search or select worker...",
  disabled = false,
}: PortalWorkerSelectorProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch employees and contractors from portal endpoints
  const { data: empData } = portalTrpc.employees.list.useQuery({ page: 1, pageSize: 100 });
  const { data: conData } = portalTrpc.contractors.list.useQuery({ page: 1, pageSize: 500 });

  const employees = Array.isArray(empData?.items) ? empData.items : [];
  const contractorItems = Array.isArray(conData?.items) ? conData.items : [];

  // Combine and normalize workers
  const allWorkers: NormalizedWorker[] = useMemo(() => {
    const empWorkers: NormalizedWorker[] = employees.map((e: any) => ({
      id: `emp-${e.id}`,
      originalId: e.id,
      name: `${e.firstName} ${e.lastName}`,
      code: e.employeeCode || "",
      country: e.country || "",
      currency: e.salaryCurrency || "USD",
      type: "employee" as const,
      serviceType: e.serviceType,
    }));

    const conWorkers: NormalizedWorker[] = contractorItems.map((c: any) => ({
      id: `con-${c.id}`,
      originalId: c.id,
      name: `${c.firstName} ${c.lastName}`,
      code: c.contractorCode || "",
      country: c.country || "",
      currency: c.currency || "USD",
      type: "contractor" as const,
      serviceType: "aor",
    }));

    return [...empWorkers, ...conWorkers];
  }, [employees, contractorItems]);

  // Filter workers by search term
  const filteredWorkers = useMemo(() => {
    if (!searchTerm.trim()) return allWorkers;
    const term = searchTerm.toLowerCase().trim();
    return allWorkers.filter((w) => {
      return (
        w.name.toLowerCase().includes(term) ||
        w.code.toLowerCase().includes(term) ||
        w.country.toLowerCase().includes(term)
      );
    });
  }, [allWorkers, searchTerm]);

  // Get selected worker
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

  const handleSelectWorker = (workerId: string) => {
    const worker = allWorkers.find((w) => w.id === workerId) || null;
    onValueChange(workerId, worker);
    setIsOpen(false);
    setSearchTerm("");
  };

  const handleClear = () => {
    onValueChange("", null);
    setSearchTerm("");
  };

  return (
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
            onClick={() => {
              if (!disabled) {
                setIsOpen(true);
                setTimeout(() => inputRef.current?.focus(), 50);
              }
            }}
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
              <Badge
                variant="secondary"
                className="text-[10px] h-4 px-1 ml-1 flex-shrink-0"
              >
                {selectedWorker.type === "employee"
                  ? selectedWorker.serviceType === "visa_eor"
                    ? "Visa EOR"
                    : "EOR"
                  : "AOR"}
              </Badge>
            </div>
            <button
              type="button"
              className="ml-2 text-muted-foreground hover:text-foreground flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
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
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setIsOpen(true);
              }}
              onClick={() => setIsOpen(true)}
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
                  className={`flex items-center justify-between px-3 py-2 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground ${
                    w.id === value ? "bg-accent/50" : ""
                  }`}
                  onClick={() => handleSelectWorker(w.id)}
                >
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      {w.type === "employee" ? (
                        <User className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      ) : (
                        <Briefcase className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                      )}
                      <span className="font-medium truncate">{w.name}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] h-4 px-1 ${
                          w.type === "employee"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-orange-50 text-orange-700 border-orange-200"
                        }`}
                      >
                        {w.type === "employee"
                          ? w.serviceType === "visa_eor"
                            ? "Visa EOR"
                            : "EOR"
                          : "AOR"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5 ml-5">
                      <span>{w.code}</span>
                      <span>·</span>
                      <span>{w.country}</span>
                      <span>·</span>
                      <span>{w.currency}</span>
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
  );
}
