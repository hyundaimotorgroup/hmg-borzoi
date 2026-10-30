"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;

interface PaginationBarProps {
  page: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  filteredItems?: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function PaginationBar({
  page,
  totalPages,
  pageSize,
  totalItems,
  filteredItems,
  onPageChange,
  onPageSizeChange,
}: PaginationBarProps) {
  const displayed = filteredItems ?? totalItems;
  const from = displayed === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, displayed);

  const handlePageSizeChange = (val: string) => {
    onPageSizeChange(Number(val));
    onPageChange(1);
  };

  return (
    <div className="flex items-center justify-between pt-1">
      <p className="text-xs text-gray-400 dark:text-gray-500">
        {displayed === 0
          ? "No items"
          : `${from}–${to} of ${displayed}`}
        {filteredItems !== undefined && filteredItems !== totalItems && (
          <span className="ml-1">(filtered from {totalItems})</span>
        )}
      </p>
      <div className="flex items-center gap-1.5">
        <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
          <SelectTrigger className="h-7 w-[90px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0"
          aria-label="Previous page"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </Button>
        <span className="text-xs text-gray-500 dark:text-gray-400 px-1.5 min-w-16 text-center tabular-nums">
          {page} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 w-7 p-0"
          aria-label="Next page"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
