import { useState, useMemo, useEffect, useRef } from "react";
import { useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useCpContext } from "@/_core/store/cpContextStore";

export function useInvoices() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [cpFilter, setCpFilter] = useState<string>("all");
  const [layerFilter, setLayerFilter] = useState<string>("all");
  const searchString = useSearch();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  
  // Initialize page from URL params
  const getUrlPage = () => {
    const p = parseInt(new URLSearchParams(searchString).get("page") || "1", 10);
    return isNaN(p) ? 1 : p;
  };
  const [activePage, setActivePage] = useState(getUrlPage);
  const [historyPage, setHistoryPage] = useState(1);
  const PAGE_SIZE = 20;
  const isInitialMount = useRef(true);

  // Sync page from URL
  useEffect(() => {
    setActivePage(getUrlPage());
  }, [searchString]);

  // Reset pages when filters change
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setActivePage(1); 
    setHistoryPage(1);
  }, [statusFilter, typeFilter, monthFilter, search, cpFilter, layerFilter]);

  const utils = trpc.useUtils();

  // Task Group B: Global CP Context overrides local cpFilter
  const cpContext = useCpContext();
  const effectiveCpFilter = cpContext.mode !== "all" ? cpContext.mode : cpFilter;
  const resolvedChannelPartnerId = (() => {
    if (cpContext.mode === "direct") return null;
    if (cpContext.mode === "specific") return cpContext.cpId;
    // Fallback to local filter
    if (cpFilter === "all") return undefined;
    if (cpFilter === "direct") return null;
    return parseInt(cpFilter);
  })();

  const { data, isLoading } = trpc.invoices.list.useQuery({
    status: statusFilter !== "all" ? statusFilter : undefined,
    invoiceMonth: monthFilter || undefined,
    channelPartnerId: resolvedChannelPartnerId,
    invoiceLayer: layerFilter !== "all" ? layerFilter : undefined,
    excludeCreditNotes: true,
    limit: 200,
  });

  const { data: customers } = trpc.customers.list.useQuery({ limit: 200 });
  const { data: cpList } = trpc.channelPartners.list.useQuery({ limit: 200, includeInternal: true });

  const customerMap = useMemo(() => {
    const map: Record<number, string> = {};
    customers?.data?.forEach((c) => { map[c.id] = c.companyName; });
    return map;
  }, [customers]);

  const cpMap = useMemo(() => {
    const map: Record<number, string> = {};
    cpList?.data?.forEach((cp: any) => { map[cp.id] = cp.companyName; });
    return map;
  }, [cpList]);

  const invoices = data?.data || [];
  const historyStatuses = ["paid", "cancelled"];
  const activeInvoices = invoices.filter((inv) => !historyStatuses.includes(inv.status));
  const historyInvoices = invoices.filter((inv) => historyStatuses.includes(inv.status));

  const filterFn = (inv: any) => {
    const matchSearch = !search
      || inv.invoiceNumber.toLowerCase().includes(search.toLowerCase())
      || (customerMap[inv.customerId] || "").toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === "all" || inv.invoiceType === typeFilter;
    return matchSearch && matchType;
  };
  
  const filtered = activeInvoices.filter(filterFn);
  const filteredHistory = historyInvoices.filter(filterFn);

  // Batch operations
  const batchMutation = trpc.invoices.batchUpdateStatus.useMutation({
    onSuccess: (result) => {
      toast.success(`${result.summary.success}/${result.summary.total} invoices updated`);
      if (result.summary.failed > 0) {
        result.results.filter((r) => !r.success).forEach((r) => toast.error(`#${r.id}: ${r.message}`));
      }
      setSelectedIds(new Set());
      utils.invoices.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (items: any[]) => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((inv) => inv.id)));
    }
  };

  const handleBatchAction = (status: "pending_review" | "sent" | "paid" | "cancelled", paidAmount?: string) => {
    if (selectedIds.size === 0) {
      toast.warning("No invoices selected for batch update");
      return;
    }
    batchMutation.mutate({ 
      invoiceIds: Array.from(selectedIds), 
      status,
      paidAmount 
    });
  };

  return {
    isLoading,
    invoices,
    activeInvoices,
    historyInvoices,
    filtered,
    filteredHistory,
    customerMap,
    cpMap,
    cpList: cpList?.data || [],
    filters: {
      status: statusFilter,
      setStatus: setStatusFilter,
      type: typeFilter,
      setType: setTypeFilter,
      month: monthFilter,
      setMonth: setMonthFilter,
      search,
      setSearch,
      cp: cpFilter,
      setCp: setCpFilter,
      layer: layerFilter,
      setLayer: setLayerFilter,
    },
    pagination: {
      activePage,
      setActivePage,
      historyPage,
      setHistoryPage,
      pageSize: PAGE_SIZE,
    },
    selection: {
      selectedIds,
      setSelectedIds,
      toggleSelect,
      toggleSelectAll,
    },
    batch: {
      mutation: batchMutation,
      handleAction: handleBatchAction,
    }
  };
}