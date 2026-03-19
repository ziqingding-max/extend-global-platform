/**
 * Portal Compliance Hub — Policy & Compliance Toolkit
 *
 * Aggregates employer-relevant compliance information:
 * - Public Holidays calendar view per country
 * - Future: statutory requirements, regulatory updates, labor law summaries
 */

import { useState, useMemo } from "react";
import PortalLayout from "@/components/PortalLayout";
import { portalTrpc } from "@/lib/portalTrpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays, ChevronLeft, ChevronRight, Globe, Info,
  BookOpen, Scale, Shield, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { countryName, countryFlag } from "@/lib/format";

// ─── Calendar Component ──────────────────────────────────────────────────────

interface CalendarDay {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  holidays: Array<{ holidayName: string; localName: string | null; countryCode: string }>;
}

function HolidayCalendar({
  holidays,
  selectedCountry,
}: {
  holidays: Array<{
    id: number;
    countryCode: string;
    holidayDate: string | Date;
    holidayName: string;
    localName: string | null;
    isGlobal: boolean;
  }>;
  selectedCountry: string;
}) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startOffset = firstDay.getDay(); // 0=Sunday
    const daysInMonth = lastDay.getDate();

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    // Filter holidays for this month
    const monthHolidays = holidays.filter((h) => {
      const d = new Date(h.holidayDate);
      return d.getFullYear() === year && d.getMonth() === month;
    });

    const days: CalendarDay[] = [];

    // Previous month padding
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
      const day = prevMonthLastDay - i;
      const date = new Date(year, month - 1, day);
      days.push({ date, isCurrentMonth: false, isToday: false, holidays: [] });
    }

    // Current month
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayHolidays = monthHolidays.filter((h) => {
        const d = new Date(h.holidayDate);
        return d.getDate() === day;
      });
      days.push({
        date,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        holidays: dayHolidays.map((h) => ({
          holidayName: h.holidayName,
          localName: h.localName,
          countryCode: h.countryCode,
        })),
      });
    }

    // Next month padding
    const remaining = 42 - days.length; // 6 rows × 7 days
    for (let i = 1; i <= remaining; i++) {
      const date = new Date(year, month + 1, i);
      days.push({ date, isCurrentMonth: false, isToday: false, holidays: [] });
    }

    return days;
  }, [holidays, year, month]);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Get upcoming holidays (next 30 days)
  const upcomingHolidays = useMemo(() => {
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return holidays
      .filter((h) => {
        const d = new Date(h.holidayDate);
        return d >= now && d <= thirtyDaysLater;
      })
      .sort((a, b) => new Date(a.holidayDate).getTime() - new Date(b.holidayDate).getTime())
      .slice(0, 8);
  }, [holidays]);

  return (
    <div className="space-y-6">
      {/* Upcoming Holidays Banner */}
      {upcomingHolidays.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="py-4">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-800">Upcoming Holidays</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {upcomingHolidays.map((h, i) => {
                const d = new Date(h.holidayDate);
                return (
                  <div
                    key={i}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-amber-200 text-sm"
                  >
                    <span className="text-base">{countryFlag(h.countryCode)}</span>
                    <span className="font-medium text-amber-900">
                      {d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                    <span className="text-amber-700">{h.holidayName}</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calendar */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="icon" onClick={prevMonth} className="h-8 w-8">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <h3 className="text-lg font-semibold min-w-[180px] text-center">
                {monthNames[month]} {year}
              </h3>
              <Button variant="ghost" size="icon" onClick={nextMonth} className="h-8 w-8">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <Button variant="outline" size="sm" onClick={goToToday} className="text-xs">
              Today
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Week day headers */}
          <div className="grid grid-cols-7 mb-2">
            {weekDays.map((day) => (
              <div
                key={day}
                className="text-center text-xs font-semibold text-muted-foreground py-2"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
            {calendarDays.map((day, i) => (
              <div
                key={i}
                className={cn(
                  "min-h-[80px] p-1.5 bg-card transition-colors",
                  !day.isCurrentMonth && "bg-muted/30",
                  day.isToday && "ring-2 ring-primary ring-inset",
                  day.holidays.length > 0 && day.isCurrentMonth && "bg-red-50"
                )}
              >
                <div
                  className={cn(
                    "text-xs font-medium mb-1",
                    !day.isCurrentMonth && "text-muted-foreground/40",
                    day.isToday && "text-primary font-bold",
                    day.holidays.length > 0 && day.isCurrentMonth && "text-red-600"
                  )}
                >
                  {day.date.getDate()}
                </div>
                {day.holidays.map((h, j) => (
                  <div
                    key={j}
                    className="text-[10px] leading-tight px-1 py-0.5 rounded bg-red-100 text-red-700 mb-0.5 truncate"
                    title={`${h.holidayName}${h.localName && h.localName !== h.holidayName ? ` (${h.localName})` : ""} — ${countryName(h.countryCode)}`}
                  >
                    {selectedCountry === "all" && (
                      <span className="mr-0.5">{countryFlag(h.countryCode)}</span>
                    )}
                    {h.holidayName}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Holiday List View ───────────────────────────────────────────────────────

function HolidayListView({
  holidays,
}: {
  holidays: Array<{
    id: number;
    countryCode: string;
    holidayDate: string | Date;
    holidayName: string;
    localName: string | null;
    isGlobal: boolean;
  }>;
}) {
  const grouped = useMemo(() => {
    const groups: Record<string, typeof holidays> = {};
    holidays.forEach((h) => {
      const d = new Date(h.holidayDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(h);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [holidays]);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  return (
    <div className="space-y-4">
      {grouped.map(([key, monthHolidays]) => {
        const [y, m] = key.split("-").map(Number);
        return (
          <Card key={key}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm font-semibold">
                {monthNames[m - 1]} {y}
              </CardTitle>
            </CardHeader>
            <CardContent className="py-0 pb-3">
              <div className="space-y-1.5">
                {monthHolidays
                  .sort((a, b) => new Date(a.holidayDate).getTime() - new Date(b.holidayDate).getTime())
                  .map((h) => {
                    const d = new Date(h.holidayDate);
                    const dayName = d.toLocaleDateString("en-US", { weekday: "short" });
                    return (
                      <div
                        key={h.id}
                        className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-muted/50 transition-colors"
                      >
                        <div className="w-12 text-center">
                          <div className="text-lg font-bold leading-none">{d.getDate()}</div>
                          <div className="text-[10px] text-muted-foreground uppercase">{dayName}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">{h.holidayName}</div>
                          {h.localName && h.localName !== h.holidayName && (
                            <div className="text-xs text-muted-foreground">{h.localName}</div>
                          )}
                        </div>
                        <span className="text-base">{countryFlag(h.countryCode)}</span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {countryName(h.countryCode)}
                        </Badge>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Compliance Resources Cards ──────────────────────────────────────────────

function ComplianceResources() {
  const resources = [
    {
      icon: Scale,
      title: "Labor Law Updates",
      description: "Stay informed about the latest labor law changes in your operating countries.",
      badge: "Coming Soon",
      color: "text-blue-600 bg-blue-50",
    },
    {
      icon: Shield,
      title: "Statutory Benefits",
      description: "Overview of mandatory benefits, social security, and insurance requirements.",
      badge: "Coming Soon",
      color: "text-green-600 bg-green-50",
    },
    {
      icon: FileText,
      title: "Employment Contracts",
      description: "Country-specific contract templates and compliance requirements.",
      badge: "Coming Soon",
      color: "text-purple-600 bg-purple-50",
    },
    {
      icon: BookOpen,
      title: "Compliance Guides",
      description: "Comprehensive guides for managing employees across different jurisdictions.",
      badge: "Coming Soon",
      color: "text-amber-600 bg-amber-50",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {resources.map((r) => (
        <Card
          key={r.title}
          className="group hover:shadow-md transition-all duration-200 cursor-default opacity-75"
        >
          <CardContent className="py-5">
            <div className="flex items-start gap-4">
              <div className={cn("p-2.5 rounded-lg", r.color)}>
                <r.icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-sm font-semibold">{r.title}</h4>
                  <Badge variant="secondary" className="text-[10px]">{r.badge}</Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{r.description}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function PortalCompliance() {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedCountry, setSelectedCountry] = useState("all");
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");

  const { data: holidays, isLoading } = portalTrpc.leave.publicHolidays.useQuery({
    year: selectedYear,
  });

  // Get unique countries from holidays
  const countries = useMemo(() => {
    if (!holidays) return [];
    const map = new Map<string, string>();
    holidays.forEach((h: any) => {
      if (!map.has(h.countryCode)) {
        map.set(h.countryCode, h.countryCode);
      }
    });
    return Array.from(map.entries()).map(([code]) => code).sort();
  }, [holidays]);

  // Filter holidays by country
  const filteredHolidays = useMemo(() => {
    if (!holidays) return [];
    if (selectedCountry === "all") return holidays;
    return holidays.filter((h: any) => h.countryCode === selectedCountry);
  }, [holidays, selectedCountry]);

  return (
    <PortalLayout title="Compliance Hub">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Compliance Hub</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Policy updates, public holidays, and compliance resources for your operating countries
          </p>
        </div>

        {/* Info Banner */}
        <div className="flex items-start gap-3 p-4 rounded-lg bg-blue-50 border border-blue-100">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-900">Your Compliance Dashboard</p>
            <p className="text-xs text-blue-700 mt-0.5">
              Public holidays are automatically synced for countries where you have active employees.
              Use this hub to plan payroll schedules and ensure compliance with local regulations.
            </p>
          </div>
        </div>

        {/* Compliance Resources */}
        <div>
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Globe className="w-5 h-5 text-muted-foreground" />
            Compliance Resources
          </h3>
          <ComplianceResources />
        </div>

        {/* Public Holidays Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-muted-foreground" />
              Public Holidays
            </h3>
            <div className="flex items-center gap-2">
              {/* View Mode Toggle */}
              <div className="flex rounded-lg border overflow-hidden">
                <button
                  onClick={() => setViewMode("calendar")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    viewMode === "calendar"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card hover:bg-muted"
                  )}
                >
                  Calendar
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    viewMode === "list"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card hover:bg-muted"
                  )}
                >
                  List
                </button>
              </div>

              {/* Country Filter */}
              <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <SelectValue placeholder="All Countries" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    <span className="flex items-center gap-2">
                      <Globe className="w-3 h-3" />
                      All Countries
                    </span>
                  </SelectItem>
                  {countries.map((code) => (
                    <SelectItem key={code} value={code}>
                      <span className="flex items-center gap-2">
                        <span>{countryFlag(code)}</span>
                        {countryName(code)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Year Selector */}
              <Select
                value={String(selectedYear)}
                onValueChange={(v) => setSelectedYear(Number(v))}
              >
                <SelectTrigger className="w-[100px] h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2025, 2026, 2027].map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-[400px] w-full rounded-lg" />
            </div>
          ) : filteredHolidays.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <div className="flex flex-col items-center justify-center text-muted-foreground">
                  <CalendarDays className="w-10 h-10 mb-3" />
                  <p className="text-sm font-medium">No holidays found</p>
                  <p className="text-xs mt-1">
                    {selectedCountry !== "all"
                      ? "Try selecting a different country or year."
                      : "Holiday data will appear when you have active employees."}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : viewMode === "calendar" ? (
            <HolidayCalendar holidays={filteredHolidays as any} selectedCountry={selectedCountry} />
          ) : (
            <HolidayListView holidays={filteredHolidays as any} />
          )}

          {/* Holiday Count Summary */}
          {!isLoading && filteredHolidays.length > 0 && (
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span>
                Total: <strong className="text-foreground">{filteredHolidays.length}</strong> holidays
                {selectedCountry === "all" && countries.length > 0 && (
                  <> across <strong className="text-foreground">{countries.length}</strong> countries</>
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
  );
}