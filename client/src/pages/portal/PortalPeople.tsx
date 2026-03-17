/**
 * Portal People Page
 *
 * Unified directory for Employees (EOR) and Contractors (AOR).
 * Tabs switch between the two worker types.
 * All data scoped to the logged-in customer.
 */

import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import PortalLayout from "@/components/PortalLayout";
import { portalTrpc } from "@/lib/portalTrpc";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Users, Briefcase, Search, ChevronLeft, ChevronRight, Trash2, Loader2 } from "lucide-react";
import { formatStatusLabel, countryName, formatDate } from "@/lib/format";
import { toast } from "sonner";
import { portalPath } from "@/lib/portalBasePath";

import { useI18n } from "@/lib/i18n";

const statusColors: Record<string, string> = {
  active: "bg-green-100 text-green-800 border-green-200",
  onboarding: "bg-blue-100 text-blue-800 border-blue-200",
  pending_review: "bg-yellow-100 text-yellow-800 border-yellow-200",
  documents_incomplete: "bg-rose-100 text-rose-800 border-rose-200",
  offboarding: "bg-orange-100 text-orange-800 border-orange-200",
  terminated: "bg-red-100 text-red-800 border-red-200",
};

// ── Employees Tab ──
function EmployeesTab() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [, setLocation] = useLocation();
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
  const pageSize = 20;

  const utils = portalTrpc.useUtils();

  const { data, isLoading } = portalTrpc.employees.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    search: search || undefined,
    page,
    pageSize,
  });

  const deleteMutation = portalTrpc.employees.delete.useMutation({
    onSuccess: () => {
      toast.success(t("portal_employees.toasts.delete_success"));
      setDeleteTarget(null);
      utils.employees.list.invalidate();
    },
    onError: (err: any) => {
      toast.error(err.message || "Failed to delete employee");
    },
  });

  const employees = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  function handleDelete(e: React.MouseEvent, emp: any) {
    e.stopPropagation();
    setDeleteTarget({ id: emp.id, name: `${emp.firstName} ${emp.lastName}` });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate({ id: deleteTarget.id });
  }

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("portal_people.employees.search_placeholder")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("portal_people.employees.filter.all_statuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("portal_people.employees.filter.all_statuses")}</SelectItem>
            <SelectItem value="active">{t("portal_people.employees.filter.active")}</SelectItem>
            <SelectItem value="onboarding">{t("portal_people.employees.filter.onboarding")}</SelectItem>
            <SelectItem value="pending_review">{t("portal_employees.filters.status_pending_review")}</SelectItem>
            <SelectItem value="documents_incomplete">{t("portal_employees.filters.status_documents_incomplete")}</SelectItem>
            <SelectItem value="offboarding">{t("portal_people.employees.filter.offboarding")}</SelectItem>
            <SelectItem value="terminated">{t("portal_people.employees.filter.terminated")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : employees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Users className="w-10 h-10 mb-3" />
              <p className="text-lg font-medium">{t("portal_people.employees.empty_title")}</p>
              <p className="text-sm mt-1">
                {t("portal_people.employees.empty_desc")}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("portal_employees.table.header_name")}</TableHead>
                  <TableHead>{t("portal_employees.table.header_job_title")}</TableHead>
                  <TableHead className="min-w-[120px]">{t("portal_employees.table.header_country")}</TableHead>
                  <TableHead>{t("portal_employees.table.header_department")}</TableHead>
                  <TableHead>{t("portal_employees.table.header_start_date")}</TableHead>
                  <TableHead>{t("portal_employees.table.header_status")}</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((emp) => (
                  <TableRow key={emp.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setLocation(portalPath(`/employees/${emp.id}`))}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{emp.firstName} {emp.lastName}</p>
                        <p className="text-xs text-muted-foreground">{emp.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>{emp.jobTitle || "-"}</TableCell>
                    <TableCell>{countryName(emp.country)}</TableCell>
                    <TableCell>{emp.department || "-"}</TableCell>
                    <TableCell>
                      {formatDate(emp.startDate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[emp.status] || ""}>
                        {formatStatusLabel(emp.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {emp.status === "pending_review" && (
                        <TooltipProvider delayDuration={200}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                                onClick={(e) => handleDelete(e, emp)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">{t("common.delete")}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("common.showing")} {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} {t("common.of")} {total}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm">{t("common.page")} {page} {t("common.of")} {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("portal_employees.delete_dialog.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.name}</strong>? This will permanently remove the employee record and all associated documents. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ── Contractors Tab ──
function ContractorsTab() {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [, setLocation] = useLocation();
  const pageSize = 20;

  const { data, isLoading } = portalTrpc.contractors.list.useQuery({
    status: statusFilter === "all" ? undefined : statusFilter,
    search: search || undefined,
    page,
    pageSize,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / pageSize);

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("portal_people.contractors.search_placeholder")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t("portal_people.contractors.filter.all_statuses")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("portal_people.contractors.filter.all_statuses")}</SelectItem>
            <SelectItem value="active">{t("portal_people.contractors.filter.active")}</SelectItem>
            <SelectItem value="pending_review">{t("portal_people.contractors.filter.pending_review")}</SelectItem>
            <SelectItem value="terminated">{t("portal_people.contractors.filter.terminated")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Briefcase className="w-10 h-10 mb-3" />
              <p className="text-lg font-medium">{t("portal_people.contractors.empty_title")}</p>
              <p className="text-sm mt-1">
                {t("portal_people.contractors.empty_desc")}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("portal_people.contractors.table.name")}</TableHead>
                  <TableHead>{t("portal_people.contractors.table.job_title")}</TableHead>
                  <TableHead className="min-w-[120px]">{t("portal_people.contractors.table.country")}</TableHead>
                  <TableHead>{t("portal_people.contractors.table.payment")}</TableHead>
                  <TableHead>{t("portal_people.employees.table.start_date")}</TableHead>
                  <TableHead>{t("portal_people.contractors.table.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setLocation(portalPath(`/contractors/${c.id}`))}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{c.firstName} {c.lastName}</p>
                        <p className="text-xs text-muted-foreground">{c.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>{c.jobTitle || "-"}</TableCell>
                    <TableCell>{countryName(c.country)}</TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {c.rateAmount ? `${c.currency || "USD"} ${Number(c.rateAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : "-"}
                        {c.paymentFrequency && (
                          <span className="text-xs text-muted-foreground ml-1">/ {c.paymentFrequency.replace("_", "-")}</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatDate(c.startDate)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusColors[c.status] || ""}>
                        {formatStatusLabel(c.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t("common.showing")} {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} {t("common.of")} {total}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm">{t("common.page")} {page} {t("common.of")} {totalPages}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

// ── Main Page ──
export default function PortalPeople() {
  const { t } = useI18n();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const initialTab = params.get("tab") === "contractors" ? "contractors" : "employees";
  const [activeTab, setActiveTab] = useState(initialTab);

  // Sync tab state when URL params change (e.g. browser back/forward)
  useEffect(() => {
    const p = new URLSearchParams(searchString);
    const tab = p.get("tab");
    if (tab === "contractors" || tab === "employees") {
      setActiveTab(tab);
    }
  }, [searchString]);

  return (
    <PortalLayout title={t("portal_people.title")}>
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t("portal_people.header.title")}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t("portal_people.header.description")}
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="employees" className="gap-1.5">
              <Users className="w-4 h-4" />
              {t("portal_people.tabs.employees")}
            </TabsTrigger>
            <TabsTrigger value="contractors" className="gap-1.5">
              <Briefcase className="w-4 h-4" />
              {t("portal_people.tabs.contractors")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="employees" className="space-y-4">
            <EmployeesTab />
          </TabsContent>

          <TabsContent value="contractors" className="space-y-4">
            <ContractorsTab />
          </TabsContent>
        </Tabs>
      </div>
    </PortalLayout>
  );
}
