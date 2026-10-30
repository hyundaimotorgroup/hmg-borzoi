import { useState, useMemo } from "react";
import type { ChartSeriesSummaryRow } from "./chartSeriesSummary";
import { DASHBOARD_SUMMARY_TABLE_HEIGHT } from "@/components/cluster-detail/shared/charts/chartLayout";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

interface ChartSeriesSummaryTableProps {
  rows: ChartSeriesSummaryRow[];
  unit?: string;
  valueFormatter?: (value: number) => string;
  onRowClick?: (label: string) => void;
  hoveredLabel?: string | null;
  focusedLabels?: string[];
}

type SortKey = "label" | "min" | "max" | "last";
type SortDir = "asc" | "desc" | null;

const defaultFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatValue(value: number, unit?: string, valueFormatter?: (value: number) => string) {
  if (valueFormatter) return valueFormatter(value);
  return `${defaultFormatter.format(value)}${unit ?? ""}`;
}

function SeriesMarker({ color }: { color: string }) {
  return (
    <span className="relative flex h-4 w-6 items-center" aria-hidden="true">
      <span className="h-[3px] w-6 rounded-full" style={{ backgroundColor: color }} />
      <span
        className="absolute left-1/2 h-3.5 w-3.5 -translate-x-1/2 rounded-full border-2 border-white shadow-sm dark:border-slate-900"
        style={{ backgroundColor: color }}
      />
    </span>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active || dir === null) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
  return dir === "asc"
    ? <ArrowUp className="h-3 w-3" />
    : <ArrowDown className="h-3 w-3" />;
}

interface SortableHeadProps {
  children: React.ReactNode;
  sortKey: SortKey;
  currentKey: SortKey | null;
  currentDir: SortDir;
  align?: "left" | "right";
  className?: string;
  onClick: (key: SortKey) => void;
}

function SortableHead({ children, sortKey, currentKey, currentDir, align = "left", className = "", onClick }: SortableHeadProps) {
  const isActive = currentKey === sortKey;
  const justifyClass = align === "right" ? "justify-end" : "justify-start";
  return (
    <TableHead
      className={`h-auto bg-muted px-3 py-1 text-xs text-foreground ${className}`}
    >
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className={`flex w-full cursor-pointer select-none items-center gap-1 ${justifyClass} text-foreground`}
      >
        {children}
        <SortIcon active={isActive} dir={isActive ? currentDir : null} />
      </button>
    </TableHead>
  );
}

export function ChartSeriesSummaryTable({ rows, unit, valueFormatter, onRowClick, hoveredLabel, focusedLabels = [] }: ChartSeriesSummaryTableProps) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const handleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      // desc → reset
      setSortKey(null);
      setSortDir(null);
    }
  };

  const sortedRows = useMemo(() => {
    if (sortKey === null || sortDir === null) return rows;
    return [...rows].sort((a, b) => {
      const aVal = sortKey === "label" ? a.label : a[sortKey];
      const bVal = sortKey === "label" ? b.label : b[sortKey];
      if (typeof aVal === "string" && typeof bVal === "string") {
        return sortDir === "asc" ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortDir === "asc"
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
  }, [rows, sortKey, sortDir]);

  if (rows.length === 0) {
    return (
      <div
        className="mt-3 flex min-h-0 items-center rounded-md border border-dashed px-3 py-2 text-[11px] text-muted-foreground"
        style={{ height: DASHBOARD_SUMMARY_TABLE_HEIGHT }}
      >
        Summary will appear when visible series data is available.
      </div>
    );
  }

  return (
    <div className="mt-3 overflow-hidden rounded-md border">
      <div className="overflow-auto" style={{ height: DASHBOARD_SUMMARY_TABLE_HEIGHT }}>
        <table className="w-full min-w-[420px] caption-bottom text-xs">
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <SortableHead
                sortKey="label"
                currentKey={sortKey}
                currentDir={sortDir}
                align="left"
                className="sticky left-0 z-20"
                onClick={handleSort}
              >
                server
              </SortableHead>
              <SortableHead sortKey="min" currentKey={sortKey} currentDir={sortDir} align="right" onClick={handleSort}>min</SortableHead>
              <SortableHead sortKey="max" currentKey={sortKey} currentDir={sortDir} align="right" onClick={handleSort}>max</SortableHead>
              <SortableHead sortKey="last" currentKey={sortKey} currentDir={sortDir} align="right" onClick={handleSort}>last</SortableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.map((row) => {
              const isHovered = hoveredLabel === row.label;
              const isFaded = focusedLabels.length > 0 && !focusedLabels.includes(row.label) && !focusedLabels.includes(row.parentKey ?? "");
              return (
                <TableRow
                  key={row.key}
                  className="transition-opacity duration-200"
                  style={{
                    opacity: isFaded ? 0.3 : 1,
                    backgroundColor: isHovered ? "color-mix(in srgb, var(--muted) 86%, transparent)" : undefined,
                    boxShadow: isHovered ? `inset 3px 0 0 ${row.color}` : undefined,
                  }}
                >
                  <TableCell className="sticky left-0 bg-card px-3 py-0.5">
                    {onRowClick ? (
                      <button
                        type="button"
                        onClick={() => onRowClick(row.label)}
                        className="flex w-full items-center gap-2 whitespace-nowrap rounded-sm text-left text-foreground transition-colors hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:text-blue-300"
                      >
                        <SeriesMarker color={row.color} />
                        <span className="max-w-[180px] truncate " style={{ color: row.color }}>{row.label}</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 whitespace-nowrap text-foreground">
                        <SeriesMarker color={row.color} />
                        <span className="max-w-[180px] truncate " style={{ color: row.color }}>{row.label}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="px-3 py-0.5 text-right tabular-nums text-muted-foreground">{formatValue(row.min, unit, valueFormatter)}</TableCell>
                  <TableCell className="px-3 py-0.5 text-right tabular-nums text-muted-foreground">{formatValue(row.max, unit, valueFormatter)}</TableCell>
                  <TableCell className="px-3 py-0.5 text-right tabular-nums text-foreground">{formatValue(row.last, unit, valueFormatter)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </table>
      </div>
    </div>
  );
}
