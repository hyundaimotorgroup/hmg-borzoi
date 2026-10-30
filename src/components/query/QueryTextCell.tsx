"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { formatSQLWithFallback } from "@/lib/utils/sql-formatter";
import { cn } from "@/lib/utils";

type QueryTextCellProps = {
  query: string;
  queryId?: string;
  emptyLabel?: string;
  dialogTitle?: string;
  dialogDescription?: string;
  wrapperClassName?: string;
  triggerClassName?: string;
  copyButtonClassName?: string;
  dialogClassName?: string;
  triggerTitle?: string;
  copyButtonTitle?: string;
};

export function QueryTextCell({
  query,
  queryId,
  emptyLabel = "-",
  dialogTitle = "Full Query",
  dialogDescription,
  wrapperClassName,
  triggerClassName,
  copyButtonClassName,
  dialogClassName,
  triggerTitle = "View full query",
  copyButtonTitle = "Copy full query",
}: QueryTextCellProps) {
  const [open, setOpen] = useState(false);
  const [dialogQueryText, setDialogQueryText] = useState(query);
  const [formatting, setFormatting] = useState(false);
  const [formatted, setFormatted] = useState(false);
  const originalQueryRef = useRef(query);
  const { copied, copy } = useCopyToClipboard();

  const effectiveDescription = useMemo(() => dialogDescription ?? queryId ?? "", [dialogDescription, queryId]);

  useEffect(() => {
    if (open) {
      originalQueryRef.current = query;
      setDialogQueryText(query);
      setFormatted(false);
    }
  }, [open, query]);

  const copyQuery = async (text: string) => {
    if (!text) return;
    await copy(text);
  };

  const formatQuery = async () => {
    if (!dialogQueryText.trim()) return;

    if (formatted) {
      setDialogQueryText(originalQueryRef.current);
      setFormatted(false);
      return;
    }

    setFormatting(true);
    try {
      const result = await formatSQLWithFallback(dialogQueryText);
      setDialogQueryText(result);
      setFormatted(true);
      toast.success("SQL formatted.");
    } finally {
      setFormatting(false);
    }
  };

  if (!query) {
    return <span className="text-xs text-gray-400 dark:text-gray-500">{emptyLabel}</span>;
  }

  return (
    <>
      <div className={cn("flex w-full min-w-0 items-center gap-2", wrapperClassName)}>
        <button
          type="button"
          className={cn(
            "w-0 min-w-0 flex-1 overflow-hidden text-left font-mono text-xs text-gray-700 hover:text-gray-900 hover:underline dark:text-gray-300 dark:hover:text-gray-100 break-all [display:-webkit-box] [-webkit-line-clamp:4] [-webkit-box-orient:vertical]",
            triggerClassName
          )}
          title={triggerTitle}
          onClick={() => setOpen(true)}
        >
          {query}
        </button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn("h-6 w-6 shrink-0 p-0", copyButtonClassName)}
          onClick={() => void copyQuery(query)}
          aria-label={queryId ? `Copy full query ${queryId}` : copyButtonTitle}
          title={copyButtonTitle}
        >
          {copied ? (
            <Check className="w-3 h-3 text-green-600" />
          ) : (
            <Copy className="w-3 h-3" />
          )}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className={cn("!p-0 !gap-0 !flex !flex-col overflow-hidden", dialogClassName)}
          style={{
            width: "min(96vw, 72rem)",
            maxWidth: "min(96vw, 72rem)",
            maxHeight: "90vh",
          }}
        >
          <div className="shrink-0 border-b px-6 py-4 pr-14">
            <div className="flex items-center justify-between gap-4">
              <DialogTitle className="min-w-0 text-left">{dialogTitle}</DialogTitle>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void formatQuery()}
                  disabled={!dialogQueryText.trim() || formatting}
                >
                  {formatting ? "Formatting..." : formatted ? "Restore Original" : "Format SQL"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyQuery(dialogQueryText)}
                  disabled={!dialogQueryText.trim()}
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 mr-1 text-green-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 mr-1" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>
            {effectiveDescription ? (
              <div className="mt-2 max-w-full">
                <div className="truncate font-mono text-xs text-gray-500" title={effectiveDescription}>
                  {effectiveDescription}
                </div>
              </div>
            ) : null}
          </div>
          <div className="min-h-0 max-h-[70vh] flex-1 overflow-hidden px-6 py-4">
            <div
              className="min-w-0 rounded-md border bg-muted/20 p-4 overflow-x-auto overflow-y-auto"
              style={{ maxHeight: "calc(70vh - 3rem)" }}
            >
              <pre className="min-w-max whitespace-pre font-mono text-xs leading-5 text-gray-900 dark:text-gray-100">
                {dialogQueryText}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
