/**
 * Global Workforce Distribution Component
 *
 * Horizontal bar chart with country flags showing employee distribution.
 * Replaced the SVG world map which had persistent GeoJSON loading issues.
 * No longer uses GEO_URL for external GeoJSON — data is passed as props.
 * Handles loading and error states gracefully via empty-state fallback.
 * Clean, reliable, and visually informative.
 */

import { useMemo } from "react";
import { countryFlag, countryName } from "@/lib/format";
import { Users } from "lucide-react";

interface CountryData {
  countryCode: string;
  countryName: string;
  employeeCount: number;
}

interface WorldMapProps {
  data: CountryData[];
  className?: string;
}

// Color palette for country bars (cycles through these)
const BAR_COLORS = [
  "bg-emerald-500",
  "bg-blue-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-indigo-500",
  "bg-orange-500",
  "bg-teal-500",
  "bg-pink-500",
];

export default function WorldMap({ data, className }: WorldMapProps) {
  const sorted = useMemo(
    () => [...data].sort((a, b) => b.employeeCount - a.employeeCount),
    [data]
  );

  const maxCount = useMemo(
    () => Math.max(1, ...sorted.map((d) => d.employeeCount)),
    [sorted]
  );

  const totalEmployees = useMemo(
    () => sorted.reduce((sum, d) => sum + d.employeeCount, 0),
    [sorted]
  );

  if (sorted.length === 0) {
    return (
      <div className={`flex flex-col items-center justify-center py-12 text-muted-foreground ${className || ""}`}>
        <Users className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">No employee data available</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Summary header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="w-4 h-4" />
          <span>{sorted.length} {sorted.length === 1 ? "country" : "countries"}</span>
        </div>
        <span className="text-sm font-medium">{totalEmployees} total</span>
      </div>

      {/* Bar chart */}
      <div className="space-y-3">
        {sorted.map((d, i) => {
          const pct = (d.employeeCount / maxCount) * 100;
          const flag = countryFlag(d.countryCode);
          const name = d.countryName || countryName(d.countryCode);
          const barColor = BAR_COLORS[i % BAR_COLORS.length];

          return (
            <div key={d.countryCode} className="group">
              <div className="flex items-center gap-3">
                {/* Flag + Country */}
                <div className="flex items-center gap-2 w-40 shrink-0">
                  <span className="text-lg leading-none">{flag}</span>
                  <span className="text-sm font-medium truncate">{name}</span>
                </div>

                {/* Bar */}
                <div className="flex-1 h-7 bg-muted/50 rounded-md overflow-hidden relative">
                  <div
                    className={`h-full ${barColor} rounded-md transition-all duration-500 ease-out`}
                    style={{ width: `${Math.max(pct, 3)}%` }}
                  />
                </div>

                {/* Count */}
                <div className="w-16 text-right shrink-0">
                  <span className="text-sm font-semibold tabular-nums">{d.employeeCount}</span>
                  <span className="text-xs text-muted-foreground ml-0.5">
                    ({Math.round((d.employeeCount / totalEmployees) * 100)}%)
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
