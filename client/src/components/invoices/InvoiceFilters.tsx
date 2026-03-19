import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonthPicker } from "@/components/DatePicker";
import { Button } from "@/components/ui/button";
import { Search, XCircle } from "lucide-react";

interface InvoiceFiltersProps {
  search: string;
  setSearch: (val: string) => void;
  statusFilter?: string;
  setStatusFilter?: (val: string) => void;
  typeFilter: string;
  setTypeFilter: (val: string) => void;
  monthFilter?: string;
  setMonthFilter?: (val: string) => void;
  showStatusFilter?: boolean;
  // CP & Layer filters
  cpFilter?: string;
  setCpFilter?: (val: string) => void;
  cpList?: any[];
  layerFilter?: string;
  setLayerFilter?: (val: string) => void;
}

export function InvoiceFilters({
  search, setSearch,
  statusFilter, setStatusFilter,
  typeFilter, setTypeFilter,
  monthFilter, setMonthFilter,
  showStatusFilter = true,
  cpFilter, setCpFilter, cpList,
  layerFilter, setLayerFilter,
}: InvoiceFiltersProps) {

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          className="pl-9" 
          placeholder="Search invoice or customer" 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
        />
      </div>
      
      {showStatusFilter && statusFilter && setStatusFilter && (
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="pending_review">Pending Review</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      )}

      <Select value={typeFilter} onValueChange={setTypeFilter}>
        <SelectTrigger className="w-44"><SelectValue placeholder="Type" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="monthly_eor">Monthly EOR</SelectItem>
          <SelectItem value="monthly_visa_eor">Monthly Visa EOR</SelectItem>
          <SelectItem value="monthly_aor">Monthly AOR</SelectItem>
          <SelectItem value="visa_service">Visa Service</SelectItem>
          <SelectItem value="deposit">Deposit</SelectItem>
          <SelectItem value="deposit_refund">Deposit Refund</SelectItem>
          <SelectItem value="credit_note">Credit Note</SelectItem>
          <SelectItem value="manual">Manual</SelectItem>
        </SelectContent>
      </Select>

      {monthFilter !== undefined && setMonthFilter && (
        <div className="flex items-center gap-2">
          <MonthPicker 
            value={monthFilter} 
            onChange={setMonthFilter} 
            placeholder="All Months" 
            className="w-40" 
          />
          {monthFilter && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonthFilter("")}>
              <XCircle className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}

      {cpFilter !== undefined && setCpFilter && (
        <Select value={cpFilter} onValueChange={setCpFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Channel Partner" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Partners</SelectItem>
            <SelectItem value="direct">EG Direct</SelectItem>
            {cpList?.map((cp: any) => (
              <SelectItem key={cp.id} value={String(cp.id)}>{cp.companyName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {layerFilter !== undefined && setLayerFilter && (
        <Select value={layerFilter} onValueChange={setLayerFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Layer" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Layers</SelectItem>
            <SelectItem value="eg_to_cp">Layer 1 (EG→CP)</SelectItem>
            <SelectItem value="cp_to_client">Layer 2 (CP→Client)</SelectItem>
            <SelectItem value="eg_to_client">Direct (EG→Client)</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}