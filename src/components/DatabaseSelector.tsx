"use client";

import { useState, useEffect, useRef } from "react";
import { Database, ChevronDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

interface DbItem {
  name: string;
  tables?: number;
}

interface DatabaseSelectorProps {
  clusterId: string;
  clusterName?: string;
  value: string;
  onSelect: (dbName: string) => void;
  disabled?: boolean;
}

export function DatabaseSelector({
  clusterId,
  clusterName,
  value,
  onSelect,
  disabled,
}: DatabaseSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [databases, setDatabases] = useState<DbItem[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!clusterId) {
      setDatabases([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const params = clusterName ? `?cluster=${encodeURIComponent(clusterName)}` : "";
    fetch(`/api/clusters/${clusterId}/databases${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => setDatabases(data.databases ?? []))
      .catch((err) => { if (err.name !== "AbortError") setDatabases([]); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [clusterId, clusterName]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = databases.filter((db) =>
    db.name.toLowerCase().includes(search.toLowerCase())
  );
  const isDisabled = disabled || !clusterId;

  const handleOpen = () => {
    if (isDisabled) return;
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSelect = (name: string) => {
    onSelect(name);
    setOpen(false);
    setSearch("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect("");
    setSearch("");
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={isDisabled}
        onClick={handleOpen}
        className={[
          "flex items-center gap-2 h-9 px-3 rounded-md border text-sm transition-colors w-full",
          isDisabled
            ? "opacity-50 cursor-not-allowed border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800"
            : "cursor-pointer border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800 hover:border-gray-300 dark:hover:border-slate-600",
          value
            ? "!border-green-200 !bg-green-50/60 text-green-900 dark:!border-green-800 dark:!bg-green-950/30 dark:text-green-100"
            : "text-gray-500 dark:text-gray-400",
        ].join(" ")}
      >
        <Database
          className={`w-4 h-4 flex-shrink-0 ${value ? "text-green-600 dark:text-green-400" : "text-gray-400"}`}
        />
        <span className="flex-1 truncate text-left">
          {value || (clusterId ? "Select database..." : "Select cluster first")}
        </span>
        {value ? (
          <X
            className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            onClick={handleClear}
          />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100 dark:border-slate-700">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <Input
                ref={inputRef}
                placeholder="Search databases..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 pl-10 text-sm focus-visible:ring-1 focus-visible:ring-ring/30"
              />
            </div>
          </div>
          <div className="overflow-y-auto p-1" style={{ maxHeight: 240 }}>
            {loading ? (
              <div className="py-4 text-center text-xs text-gray-500 dark:text-gray-400">
                Loading...
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-4 text-center text-xs text-gray-500 dark:text-gray-400">
                {search ? "No databases match" : "No databases found"}
              </div>
            ) : (
              filtered.map((db) => (
                <button
                  key={db.name}
                  type="button"
                  onClick={() => handleSelect(db.name)}
                  className={[
                    "flex items-center gap-2 w-full px-2 py-1.5 rounded text-left text-sm transition-colors",
                    db.name === value
                      ? "bg-green-50 dark:bg-green-900/30 text-green-900 dark:text-green-100"
                      : "hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-900 dark:text-white",
                  ].join(" ")}
                >
                  <Database className="w-3.5 h-3.5 text-green-600 dark:text-green-500 flex-shrink-0" />
                  <span className="flex-1 truncate">{db.name}</span>
                  {db.tables !== undefined && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                      {db.tables}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
