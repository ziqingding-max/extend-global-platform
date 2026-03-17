import { useState, useRef, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { useI18n } from "@/lib/i18n";
import Layout from "@/components/Layout";
import {
  Card, CardContent
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import CountrySelect from "@/components/CountrySelect";
import CurrencySelect from "@/components/CurrencySelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Users, Plus, Search, ChevronRight, Briefcase
} from "lucide-react";
import { formatCurrencyAmount } from "@/components/CurrencyAmount";
import { countryName, formatStatusLabel } from "@/lib/format";

export function ContractorListContent() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [cpFilter, setCpFilter] = useState<string>("all");
  const [, setLocation] = useLocation();
  const searchString = useSearch();

  // Initialize page from URL params (e.g. /employees?page=2)
  const getUrlPage = () => {
    const p = parseInt(new URLSearchParams(searchString).get("page") || "1", 10);
    return isNaN(p) ? 1 : p;
  };
  const [page, setPage] = useState(getUrlPage);
  const pageSize = 20;
  const isInitialMount = useRef(true);

  // Sync page from URL when navigating back from detail page
  useEffect(() => {
    setPage(getUrlPage());
  }, [searchString]);

  // Reset to page 1 when filters change (skip initial mount to preserve URL page)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setPage(1);
  }, [search, statusFilter, customerFilter, countryFilter, cpFilter]);

  const { data, isLoading, refetch } = trpc.contractors.list.useQuery({
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    customerId: customerFilter !== "all" ? parseInt(customerFilter) : undefined,
    channelPartnerId: cpFilter === "all" ? undefined : cpFilter === "direct" ? null : parseInt(cpFilter),
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });

  // Contractor Invoice Hook (Fetch invoices for all contractors? No, this is Contractor List page)
  // We need a separate ContractorInvoices page.
  // But wait, the user asked to "Update ContractorInvoices page".
  // Let me check if there is a separate page or if I should create one.
  // The file I'm editing is `Contractors.tsx` which lists Contractors.
  // I should check `routes` or `App.tsx`.
  // If there is no `ContractorInvoices.tsx`, I should create it.
  
  // Wait, the task is "Update `ContractorInvoices` page". 
  // I see `pages/Contractors.tsx` but no `pages/ContractorInvoices.tsx`.
  // I should probably create `pages/ContractorInvoices.tsx`.
  
  const { data: customers } = trpc.customers.list.useQuery({ limit: 200 });
  const { data: countriesList } = trpc.countries.list.useQuery();
  const { data: cpList } = trpc.channelPartners.list.useQuery({ limit: 200, includeInternal: true });

  const statusColors: Record<string, string> = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    draft: "bg-gray-50 text-gray-700 border-gray-200",
    pending_review: "bg-amber-50 text-amber-700 border-amber-200",
    onboarding: "bg-blue-50 text-blue-700 border-blue-200",
    terminated: "bg-red-50 text-red-700 border-red-200",
    offboarding: "bg-orange-50 text-orange-700 border-orange-200",
  };

  return (
    <div className="space-y-6">
      {/* Header Actions - REMOVED, Handled by Parent Page */}
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t("common.search")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={customerFilter} onValueChange={setCustomerFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder={t("employees.create.form.customer")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("employees.list.filters.customer.all")}</SelectItem>
            {customers?.data?.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.companyName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={countryFilter} onValueChange={setCountryFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder={t("employees.list.table.header.country")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("employees.list.filters.country.all")}</SelectItem>
            {countriesList?.map((c: any) => (
              <SelectItem key={c.countryCode} value={c.countryCode}>{c.countryCode} — {c.countryName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder={t("employees.list.table.header.status")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("employees.all_statuses")}</SelectItem>
            <SelectItem value="active">{t("status.active")}</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="terminated">{t("status.terminated")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={cpFilter} onValueChange={setCpFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Channel Partner" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Partners</SelectItem>
            <SelectItem value="direct">EG Direct</SelectItem>
            {cpList?.data?.map((cp: any) => (
              <SelectItem key={cp.id} value={String(cp.id)}>{cp.companyName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">ID</TableHead>
                <TableHead>{t("contractors.list.table.header.contractor")}</TableHead>
                <TableHead>{t("employees.create.form.customer")}</TableHead>
                <TableHead className="min-w-[120px]">{t("employees.list.table.header.country")}</TableHead>
                <TableHead>{t("contractors.list.table.header.status")}</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-24" /></TableCell>
                    ))}
                    <TableCell></TableCell>
                  </TableRow>
                ))
              ) : data?.data && data.data.length > 0 ? (
                data.data.map((con: any) => (
                  <TableRow key={con.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setLocation(`/contractors/${con.id}`)}>
                    <TableCell className="text-sm text-muted-foreground font-mono">{con.id}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {con.firstName?.[0]}{con.lastName?.[0]}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{con.firstName} {con.lastName}</div>
                          <div className="text-xs text-muted-foreground">{con.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{con.customerName || `Customer #${con.customerId}`}</div>
                    </TableCell>
                    <TableCell className="text-sm">{countryName(con.country)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-xs ${statusColors[con.status] || ""}`}>
                        {formatStatusLabel(con.status)}
                      </Badge>
                    </TableCell>
                    <TableCell><ChevronRight className="w-4 h-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12">
                    <Briefcase className="w-8 h-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">{t("contractors.list.empty.message")}</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {data && (() => {
        const totalPages = Math.ceil(data.total / pageSize);
        return (
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-muted-foreground">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, data.total)} of {data.total} contractors</p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>{t("employees.list.pagination.previous")}</Button>
                <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>{t("employees.list.pagination.next")}</Button>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

export default function ContractorList() {
  return (
    <Layout>
      <ContractorListContent />
    </Layout>
  );
}
