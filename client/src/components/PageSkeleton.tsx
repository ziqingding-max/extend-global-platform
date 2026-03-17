/**
 * GEA Admin — Page Skeleton / Loading States
 * Provides beautiful loading skeletons for different page types
 */
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

/** Generic page skeleton with title + cards */
export function PageSkeleton({ cards = 3, hasTable = false }: { cards?: number; hasTable?: boolean }) {
  return (
    <div className="p-6 space-y-6 animate-pulse-subtle">
      {/* Title area */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>

      {/* KPI cards row */}
      {cards > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: cards }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-5">
                <Skeleton className="h-3 w-20 mb-3" />
                <Skeleton className="h-7 w-16 mb-2" />
                <Skeleton className="h-3 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table skeleton */}
      {hasTable && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-9 w-28 rounded-md" />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="border-t">
              {/* Table header */}
              <div className="flex items-center gap-4 px-4 py-3 bg-muted/50 border-b">
                {[80, 120, 100, 80, 60].map((w, i) => (
                  <Skeleton key={i} className="h-3" style={{ width: w }} />
                ))}
              </div>
              {/* Table rows */}
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
                  {[80, 120, 100, 80, 60].map((w, j) => (
                    <Skeleton key={j} className="h-4" style={{ width: w + Math.random() * 40 }} />
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Dashboard-style skeleton */
export function DashboardSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse-subtle">
      {/* Title */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-3 w-16 mb-2" />
              <Skeleton className="h-6 w-12 mb-1" />
              <Skeleton className="h-2 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            <Skeleton className="h-4 w-40 mb-4" />
            <Skeleton className="h-[280px] w-full rounded-lg" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-4 w-32 mb-4" />
            <Skeleton className="h-[280px] w-full rounded-lg" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/** Table-focused page skeleton (Audit Logs, User Management) */
export function TablePageSkeleton() {
  return (
    <div className="p-6 space-y-6 animate-pulse-subtle">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Skeleton className="h-10 w-48 rounded-md" />
        <Skeleton className="h-10 w-40 rounded-md" />
        <div className="flex-1" />
        <Skeleton className="h-4 w-32 self-center" />
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="border-t">
            <div className="flex items-center gap-4 px-4 py-3 bg-muted/50 border-b">
              {[140, 90, 100, 300].map((w, i) => (
                <Skeleton key={i} className="h-3" style={{ width: w }} />
              ))}
            </div>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3 border-b last:border-0">
                <Skeleton className="h-4 w-[140px]" />
                <Skeleton className="h-4 w-[90px]" />
                <Skeleton className="h-5 w-[80px] rounded-full" />
                <Skeleton className="h-4 flex-1" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
