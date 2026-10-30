"use client";

import { useState, useRef, useEffect } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { writeTextSafe } from "@/lib/utils/clipboard";
import type { TextLog } from "./types";

type Props = {
  log: TextLog | null;
  rowIndex: number | null;
  onClose: () => void;
};

type FieldDef = {
  label: string;
  value: string;
  typeLabel: string;
  typeBadgeClass: string;
};

const DATETIME_BADGE = "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300";
const STRING_BADGE   = "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300";
const UINT64_BADGE   = "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300";

function getFields(log: TextLog): FieldDef[] {
  return [
    { label: "timestamp",   value: log.eventTime,           typeLabel: "DATETIME64", typeBadgeClass: DATETIME_BADGE },
    { label: "level",       value: log.level,               typeLabel: "STRING",     typeBadgeClass: STRING_BADGE },
    { label: "node",        value: log.node || "-",         typeLabel: "STRING",     typeBadgeClass: STRING_BADGE },
    { label: "component",   value: log.loggerName,          typeLabel: "STRING",     typeBadgeClass: STRING_BADGE },
    { label: "message",     value: log.message,             typeLabel: "STRING",     typeBadgeClass: STRING_BADGE },
    { label: "thread_name", value: log.threadName,          typeLabel: "STRING",     typeBadgeClass: STRING_BADGE },
    { label: "query_id",    value: log.queryId || "-",      typeLabel: "STRING",     typeBadgeClass: STRING_BADGE },
    { label: "source_file", value: log.sourceFile,          typeLabel: "STRING",     typeBadgeClass: STRING_BADGE },
    { label: "source_line", value: String(log.sourceLine),  typeLabel: "UINT64",     typeBadgeClass: UINT64_BADGE },
  ];
}

export function LogDetailPanel({ log, rowIndex, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  async function handleCopyJson() {
    if (!log) return;
    const ok = await writeTextSafe(JSON.stringify(log, null, 2));
    if (ok) {
      toast.success("Copied to clipboard.");
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setCopied(true);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Failed to copy to clipboard.");
    }
  }

  return (
    <Dialog open={log !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="w-[90vw] !p-0 !gap-0 overflow-hidden flex flex-col"
        style={{ maxWidth: "720px", maxHeight: "80vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex-shrink-0">
          <div>
            <DialogTitle className="text-sm">Log Details</DialogTitle>
            {rowIndex !== null && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Row #{rowIndex + 1}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleCopyJson()}
            className="h-7 text-xs px-2 gap-1 mr-6"
          >
            {copied
              ? <Check className="w-3 h-3 text-green-500" />
              : <Copy className="w-3 h-3" />}
            {copied ? "Copied!" : "Copy JSON"}
          </Button>
        </div>

        {/* Body */}
        {log && (
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-6 py-2">
            {getFields(log).map((field) => (
              <div
                key={field.label}
                className="border-b border-gray-100 dark:border-slate-700 py-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {field.label}
                  </span>
                  <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${field.typeBadgeClass}`}>
                    {field.typeLabel}
                  </span>
                </div>
                <div className="overflow-x-auto overflow-y-auto max-h-40 pb-1">
                  <pre className="text-sm font-mono text-gray-900 dark:text-gray-100 whitespace-pre m-0">
                    {field.value || "-"}
                  </pre>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
