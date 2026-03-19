/**
 * CP Context Switcher — Global Admin-side dropdown (Task Group B)
 *
 * Placed in the top navigation bar. Allows admin users to switch between:
 * - All Partners (no filter)
 * - A specific Channel Partner
 * - EG-DIRECT (internal, direct customers)
 *
 * When a context is active, a coloured badge is shown to prevent confusion.
 */
import { useCpContext } from "@/_core/store/cpContextStore";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Building2, ChevronDown, Globe, X } from "lucide-react";

export default function CpContextSwitcher() {
  const { mode, cpName, setAll, setCp } = useCpContext();
  const { data: cpList } = trpc.channelPartners.list.useQuery({
    limit: 200,
    includeInternal: true,
  });

  const partners = cpList?.data || [];

  // Determine display label
  const displayLabel =
    mode === "all"
      ? "All Partners"
      : mode === "direct"
        ? "EG-DIRECT"
        : cpName || "Select CP";

  // Badge colour based on mode
  const isFiltered = mode !== "all";

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-all duration-200",
              isFiltered
                ? "bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25"
                : "text-muted-foreground hover:text-foreground hover:bg-white/30"
            )}
          >
            {isFiltered ? (
              <Building2 className="w-3.5 h-3.5" />
            ) : (
              <Globe className="w-3.5 h-3.5" />
            )}
            <span className="max-w-[120px] truncate">{displayLabel}</span>
            <ChevronDown className="w-3 h-3 flex-shrink-0" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 max-h-80 overflow-y-auto">
          {/* All Partners option */}
          <DropdownMenuItem
            onClick={() => setAll()}
            className={cn(
              "flex items-center gap-2",
              mode === "all" && "bg-accent font-medium"
            )}
          >
            <Globe className="w-4 h-4 opacity-70" />
            <span>All Partners</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />

          {/* List all CPs, internal ones first */}
          {partners
            .sort((a: any, b: any) => {
              // Internal (EG-DIRECT) first
              if (a.isInternal && !b.isInternal) return -1;
              if (!a.isInternal && b.isInternal) return 1;
              return (a.companyName || "").localeCompare(b.companyName || "");
            })
            .map((cp: any) => {
              const isSelected =
                (mode === "direct" && cp.isInternal) ||
                (mode === "specific" && cp.id === useCpContext.getState().cpId);
              return (
                <DropdownMenuItem
                  key={cp.id}
                  onClick={() => setCp(cp.id, cp.companyName, !!cp.isInternal)}
                  className={cn(
                    "flex items-center gap-2",
                    isSelected && "bg-accent font-medium"
                  )}
                >
                  <Building2 className="w-4 h-4 opacity-70" />
                  <span className="truncate">{cp.companyName}</span>
                  {cp.isInternal && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                      Internal
                    </span>
                  )}
                </DropdownMenuItem>
              );
            })}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Quick clear button when filtered */}
      {isFiltered && (
        <button
          onClick={() => setAll()}
          className="p-1 rounded-full text-primary/70 hover:text-primary hover:bg-primary/10 transition-all duration-200"
          title="Clear CP filter"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
