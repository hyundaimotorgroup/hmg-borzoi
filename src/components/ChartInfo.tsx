import { useEffect, useRef, useState } from "react";
import { Check, Copy, Info } from "lucide-react";
import { toast } from "sonner";

import { SQLHighlight } from "@/components/query/SQLHighlight";
import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import { formatSQLWithFallback } from "@/lib/utils/sql-formatter";

import { Card } from "./ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

interface ChartInfoProps {
  title: string;
  description: string;
  yAxisLabel?: string;
  yAxisDescription?: string;
  aggregation?: string;
  query?: string;
}

export function ChartInfo({
  title,
  description,
  yAxisDescription,
  query,
}: ChartInfoProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [isHoveringTrigger, setIsHoveringTrigger] = useState(false);
  const [isHoveringContent, setIsHoveringContent] = useState(false);
  const [displayQuery, setDisplayQuery] = useState(query?.trim() ?? "");
  const [originalQuery, setOriginalQuery] = useState(query?.trim() ?? "");
  const [formatting, setFormatting] = useState(false);
  const [formatted, setFormatted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { copied, copy } = useCopyToClipboard();

  const visible = isPinned || isHoveringTrigger || isHoveringContent || isOpen;

  useEffect(() => {
    const trimmed = query?.trim() ?? "";
    setDisplayQuery(trimmed);
    setOriginalQuery(trimmed);
    setFormatted(false);
  }, [query]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!isPinned) {
      setIsOpen(nextOpen);
    }
  };

  const handleCopyQuery = () => {
    if (!displayQuery) return;
    void copy(displayQuery);
  };

  const handleFormatQuery = async () => {
    if (!displayQuery) return;

    if (formatted) {
      setDisplayQuery(originalQuery);
      setFormatted(false);
      return;
    }

    setFormatting(true);
    try {
      const result = await formatSQLWithFallback(displayQuery);
      setDisplayQuery(result);
      setFormatted(true);
      toast.success("SQL formatted.");
    } finally {
      setFormatting(false);
    }
  };

  const content = (
    <Card className="shadow-2xl border border-blue-200 dark:border-blue-700 bg-white dark:bg-slate-800 font-normal overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-900/70">
        <Info className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0" aria-hidden="true" />
        <span className="text-xs text-gray-800 dark:text-gray-100 truncate">
          {title}
        </span>
        {isPinned && (
          <span className="ml-auto text-[10px] text-blue-500 dark:text-blue-400 shrink-0 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/40">
            Pinned
          </span>
        )}
      </div>

      <div style={{ maxHeight: "min(440px, calc(100vh - 6rem))", overflowY: "auto" }}>
        <div className="pt-0.5 px-2.5 pb-2.5 space-y-2">
          {yAxisDescription && (
            <div className="rounded-md border border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900/50 px-2.5 py-2 flex gap-2 items-start">
              <span className="text-[10px] text-gray-400 dark:text-gray-500 pt-0.5 flex-shrink-0">About:</span>
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed break-words">{yAxisDescription}</p>
            </div>
          )}

          {query ? (
            <div className="rounded-md overflow-hidden border border-gray-200 dark:border-gray-600">
              <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 dark:bg-slate-800 border-b border-gray-200 dark:border-gray-600">
                <span
                  className="uppercase tracking-widest"
                  style={{ fontSize: "10px", color: "var(--sql-label)" }}
                >
                  SQL
                </span>
                <div className="flex items-center gap-1 ml-auto">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={() => void handleFormatQuery()}
                    disabled={!displayQuery || formatting}
                  >
                    {formatting ? "Formatting..." : formatted ? "Unformat" : "Format SQL"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px]"
                    onClick={() => void handleCopyQuery()}
                    disabled={!displayQuery}
                  >
                    {copied ? (
                      <Check className="w-2.5 h-2.5 mr-1 text-green-600" />
                    ) : (
                      <Copy className="w-2.5 h-2.5 mr-1" />
                    )}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  <span className="w-2 h-2 rounded-full bg-red-400/60" />
                  <span className="w-2 h-2 rounded-full bg-yellow-400/60" />
                  <span className="w-2 h-2 rounded-full bg-green-400/60" />
                </div>
              </div>
              <div style={{ background: "var(--sql-bg)" }} className="px-3 py-2.5 overflow-x-auto">
                <pre
                  style={{
                    fontSize: "12px",
                    lineHeight: "1.6",
                    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                    whiteSpace: "pre",
                    fontWeight: "normal",
                    margin: 0,
                  }}
                >
                  <SQLHighlight code={displayQuery} />
                </pre>
              </div>
            </div>
          ) : description ? (
            <div className="bg-gray-50 dark:bg-slate-900/50 rounded-md border border-gray-200 dark:border-gray-700 px-3 py-2.5">
              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed whitespace-pre-line break-words">
                {description}
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );

  return (
    <Popover open={visible} onOpenChange={handleOpenChange}>
      <div
        className="inline-block"
        onMouseEnter={() => setIsHoveringTrigger(true)}
        onMouseLeave={() => setIsHoveringTrigger(false)}
      >
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            className={`flex items-center justify-center p-1 rounded-full transition-[background-color,box-shadow] cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:focus-visible:ring-blue-400 ${
              isPinned
                ? "bg-blue-100 dark:bg-blue-900/50 ring-1 ring-blue-400 dark:ring-blue-500"
                : "hover:bg-blue-50 dark:hover:bg-blue-900/30"
            }`}
            aria-label={isPinned ? "Unpin query info" : "View query info (click to pin)"}
            aria-pressed={isPinned}
            onClick={(e) => {
              e.stopPropagation();
              setIsPinned((p) => !p);
              setIsOpen(false);
            }}
          >
            <Info
              className={`w-3.5 h-3.5 transition-colors ${
                isPinned
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-blue-400 dark:text-blue-500"
              }`}
              aria-hidden="true"
            />
          </button>
        </PopoverTrigger>
      </div>

      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={16}
        className="z-[120] w-[min(500px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] p-0 border-none bg-transparent shadow-none"
        onMouseEnter={() => setIsHoveringContent(true)}
        onMouseLeave={() => {
          setIsHoveringContent(false);
          if (!isPinned) {
            setIsOpen(false);
          }
        }}
        onEscapeKeyDown={() => {
          setIsPinned(false);
          setIsOpen(false);
        }}
        onInteractOutside={() => {
          setIsPinned(false);
          setIsOpen(false);
        }}
      >
        {content}
      </PopoverContent>
    </Popover>
  );
}
