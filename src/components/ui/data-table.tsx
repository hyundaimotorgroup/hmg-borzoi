"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  type ColumnDef,
  type SortingState,
  type RowData,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { DEFAULT_ROW_HEIGHT, DEFAULT_OVERSCAN } from "@/lib/virtual/virtual.config";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Match TanStack's required generic parameters for module augmentation.
  interface ColumnMeta<TData extends RowData, TValue> {
    truncate?: boolean;
    align?: "left" | "right" | "center";
    maxWidth?: number;
    minWidth?: number;
  }
}

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronDown } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationBar } from "@/components/ui/pagination-bar";

export interface FilterThProps {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}

export function FilterTh({ label, value, options, onChange }: FilterThProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const active = value !== "all";

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen((p) => !p);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        dropRef.current && !dropRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className={`flex items-center gap-0.5 whitespace-nowrap text-xs select-none focus:outline-none ${
          active
            ? "text-blue-600 dark:text-blue-400"
            : "text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
        }`}
      >
        {label}
        <ChevronDown
          className={`w-3 h-3 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""} ${
            active ? "text-blue-500" : "text-gray-400"
          }`}
        />
        {active && (
          <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
        )}
      </button>

      {open && (
        <div
          ref={dropRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="min-w-[130px] bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded shadow-lg py-1"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {(["all", ...options] as string[]).map((o) => (
            <button
              key={o}
              onClick={() => { onChange(o); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors ${
                value === o
                  ? "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20"
                  : "text-gray-700 dark:text-gray-300"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${value === o ? "bg-blue-500" : ""}`} />
              {o === "all" ? "All" : o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface DataTableProps<TData> {
  columns: ColumnDef<TData>[];
  data: TData[];
  // Server-side pagination
  pageCount?: number;
  pageIndex?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  // State
  isLoading?: boolean;
  emptyMessage?: React.ReactNode;
  // Row interaction
  onRowClick?: (row: TData) => void;
  getRowClassName?: (row: TData) => string | undefined;
  // Layout
  hidePagination?: boolean;
  rowHeight?: number;
  maxHeight?: string | number;
  disableVirtualization?: boolean;
}

export function DataTable<TData>({
  columns,
  data,
  pageCount,
  pageIndex = 0,
  pageSize = 20,
  onPageChange,
  onPageSizeChange,
  isLoading = false,
  emptyMessage = "No data found.",
  onRowClick,
  getRowClassName,
  hidePagination = false,
  rowHeight = DEFAULT_ROW_HEIGHT,
  maxHeight,
  disableVirtualization = false,
}: DataTableProps<TData>) {
  "use no memo"; // TanStack Table v8 requires reading its mutable instance on every render.

  const containerRef = useRef<HTMLDivElement>(null);
  const isServerSide = onPageChange !== undefined;

  const [sorting, setSorting] = useState<SortingState>([]);

  const prevDataRef = useRef(data);
  useEffect(() => {
    prevDataRef.current = data;
  }, [data]);

  // eslint-disable-next-line react-hooks/incompatible-library -- This component opts out of React Compiler memoization for TanStack Table v8.
  const table = useReactTable<TData>({
    data,
    columns,
    state: {
      sorting,
      ...(isServerSide ? { pagination: { pageIndex, pageSize } } : {}),
    },
    manualPagination: isServerSide,
    pageCount: isServerSide ? (pageCount ?? -1) : undefined,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;
  const colCount = columns.length;

  const rowVirtualizer = useVirtualizer({
    count: isLoading || disableVirtualization ? 0 : rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => rowHeight,
    overscan: DEFAULT_OVERSCAN,
  });

  const virtualRows = disableVirtualization ? [] : rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const paddingTop = virtualRows.length > 0 ? (virtualRows[0]?.start ?? 0) : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? totalSize - (virtualRows[virtualRows.length - 1]?.end ?? 0)
      : 0;

  const maxHeightStyle = maxHeight === undefined
    ? undefined
    : typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight;

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={containerRef}
        className="overflow-auto rounded-md border"
        style={{ maxHeight: maxHeightStyle }}
      >
        <Table style={{ tableLayout: "fixed" }}>
          <colgroup>
            {table.getFlatHeaders().map((header) => (
              <col key={header.id} style={{ width: `${header.column.getSize()}px` }} />
            ))}
          </colgroup>
          <TableHeader className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  const align = header.column.columnDef.meta?.align ?? "left";
                  const isRight = align === "right";
                  const isCenter = align === "center";

                  return (
                    <TableHead
                      key={header.id}
                      colSpan={header.colSpan}
                      className={
                        isRight
                          ? "text-right overflow-hidden"
                          : isCenter
                          ? "text-center overflow-hidden"
                          : "overflow-hidden"
                      }
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <div
                          role="button"
                          tabIndex={0}
                          className={`flex cursor-pointer select-none items-center gap-1${isRight ? " justify-end" : isCenter ? " justify-center" : ""}`}
                          onClick={header.column.getToggleSortingHandler()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              header.column.getToggleSortingHandler()?.(e);
                            }
                          }}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span className="ml-1 inline-flex">
                            {sortDir === "asc" ? (
                              <ArrowUp className="h-3.5 w-3.5" />
                            ) : sortDir === "desc" ? (
                              <ArrowDown className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
                            )}
                          </span>
                        </div>
                      ) : (
                        <div>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </div>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, rowIdx) => (
                <TableRow key={`skeleton-${rowIdx}`}>
                  {Array.from({ length: colCount }).map((_, colIdx) => (
                    <TableCell key={`skeleton-${rowIdx}-${colIdx}`}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={colCount} className="h-24 text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              <>
                {!disableVirtualization && paddingTop > 0 && (
                  <tr aria-hidden="true">
                    <td style={{ height: paddingTop }} colSpan={colCount} />
                  </tr>
                )}
                {(disableVirtualization ? rows : virtualRows.map((vr) => rows[vr.index])).map((row, i) => {
                  if (!row) return null;
                  const extraClass = getRowClassName?.(row.original);
                  return (
                    <TableRow
                      key={row.id}
                      data-index={disableVirtualization ? i : virtualRows[i]?.index}
                      ref={disableVirtualization ? undefined : rowVirtualizer.measureElement}
                      data-state={row.getIsSelected() ? "selected" : undefined}
                      className={onRowClick ? `cursor-pointer ${extraClass ?? ""}` : extraClass}
                      onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const meta = cell.column.columnDef.meta;
                        const noTruncate = meta?.truncate === false;
                        const cellAlign = meta?.align;
                        const alignClass =
                          cellAlign === "right"
                            ? "text-right"
                            : cellAlign === "center"
                            ? "text-center"
                            : undefined;
                        const baseClass = noTruncate ? undefined : "truncate max-w-[1px]";
                        const className = [baseClass, alignClass].filter(Boolean).join(" ") || undefined;
                        return (
                          <TableCell
                            key={cell.id}
                            className={className}
                            onMouseEnter={noTruncate ? undefined : (e) => {
                              const el = e.currentTarget;
                              el.title = el.textContent?.trim() || '';
                            }}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
                {!disableVirtualization && paddingBottom > 0 && (
                  <tr aria-hidden="true">
                    <td style={{ height: paddingBottom }} colSpan={colCount} />
                  </tr>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </div>

      {!hidePagination && isServerSide && data.length > 0 && (
        <PaginationBar
          page={pageIndex + 1}
          totalPages={pageCount ?? 1}
          pageSize={pageSize}
          totalItems={(pageCount ?? 1) * pageSize}
          onPageChange={(p) => onPageChange!(p)}
          onPageSizeChange={onPageSizeChange ?? (() => {})}
        />
      )}
    </div>
  );
}
