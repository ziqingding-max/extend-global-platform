
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MonthPicker } from "@/components/DatePicker";
import { Button } from "@/components/ui/button";
import { Search, XCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";

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
  const { t } = useI18n();

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input 
          className="pl-9" 
          placeholder={t("invoices.list.filter.searchInvoiceCustomerPlaceholder")} 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
        />
      </div>
      
      {showStatusFilter && statusFilter && setStatusFilter && (
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t("invoices.list.filter.statusLabel")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("invoices.list.filter.allStatuses")}</SelectItem>
            <SelectItem value="draft">{t("invoices.status.draft")}</SelectItem>
            <SelectItem value="pending_review">{t("invoices.status.pendingReview")}</SelectItem>
            <SelectItem value="sent">{t("invoices.status.sent")}</SelectItem>
            <SelectItem value="paid">{t("invoices.detail.summary.paid")}</SelectItem>
            <SelectItem value="overdue">{t("invoices.status.overdue")}</SelectItem>
            <SelectItem value="cancelled">{t("invoices.status.cancelled")}</SelectItem>
          </SelectContent>
        </Select>
      )}

      <Select value={typeFilter} onValueChange={setTypeFilter}>
        <SelectTrigger className="w-44"><SelectValue placeholder={t("invoices.list.filter.typeLabel")} /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("invoices.list.filter.allTypes")}</SelectItem>
          <SelectItem value="monthly_eor">{t("invoices.type.monthlyEor")}</SelectItem>
          <SelectItem value="monthly_visa_eor">{t("invoices.type.monthlyVisaEor")}</SelectItem>
          <SelectItem value="monthly_aor">{t("invoices.type.monthlyAor")}</SelectItem>
          <SelectItem value="visa_service">{t("invoices.type.visaService")}</SelectItem>
          <SelectItem value="deposit">{t("invoices.type.deposit")}</SelectItem>
          <SelectItem value="deposit_refund">{t("invoices.type.depositRefund")}</SelectItem>
          <SelectItem value="credit_note">{t("invoices.type.creditNote")}</SelectItem>
          <SelectItem value="manual">{t("invoices.type.manual")}</SelectItem>
        </SelectContent>
      </Select>

      {monthFilter !== undefined && setMonthFilter && (
        <div className="flex items-center gap-2">
          <MonthPicker 
            value={monthFilter} 
            onChange={setMonthFilter} 
            placeholder={t("invoices.list.filter.allMonths")} 
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
            <SelectItem value="layer1">Layer 1 (EG→CP)</SelectItem>
            <SelectItem value="layer2">Layer 2 (CP→Client)</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
