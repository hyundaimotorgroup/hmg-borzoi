"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarRange, ChevronDown, Clock, RefreshCw } from "lucide-react";
import {
  DEFAULT_RELATIVE_PRESET,
  describeDashboardTimeRange,
  getRelativePresetLabel,
  RELATIVE_PRESET_OPTIONS,
  resolveTimeseriesRange,
  toDateTimeLocalValue,
  type DashboardTimeRange,
} from "@/lib/metrics/timeseries-range";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DashboardTimeRangePickerProps {
  value: DashboardTimeRange;
  timezone: string;
  onChange: (value: DashboardTimeRange) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  disabled?: boolean;
  refreshLabel?: string;
}

export function DashboardTimeRangePicker({
  value,
  timezone,
  onChange,
  onRefresh,
  refreshing = false,
  disabled = false,
  refreshLabel = "Refresh charts",
}: DashboardTimeRangePickerProps) {
  const getDraftRange = useCallback((now = new Date()) => {
    if (value.mode === "absolute") {
      return { from: value.from, to: value.to };
    }

    const resolvedRange = resolveTimeseriesRange({
      mode: value.mode,
      preset: value.preset,
      timezone,
      now,
    });

    return {
      from: toDateTimeLocalValue(resolvedRange.start, timezone),
      to: toDateTimeLocalValue(resolvedRange.end, timezone),
    };
  }, [timezone, value]);

  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(() => getDraftRange().from);
  const [draftTo, setDraftTo] = useState(() => getDraftRange().to);
  const [error, setError] = useState<string | null>(null);

  const syncDraftRange = useCallback((now = new Date()) => {
    const nextRange = getDraftRange(now);
    setDraftFrom(nextRange.from);
    setDraftTo(nextRange.to);
    setError(null);
  }, [getDraftRange]);

  useEffect(() => {
    if (!open && value.mode !== "absolute") {
      return;
    }

    syncDraftRange();
  }, [open, syncDraftRange, value.mode]);

  const selectedPresetLabel = useMemo(() => {
    if (value.mode === "relative") {
      return getRelativePresetLabel(value.preset);
    }

    return describeDashboardTimeRange(value);
  }, [value]);

  function handlePresetClick(preset: (typeof RELATIVE_PRESET_OPTIONS)[number]["value"]) {
    setError(null);
    onChange({ mode: "relative", preset });
    setOpen(false);
  }

  function handleApplyAbsolute() {
    if (!draftFrom || !draftTo) {
 setError("From/To .");
      return;
    }

    if (draftFrom >= draftTo) {
 setError("To From .");
      return;
    }

    setError(null);
    onChange({ mode: "absolute", from: draftFrom, to: draftTo });
    setOpen(false);
  }

  function handleReset() {
    setError(null);
    onChange({ mode: "relative", preset: DEFAULT_RELATIVE_PRESET });
    setOpen(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      syncDraftRange();
    }

    setOpen(nextOpen);
  }

  return (
    <div className="flex items-center justify-end gap-2 flex-shrink-0">
      <div className="inline-flex items-stretch overflow-hidden rounded-xl shadow-sm">
        <Popover open={open} onOpenChange={handleOpenChange}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              aria-label={selectedPresetLabel}
              title={selectedPresetLabel}
              disabled={disabled}
              className="h-11 min-w-[230px] justify-between gap-3 rounded-none border-r-0 border-slate-300 bg-white px-3.5 text-left text-slate-900 shadow-none hover:bg-slate-50 hover:text-slate-950 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-800"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700 dark:bg-blue-400/20 dark:text-blue-100 dark:ring-1 dark:ring-blue-300/20">
                  <CalendarRange className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm text-slate-900 dark:text-slate-50">
                    {selectedPresetLabel}
                  </div>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-300" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-3 border-slate-200 shadow-lg dark:border-slate-700">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
                <Clock className="h-3.5 w-3.5" />
                <span>{selectedPresetLabel}</span>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">Timezone: {timezone}</p>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {RELATIVE_PRESET_OPTIONS.map((option) => {
                  const active = value.mode === "relative" && value.preset === option.value;
                  return (
                    <Button
                      key={option.value}
                      variant={active ? "default" : "outline"}
                      size="sm"
                      onClick={() => handlePresetClick(option.value)}
                      className="justify-start text-xs"
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>

              <div className="border-t pt-2" />

              <label className="block text-xs text-gray-700 dark:text-gray-300">
                From
                <Input type="datetime-local" value={draftFrom} onChange={(event) => setDraftFrom(event.target.value)} className="mt-1 dark:[color-scheme:dark] dark:[&::-webkit-calendar-picker-indicator]:cursor-pointer dark:[&::-webkit-calendar-picker-indicator]:invert dark:[&::-webkit-calendar-picker-indicator]:opacity-80" disabled={disabled} />
              </label>
              <label className="block text-xs text-gray-700 dark:text-gray-300">
                To
                <Input type="datetime-local" value={draftTo} onChange={(event) => setDraftTo(event.target.value)} className="mt-1 dark:[color-scheme:dark] dark:[&::-webkit-calendar-picker-indicator]:cursor-pointer dark:[&::-webkit-calendar-picker-indicator]:invert dark:[&::-webkit-calendar-picker-indicator]:opacity-80" disabled={disabled} />
              </label>
            </div>

            {error ? <p className="text-xs text-red-600 dark:text-red-400">{error}</p> : null}

            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={handleReset}>
                Reset
              </Button>
              <Button size="sm" onClick={handleApplyAbsolute} disabled={disabled}>
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        {onRefresh ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || refreshing}
            onClick={onRefresh}
            aria-label={refreshLabel}
            title={refreshLabel}
            className="h-11 w-11 shrink-0 rounded-none border-slate-300 bg-white px-0 text-slate-700 shadow-none hover:bg-slate-50 hover:text-slate-950 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4.5 w-4.5 ${refreshing ? "animate-spin text-blue-600 dark:text-blue-300" : "text-slate-700 dark:text-slate-100"}`} />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
