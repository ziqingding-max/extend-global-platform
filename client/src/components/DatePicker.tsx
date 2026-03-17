import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DatePickerProps {
  /** Current value as YYYY-MM-DD string */
  value?: string;
  /** Called with YYYY-MM-DD string when date changes */
  onChange: (date: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Disable the picker */
  disabled?: boolean;
  /** Additional className for the trigger button */
  className?: string;
  /** Minimum selectable date (YYYY-MM-DD) */
  minDate?: string;
  /** Maximum selectable date (YYYY-MM-DD) */
  maxDate?: string;
}

/**
 * DatePicker component using shadcn/ui Calendar + Popover.
 * Supports year/month dropdown navigation for easy jumping.
 * Value is always a YYYY-MM-DD string.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Select date",
  disabled = false,
  className,
  minDate,
  maxDate,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  // Sync internal state when external value changes
  React.useEffect(() => {
    if (value) {
      const d = parse(value, "yyyy-MM-dd", new Date());
      if (isValid(d)) {
        // Only update if parsed date is different from current selection to avoid loops?
        // Actually, just updating state is fine, Calendar handles it.
      }
    }
  }, [value]);

  // Parse value to Date for Calendar
  const selectedDate = React.useMemo(() => {
    if (!value) return undefined;
    const d = parse(value, "yyyy-MM-dd", new Date());
    return isValid(d) ? d : undefined;
  }, [value]);

  // Parse min/max dates
  const fromDate = React.useMemo(() => {
    if (!minDate) return undefined;
    const d = parse(minDate, "yyyy-MM-dd", new Date());
    return isValid(d) ? d : undefined;
  }, [minDate]);

  const toDate = React.useMemo(() => {
    if (!maxDate) return undefined;
    const d = parse(maxDate, "yyyy-MM-dd", new Date());
    return isValid(d) ? d : undefined;
  }, [maxDate]);

  const handleSelect = (date: Date | undefined) => {
    if (date) {
      const formatted = format(date, "yyyy-MM-dd");
      onChange(formatted);
      setOpen(false);
    }
  };

  // Default month to show: selected date, or today
  // We maintain an internal state for the calendar's current month view
  // When 'value' changes externally, we update this state to jump the calendar to the new date
  const [currentMonth, setCurrentMonth] = React.useState<Date>(selectedDate || new Date());

  // Sync currentMonth when selectedDate changes (including when value is set or cleared)
  React.useEffect(() => {
    if (selectedDate) {
      setCurrentMonth(selectedDate);
    }
  }, [selectedDate]);

  // When minDate changes (e.g. startDate updated), reset calendar view to minDate's month
  // so the end-date picker shows the relevant month instead of stale old month
  React.useEffect(() => {
    if (fromDate && !selectedDate) {
      setCurrentMonth(fromDate);
    }
  }, [fromDate, selectedDate]);

  // When the popover opens, ensure the calendar shows the most relevant month
  React.useEffect(() => {
    if (open) {
      if (selectedDate) {
        setCurrentMonth(selectedDate);
      } else if (fromDate) {
        setCurrentMonth(fromDate);
      } else {
        setCurrentMonth(new Date());
      }
    }
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal h-9",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {value ? format(selectedDate || new Date(), "dd MMM yyyy") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleSelect}
          month={currentMonth}
          onMonthChange={setCurrentMonth}
          captionLayout="dropdown"
          fromYear={1940}
          toYear={2035}
          classNames={{ today: "" }}
          startMonth={fromDate}
          endMonth={toDate}
          disabled={
            fromDate || toDate
              ? (date) => {
                  if (fromDate && date < fromDate) return true;
                  if (toDate && date > toDate) return true;
                  return false;
                }
              : undefined
          }
        />
      </PopoverContent>
    </Popover>
  );
}

interface MonthPickerProps {
  /** Current value as YYYY-MM string */
  value?: string;
  /** Called with YYYY-MM string when month changes */
  onChange: (month: string) => void;
  /** Placeholder text */
  placeholder?: string;
  /** Disable the picker */
  disabled?: boolean;
  /** Additional className */
  className?: string;
}

/**
 * MonthPicker component for selecting a year-month (YYYY-MM).
 * Uses a simple dropdown approach with year/month selectors.
 */
export function MonthPicker({
  value,
  onChange,
  placeholder = "Select month",
  disabled = false,
  className,
}: MonthPickerProps) {
  const [open, setOpen] = React.useState(false);

  // Parse current value
  const currentYear = value ? parseInt(value.split("-")[0]) : new Date().getFullYear();
  const currentMonth = value ? parseInt(value.split("-")[1]) : new Date().getMonth() + 1;

  const [viewYear, setViewYear] = React.useState(currentYear);

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];

  const handleMonthSelect = (monthIndex: number) => {
    const formatted = `${viewYear}-${String(monthIndex + 1).padStart(2, "0")}`;
    onChange(formatted);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal h-9",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
          {value ? `${months[currentMonth - 1]} ${currentYear}` : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="space-y-3">
          {/* Year navigation */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewYear((y) => y - 1)}
            >
              ‹
            </Button>
            <span className="text-sm font-medium">{viewYear}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setViewYear((y) => y + 1)}
            >
              ›
            </Button>
          </div>
          {/* Month grid */}
          <div className="grid grid-cols-3 gap-2">
            {months.map((m, i) => {
              const isSelected = viewYear === currentYear && i + 1 === currentMonth;
              return (
                <Button
                  key={m}
                  variant={isSelected ? "default" : "ghost"}
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => handleMonthSelect(i)}
                >
                  {m}
                </Button>
              );
            })}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
