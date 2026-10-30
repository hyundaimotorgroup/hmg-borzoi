import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ChangeEvent, Ref } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { logger } from "@/lib/utils/logger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SQLEditor, type SQLEditorHandle } from "@/components/SQLEditor";
import {
  PlayCircle,
  Save,
  Download,
  Trash2,
  Clock,
  FileText,
  Copy,
  Pencil,
  CheckCircle,
  XCircle,
  Terminal,
  Server,
  Wand2,
  AlertCircle,
  ChevronDown,
  ScanSearch,
  Plus,
  X,
  Columns3,
  RotateCcw,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { writeTextSafe } from "@/lib/utils/clipboard";
import { useSettings } from "@/contexts/SettingsContext";
import { formatDateWithTimezone } from "@/lib/utils/time-formatter";
import { useNdjsonStream } from "@/lib/hooks/use-ndjson-stream";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { ProcessorProfile } from "@/app/api/clusters/[id]/query-profile/route";
import { createSavedQuerySchema } from "@/lib/validation";

export interface QueryEditorHandle {
  executeWithQuery: (query: string) => void;
}

interface ColumnInfo {
  name: string;
  type: string;
  defaultKind: string;
  defaultExpression: string;
  comment: string;
}

interface TabResult {
  queryResult: QueryResult | null;
  queryError: string | null;
  explainResult: ExplainResult | null;
  explainError: string | null;
  isExplaining: boolean;
  resultTab: 'result' | 'explain' | 'profile' | 'columns';
  profileData: ProcessorProfile[] | null;
  profileError: string | null;
  currentPage: number;
  pageSize: number;
  queryId: string | null;
}

function createEmptyTabResult(): TabResult {
  return {
    queryResult: null,
    queryError: null,
    explainResult: null,
    explainError: null,
    isExplaining: false,
    resultTab: 'result',
    profileData: null,
    profileError: null,
    currentPage: 1,
    pageSize: 100,
    queryId: null,
  };
}

interface QueryTab {
  id: string;
  name: string;
  query: string;
}

interface QueryEditorProps {
  currentUser: string;
  clusterId?: string;
  clusterName?: string;
  initialQuery?: string;
  selectedTable?: { database: string; table: string };
  onReset?: () => void;
  ref?: Ref<QueryEditorHandle>;
}

interface QueryResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  executionTime: number;
  bytesRead: number;
  rowsRead: number;
  limitAdded?: boolean;
  limitValue?: number;
}

interface SavedQuery {
  id: string;
  name: string;
  query: string;
  createdAt: string;
}

type SavedQueryFormValues = {
  name: string;
  query: string;
};

const EXPLAIN_MODES = ['PLAN', 'PIPELINE', 'ESTIMATE', 'QUERY TREE', 'AST', 'SYNTAX'] as const;
type ExplainMode = (typeof EXPLAIN_MODES)[number];

interface ExplainResult {
  mode: ExplainMode;
  lines: string[];
}

const exampleQueries = [
  { name: "Show Databases", query: "SHOW DATABASES" },
  { name: "Show Tables", query: "SHOW TABLES" },
  { name: "Table Schema", query: "DESCRIBE TABLE system.tables" },
  { name: "System Tables Count", query: "SELECT name, total_rows FROM system.tables LIMIT 20" },
  {
    name: "Recent Queries",
query: "SELECT query_id, user, query, query_duration_ms FROM system.query_log WHERE event_date >= toDate(now() - INTERVAL 1 DAY) AND event_time >= now() - INTERVAL 1 HOUR ORDER BY event_time DESC LIMIT 20",
  },
];

function NoClusterNotice() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Server className="w-10 h-10 text-blue-400 mb-4" />
      <p className="text-gray-600 dark:text-gray-400">
        Select a cluster
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
        Select a cluster from the dropdown above to run queries.
      </p>
    </div>
  );
}

function renderCellValue(cell: unknown): string {
  if (cell == null) return "";
  if (typeof cell === "string") return cell;
  if (typeof cell === "number" || typeof cell === "boolean" || typeof cell === "bigint") {
    return String(cell);
  }
  if (cell instanceof Date) {
    return cell.toISOString();
  }
  try {
    return JSON.stringify(cell);
  } catch {
    return String(cell);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSavedQuery(value: unknown): value is SavedQuery {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.query === "string" &&
    typeof value.createdAt === "string"
  );
}

export function QueryEditor({ currentUser: _currentUser, clusterId, clusterName, initialQuery, selectedTable, onReset, ref }: QueryEditorProps) {
  const { generalSettings } = useSettings();
  const timezone = generalSettings.timezone || "UTC";

  // Query tabs
  const queryTabCounterRef = useRef(1);
  const [queryTabs, setQueryTabs] = useState<QueryTab[]>(() => [
    { id: 'qtab-1', name: 'Query 1', query: initialQuery || '' },
  ]);
  const [activeQueryTabId, setActiveQueryTabId] = useState('qtab-1');
  const activeQueryTab = queryTabs.find(t => t.id === activeQueryTabId) ?? queryTabs[0]!;
  const queryText = activeQueryTab.query;

  const setQueryText = useCallback((value: string) => {
    setQueryTabs(prev => prev.map(t => t.id === activeQueryTabId ? { ...t, query: value } : t));
  }, [activeQueryTabId]);

  const addQueryTab = useCallback(() => {
    queryTabCounterRef.current += 1;
    const id = `qtab-${queryTabCounterRef.current}`;
    setQueryTabs(prev => [...prev, { id, name: `Query ${queryTabCounterRef.current}`, query: '' }]);
    setActiveQueryTabId(id);
  }, []);

  // Column info for the selected table
  const [columnInfo, setColumnInfo] = useState<ColumnInfo[]>([]);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);

  // Per-tab result state
  const [tabResults, setTabResults] = useState<Record<string, TabResult>>({ 'qtab-1': createEmptyTabResult() });
  const [streamingTabId, setStreamingTabId] = useState<string | null>(null);
  const streamingTabIdRef = useRef<string | null>(null);

  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [activeTab, setActiveTab] = useState("editor");
  const [deleteQueryId, setDeleteQueryId] = useState<string | null>(null);
  const [editingQueryId, setEditingQueryId] = useState<string | null>(null);
  const [isSavedQueryDialogOpen, setIsSavedQueryDialogOpen] = useState(false);
  const [isSubmittingSavedQuery, setIsSubmittingSavedQuery] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [formatCompleted, setFormatCompleted] = useState(false);
  const [copiedSavedQueryId, setCopiedSavedQueryId] = useState<string | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  const sqlEditorRef = useRef<SQLEditorHandle>(null);

  // Tab result helper
  const setTabResult = useCallback((tabId: string, update: Partial<TabResult>) => {
    setTabResults(prev => ({
      ...prev,
      [tabId]: { ...(prev[tabId] ?? createEmptyTabResult()), ...update },
    }));
  }, []);

  // Derive the active tab's result and create local setters so existing JSX continues to work
  const activeResult = tabResults[activeQueryTabId] ?? createEmptyTabResult();
  const { queryResult, queryError, explainResult, explainError, isExplaining,
          resultTab, profileData, profileError, currentPage, pageSize } = activeResult;

  const setResultTab = (v: 'result' | 'explain' | 'profile' | 'columns') =>
    setTabResult(activeQueryTabId, { resultTab: v });
  const setCurrentPage = (page: number | ((p: number) => number)) => {
    const next = typeof page === 'function' ? page(activeResult.currentPage) : page;
    setTabResult(activeQueryTabId, { currentPage: next });
  };

  // Fetch column info when selectedTable changes
  useEffect(() => {
    if (!selectedTable || !clusterId) {
      setColumnInfo([]);
      return;
    }
    setIsLoadingColumns(true);
    fetch(`/api/clusters/${clusterId}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `DESCRIBE TABLE \`${selectedTable.database}\`.\`${selectedTable.table}\``,
      }),
    })
      .then(r => r.json())
      .then((data: QueryResult) => {
        const nameIdx = data.columns.indexOf('name');
        const typeIdx = data.columns.indexOf('type');
        const defaultKindIdx = data.columns.indexOf('default_type');
        const defaultExprIdx = data.columns.indexOf('default_expression');
        const commentIdx = data.columns.indexOf('comment');
        setColumnInfo(
          data.rows.map((row: unknown[]) => ({
            name: String(row[nameIdx] ?? ''),
            type: String(row[typeIdx] ?? ''),
            defaultKind: String(row[defaultKindIdx] ?? ''),
            defaultExpression: String(row[defaultExprIdx] ?? ''),
            comment: String(row[commentIdx] ?? ''),
          }))
        );
      })
      .catch(() => setColumnInfo([]))
      .finally(() => setIsLoadingColumns(false));
  }, [selectedTable, clusterId]);

  // Track whether a stream result commit is pending
  const pendingResultRef = useRef(false);
  const savedQueryForm = useForm<SavedQueryFormValues>({
    resolver: zodResolver(createSavedQuerySchema),
    defaultValues: {
      name: "",
      query: initialQuery || "",
    },
  });

  const {
    execute: streamExecute,
    cancel: streamCancel,
    isStreaming,
    rows: streamRows,
    meta: streamMeta,
    statistics: streamStats,
    error: streamError,
    progress,
    queryId,
  } = useNdjsonStream();

  const isActiveTabStreaming = isStreaming && streamingTabId === activeQueryTabId;

  const closeQueryTab = useCallback((tabId: string) => {
    setQueryTabs(prev => {
      if (prev.length <= 1) return prev;
      const idx = prev.findIndex(t => t.id === tabId);
      const next = prev.filter(t => t.id !== tabId);
      if (activeQueryTabId === tabId) {
        const newId = (next[idx] ?? next[idx - 1])?.id;
        if (newId) setActiveQueryTabId(newId);
      }
      return next;
    });
    setTabResults(prev => {
      const { [tabId]: _, ...rest } = prev;
      return rest;
    });
    if (streamingTabIdRef.current === tabId) {
      streamCancel();
      streamingTabIdRef.current = null;
      pendingResultRef.current = false;
      setStreamingTabId(null);
    }
  }, [activeQueryTabId, streamCancel]);

  // When streaming completes, commit the result to the tab that initiated the stream
  useEffect(() => {
    if (isStreaming || !pendingResultRef.current) return;
    pendingResultRef.current = false;

    const tabId = streamingTabIdRef.current;
    streamingTabIdRef.current = null;
    setStreamingTabId(null);
    if (!tabId) return;

    if (streamError) {
      setTabResult(tabId, { queryError: streamError });
      toast.error("Query execution failed");
      return;
    }

    const columns = streamMeta.map((m) => m.name);
    const rows = streamRows;
    const result: QueryResult = {
      columns,
      rows,
      rowCount: rows.length,
      executionTime: streamStats?.elapsed ?? 0,
      bytesRead: streamStats?.bytes_read ?? 0,
      rowsRead: streamStats?.rows_read ?? 0,
    };
    setTabResult(tabId, { queryResult: result, currentPage: 1, queryId: queryId ?? null });
    toast.success(`${result.rowCount.toLocaleString()}rows returned`);
  }, [isStreaming, streamError, streamMeta, streamRows, streamStats, queryId, setTabResult]);

  // initialQuery is used only as the initial value at mount time (subsequent dynamic execution is performed via ref.executeWithQuery)

  useEffect(() => {
    const controller = new AbortController();
    const loadSavedQueries = async () => {
      try {
        const res = await fetch('/api/saved-queries', { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          setSavedQueries(data.queries || []);
        }
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        logger.error('Failed to load saved queries:', error);
      }
    };
    loadSavedQueries();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!copiedSavedQueryId) return;
    const timeout = window.setTimeout(() => setCopiedSavedQueryId(null), 2000);
    return () => window.clearTimeout(timeout);
  }, [copiedSavedQueryId]);

  const closeSavedQueryDialog = useCallback(() => {
    setIsSavedQueryDialogOpen(false);
    setEditingQueryId(null);
    savedQueryForm.reset({
      name: "",
      query: queryText.trim(),
    });
  }, [queryText, savedQueryForm]);

  const openCreateSavedQueryDialog = useCallback(() => {
    if (!queryText.trim()) {
      toast.error("Enter a query to save.");
      return;
    }

    setEditingQueryId(null);
    savedQueryForm.reset({
      name: "",
      query: queryText.trim(),
    });
    setIsSavedQueryDialogOpen(true);
  }, [queryText, savedQueryForm]);

  const openEditSavedQueryDialog = useCallback(
    (query: SavedQuery) => {
      setEditingQueryId(query.id);
      savedQueryForm.reset({
        name: query.name,
        query: query.query,
      });
      setIsSavedQueryDialogOpen(true);
    },
    [savedQueryForm]
  );

  const handleQueryTextChange = useCallback((nextValue: string) => {
    setFormatCompleted(false);
    setQueryText(nextValue);
  }, [setQueryText]);

  const executeQuery = useCallback(async (queryOverride?: string, tabIdOverride?: string) => {
    if (!clusterId) {
      toast.error("Select a cluster first.");
      return;
    }

    const selectedText = sqlEditorRef.current?.getSelectedText()?.trim() ?? '';
    const queryToRun = queryOverride || selectedText || queryText.trim();

    if (!queryToRun) {
      toast.error("Enter a query.");
      return;
    }

    const tabId = tabIdOverride ?? activeQueryTabId;
    setTabResult(tabId, {
      queryError: null,
      queryResult: null,
      explainResult: null,
      explainError: null,
      profileData: null,
      profileError: null,
      resultTab: 'result',
    });

    // EXPLAIN does not support streaming, so route through the regular execute endpoint (preserving options such as indexes=1)
    if (/^EXPLAIN\b/i.test(queryToRun)) {
      try {
        const res = await fetch(`/api/clusters/${clusterId}/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: queryToRun }),
        });
        const data = await res.json() as QueryResult & { error?: string };
        if (!res.ok) {
          setTabResult(tabId, { queryError: data.error ?? 'Query execution failed' });
          toast.error(data.error ?? 'Query execution failed');
          return;
        }
        setTabResult(tabId, { queryResult: data });
        toast.success(`${data.rowCount.toLocaleString()}rows returned`);
      } catch {
        const msg = 'Network error.';
        setTabResult(tabId, { queryError: msg });
        toast.error(msg);
      }
      return;
    }

    streamingTabIdRef.current = tabId;
    setStreamingTabId(tabId);
    pendingResultRef.current = true;
    await streamExecute(`/api/clusters/${clusterId}/execute/stream`, { query: queryToRun });
  }, [clusterId, queryText, streamExecute, activeQueryTabId, setTabResult]);

  useImperativeHandle(ref, () => ({
    executeWithQuery: (query: string) => {
      queryTabCounterRef.current += 1;
      const newId = `qtab-${queryTabCounterRef.current}`;
      setQueryTabs(prev => [...prev, { id: newId, name: `Query ${queryTabCounterRef.current}`, query }]);
      setActiveQueryTabId(newId);
      void executeQuery(query, newId);
    },
  }), [executeQuery]);

  const submitSavedQuery = savedQueryForm.handleSubmit(async (values) => {
    setIsSubmittingSavedQuery(true);
    try {
      const isEditing = editingQueryId !== null;
      const res = await fetch(isEditing ? `/api/saved-queries/${editingQueryId}` : "/api/saved-queries", {
        method: isEditing ? "PUT" : "POST",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });

      const payload: unknown = await res.json();

      if (res.ok) {
        if (!isSavedQuery(payload)) {
          throw new Error("Invalid response format.");
        }

        const nextQuery = payload;
        setSavedQueries((prev) =>
          isEditing
            ? prev.map((query) => (query.id === nextQuery.id ? nextQuery : query))
            : [nextQuery, ...prev]
        );
        if (!isEditing) {
          setQueryText(nextQuery.query);
        }
        toast.success(isEditing ? "Saved query updated." : "Query saved.");
        closeSavedQueryDialog();
      } else {
        if (isRecord(payload) && isRecord(payload.fieldErrors)) {
          for (const [field, messages] of Object.entries(payload.fieldErrors)) {
            if ((field === "name" || field === "query") && Array.isArray(messages) && messages[0]) {
              savedQueryForm.setError(field, { type: "server", message: String(messages[0]) });
            }
          }
        }
        const errorMessage =
          isRecord(payload) && typeof payload.error === "string"
            ? payload.error
            : isEditing
              ? "Failed to update query."
              : "Failed to save query.";
        toast.error(errorMessage);
      }
    } catch (error) {
      logger.error("Failed to submit saved query:", error);
      toast.error("Network error.");
    } finally {
      setIsSubmittingSavedQuery(false);
    }
  });

  const loadQuery = (query: SavedQuery) => {
    setQueryText(query.query);
    setFormatCompleted(false);
    setActiveTab("editor");
    toast.success("Query loaded.");
  };

  const deleteQuery = (id: string) => {
    setDeleteQueryId(id);
  };

  const confirmDeleteQuery = async () => {
    if (!deleteQueryId) return;
    const id = deleteQueryId;
    setDeleteQueryId(null);

    try {
      const res = await fetch(`/api/saved-queries/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setSavedQueries(savedQueries.filter((q) => q.id !== id));
        toast.success("Query deleted.");
      } else {
        const error = await res.json();
        toast.error(error.error || "Failed to delete query.");
      }
    } catch (_error) {
      toast.error("Network error.");
    }
  };

  const insertExample = (example: string) => {
    setQueryText(example);
    setFormatCompleted(false);
    setActiveTab("editor");
  };

  const exportResults = () => {
    if (!queryResult) return;
    const csv = [
      queryResult.columns.join(","),
      ...queryResult.rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "query_results.csv";
    a.click();
    toast.success("Exported as CSV.");
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatQuery = useCallback(async () => {
    if (!queryText.trim()) {
      toast.error("Enter a query to format.");
      return;
    }
    setIsFormatting(true);
    try {
      const { format } = await import("sql-formatter");
      const formatted = format(queryText, {
        language: "sql",
        tabWidth: 2,
        keywordCase: "upper",
        linesBetweenQueries: 2,
      });
      setQueryText(formatted);
      setFormatCompleted(true);
      toast.success("Query formatted");
    } catch (_error) {
      toast.error("Query formatting failed");
    } finally {
      setIsFormatting(false);
    }
  }, [queryText, setQueryText]);

  const runExplain = useCallback(async (mode: ExplainMode) => {
    if (!clusterId) {
      toast.error("Select a cluster first.");
      return;
    }
    const selectedText = sqlEditorRef.current?.getSelectedText()?.trim() ?? '';
    const queryToExplain = selectedText || queryText.trim();
    if (!queryToExplain) {
      toast.error("Enter a query to analyze.");
      return;
    }
    const tabId = activeQueryTabId;
    setTabResult(tabId, { isExplaining: true, explainResult: null, explainError: null, resultTab: 'explain' });
    try {
      const res = await fetch(`/api/clusters/${clusterId}/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: queryToExplain, mode }),
      });
      const data = await res.json() as { mode?: ExplainMode; lines?: string[]; error?: string };
      if (!res.ok) {
        setTabResult(tabId, { explainError: data.error ?? "EXPLAIN failed" });
        toast.error(data.error ?? "EXPLAIN failed");
        return;
      }
      if (!data.lines || data.lines.length === 0) {
        setTabResult(tabId, { explainError: "EXPLAIN returned no results." });
        return;
      }
      setTabResult(tabId, { explainResult: { mode: data.mode!, lines: data.lines } });
    } catch {
      const msg = "Network error.";
      setTabResult(tabId, { explainError: msg });
      toast.error(msg);
    } finally {
      setTabResult(tabId, { isExplaining: false });
    }
  }, [clusterId, queryText, activeQueryTabId, setTabResult]);

  const loadProfile = useCallback(async () => {
    const tabQueryId = activeResult.queryId;
    if (!tabQueryId || !clusterId) return;
    const tabId = activeQueryTabId;
    setIsLoadingProfile(true);
    setTabResult(tabId, { profileError: null });
    try {
      const res = await fetch(`/api/clusters/${clusterId}/query-profile?query_id=${tabQueryId}`);
      const data = await res.json() as {
        profiles?: ProcessorProfile[];
        error?: string;
        diagnostic?: { log_processors_profiles: string; hint: string; recent_query_ids: { query_id: string; last_seen: string }[] };
      };
      if (!res.ok) {
        setTabResult(tabId, { profileError: data.error ?? 'Failed to load profile' });
        return;
      }
      if (!data.profiles || data.profiles.length === 0) {
        const hint = data.diagnostic?.hint ?? 'No profile data found.';
        const setting = data.diagnostic?.log_processors_profiles;
        setTabResult(tabId, {
          profileError: `${hint}${setting !== undefined ? ` (log_processors_profiles=${setting})` : ''}\n\nquery_id: ${tabQueryId}`,
        });
        return;
      }
      setTabResult(tabId, { profileData: data.profiles });
    } catch {
      setTabResult(tabId, { profileError: 'Network error. Please try again.' });
    } finally {
      setIsLoadingProfile(false);
    }
  }, [activeResult.queryId, activeQueryTabId, clusterId, setTabResult]);

  const handlePageSizeChange = useCallback((e: ChangeEvent<HTMLSelectElement>) => {
    setTabResult(activeQueryTabId, { pageSize: Number(e.target.value), currentPage: 1 });
  }, [activeQueryTabId, setTabResult]);

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="editor">
            <Terminal className="w-4 h-4 mr-2" />
            Query Editor
          </TabsTrigger>
          <TabsTrigger value="saved">
            <Save className="w-4 h-4 mr-2" />
            Saved Queries
          </TabsTrigger>
          <TabsTrigger value="examples">
            <FileText className="w-4 h-4 mr-2" />
            Examples
          </TabsTrigger>
        </TabsList>

        {/* Query Editor Tab */}
        <TabsContent value="editor" className="space-y-4">
          <Card>
            <CardHeader className="pb-0">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="text-base">SQL Query</CardTitle>
                </div>
                <div className="flex gap-2">
                  {onReset && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={onReset}
                      title="Reset"
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Reset
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={formatQuery}
                    disabled={!queryText.trim() || isFormatting}
                    title="Format SQL (Ctrl+Shift+F)"
                  >
                    <Wand2 className="w-4 h-4 mr-2" />
                    {isFormatting ? "Formatting..." : formatCompleted ? "Formatted" : "Format"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={openCreateSavedQueryDialog}
                    disabled={!queryText.trim()}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!clusterId || !queryText.trim() || isExplaining || isActiveTabStreaming}
                      >
                        <ScanSearch className="w-4 h-4 mr-2" />
                        {isExplaining ? "Analyzing..." : "Explain"}
                        <ChevronDown className="w-3 h-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {EXPLAIN_MODES.map((mode) => (
                        <DropdownMenuItem
                          key={mode}
                          onClick={() => void runExplain(mode)}
                        >
                          {mode}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {isActiveTabStreaming ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={streamCancel}
                      className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Cancel
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => void executeQuery()}
                      disabled={!clusterId}
                      className="bg-gray-900 hover:bg-gray-800 disabled:opacity-50"
                    >
                      <PlayCircle className="w-4 h-4 mr-2" />
                      Execute
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            {/* Query Tab Bar */}
            {clusterId && (
              <div className="flex items-stretch overflow-x-auto border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900">
                {queryTabs.map(tab => {
                  const isActive = tab.id === activeQueryTabId;
                  return (
                    <div
                      key={tab.id}
                      className={`flex items-center gap-1 px-3 flex-shrink-0 border-t-2 transition-colors ${
                        isActive
                          ? 'border-t-gray-900 dark:border-t-gray-100 border-x border-x-gray-200 dark:border-x-gray-700 text-gray-900 dark:text-gray-100'
                          : 'border-t-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 cursor-pointer'
                      }`}
                      style={{ paddingTop: 3, paddingBottom: 3 }}
                    >
                      <button
                        type="button"
                        onClick={() => setActiveQueryTabId(tab.id)}
                        className="text-xs whitespace-nowrap"
                      >
                        {tab.name}
                      </button>
                      {queryTabs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => closeQueryTab(tab.id)}
                          className="flex h-4 w-4 items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-500 dark:hover:text-gray-200 dark:hover:bg-slate-700 transition-colors"
                          title="Close tab"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
                <button
                  type="button"
                  onClick={addQueryTab}
                  className="mx-2 my-auto flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-600 dark:hover:text-gray-300"
                  title="New tab"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <CardContent className="pt-0">
              {!clusterId ? (
                <NoClusterNotice />
              ) : (
                <SQLEditor
                  ref={sqlEditorRef}
                  value={queryText}
                  onChange={handleQueryTextChange}
                  height="320px"
                  clusterId={clusterId}
                  clusterName={clusterName}
                  onExecute={() => {
                    void executeQuery();
                  }}
                  onFormat={() => {
                    void formatQuery();
                  }}
                />
              )}
            </CardContent>
          </Card>

          {/* Shortcut hint cards — shown when cluster is selected but no results yet */}
          {clusterId && !isActiveTabStreaming && !queryResult && !queryError && !explainResult && !explainError && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 dark:bg-slate-800">
                  <PlayCircle className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-gray-900 dark:text-gray-100">Run</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Runs only the selected text if a selection exists.
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    <kbd className="inline-flex items-center rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-gray-700 dark:text-gray-300">
                      Ctrl/Cmd
                    </kbd>
                    <span className="text-[10px] text-gray-400">+</span>
                    <kbd className="inline-flex items-center rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-gray-700 dark:text-gray-300">
                      Enter
                    </kbd>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 dark:bg-slate-800">
                  <Wand2 className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-gray-900 dark:text-gray-100">Format</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Automatically formats and indents SQL.
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    <kbd className="inline-flex items-center rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-gray-700 dark:text-gray-300">
                      Ctrl/Cmd
                    </kbd>
                    <span className="text-[10px] text-gray-400">+</span>
                    <kbd className="inline-flex items-center rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-gray-700 dark:text-gray-300">
                      Shift
                    </kbd>
                    <span className="text-[10px] text-gray-400">+</span>
                    <kbd className="inline-flex items-center rounded border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-gray-700 dark:text-gray-300">
                      F
                    </kbd>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 dark:bg-slate-800">
                  <ScanSearch className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-gray-900 dark:text-gray-100">Explain</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Analyzes the query execution plan. Supports selection.
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {(['PLAN', 'PIPELINE', 'ESTIMATE', 'QUERY TREE', 'AST', 'SYNTAX'] as const).map((m) => (
                      <span
                        key={m}
                        className="inline-flex items-center rounded bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 text-[10px] text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-600/20"
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Unified Result Panel */}
          {(isActiveTabStreaming || queryResult || queryError || explainResult || explainError || columnInfo.length > 0 || isLoadingColumns) && (
            <Card>
              <Tabs value={resultTab} onValueChange={(v) => setResultTab(v as 'result' | 'explain' | 'profile' | 'columns')}>
                <CardHeader className="pb-2 border-b dark:border-gray-700">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <TabsList>
                      <TabsTrigger value="result" className="gap-1.5">
                        <Terminal className="w-3.5 h-3.5" />
                        Result
                        {queryResult && (
                          <span className="text-xs text-muted-foreground ml-0.5">
                            ({queryResult.rowCount.toLocaleString()})
                          </span>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="explain" disabled={!explainResult && !explainError} className="gap-1.5">
                        <ScanSearch className="w-3.5 h-3.5" />
                        Explain
                        {explainResult && (
                          <span className="inline-flex items-center rounded bg-blue-50 dark:bg-blue-950 px-1.5 py-0.5 text-xs text-blue-700 dark:text-blue-300 ring-1 ring-inset ring-blue-600/20 ml-0.5">
                            {explainResult.mode}
                          </span>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="profile" disabled={!activeResult.queryId} className="gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        Profile
                        {profileData && (
                          <span className="inline-flex items-center rounded bg-violet-50 dark:bg-violet-950 px-1.5 py-0.5 text-xs text-violet-700 dark:text-violet-300 ring-1 ring-inset ring-violet-600/20 ml-0.5">
                            {profileData.length}
                          </span>
                        )}
                      </TabsTrigger>
                      <TabsTrigger value="columns" disabled={!selectedTable} className="gap-1.5">
                        <Columns3 className="w-3.5 h-3.5" />
                        Columns
                        {columnInfo.length > 0 && (
                          <span className="text-xs text-muted-foreground ml-0.5">
                            ({columnInfo.length})
                          </span>
                        )}
                      </TabsTrigger>
                    </TabsList>

                    <div className="flex items-center gap-2">
                      {resultTab === 'result' && queryResult && (
                        <>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" />
                              {queryResult.executionTime.toFixed(3)}s
                            </span>
                            <span>{queryResult.rowsRead.toLocaleString()} rows read</span>
                            <span>{formatBytes(queryResult.bytesRead)}</span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={exportResults}
                            disabled={queryResult.rows.length === 0}
                          >
                            <Download className="w-3.5 h-3.5 mr-1.5" />
                            Export CSV
                          </Button>
                        </>
                      )}
                      {resultTab === 'explain' && explainResult && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            const text = explainResult.lines.join('\n');
                            const copied = await writeTextSafe(text);
                            if (copied) toast.success("Copied to clipboard.");
                            else toast.error("Clipboard access denied.");
                          }}
                        >
                          <Copy className="w-3.5 h-3.5 mr-1" />
                          Copy
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-4">
                  <TabsContent value="result" className="mt-0 space-y-3">
                    {isActiveTabStreaming && (
                      <div className="flex items-center justify-center gap-2 py-10">
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-gray-900 rounded-full animate-spin" />
                        <span className="text-sm text-muted-foreground">Running query...</span>
                        {progress > 0 && (
                          <span className="text-xs text-muted-foreground">
                            ({progress.toLocaleString()} rows received)
                          </span>
                        )}
                      </div>
                    )}

                    {queryError && !isActiveTabStreaming && (
                      <div className="rounded-lg border-2 border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/60">
                        <div className="flex items-center gap-2 px-4 py-3 border-b border-red-200 dark:border-red-800">
                          <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                          <h4 className="text-red-800 dark:text-red-300 text-sm">Query Error</h4>
                        </div>
                        <pre className="px-4 py-3 text-sm text-red-900 dark:text-red-300 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto max-h-60 overflow-y-auto">
                          {queryError}
                        </pre>
                      </div>
                    )}

                    {queryResult && !isActiveTabStreaming && (
                      <>
                        {queryResult.limitAdded && (
                          <div className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800">
                            <AlertCircle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-yellow-900 dark:text-yellow-300">
                              No LIMIT clause found — LIMIT {queryResult.limitValue?.toLocaleString()} was applied automatically.
                            </p>
                          </div>
                        )}

                        {queryResult.columns.length === 0 ? (
                          <div className="flex items-center gap-2 py-8 justify-center text-green-700 dark:text-green-400">
                            <CheckCircle className="w-4 h-4" />
                            <p className="text-sm">Query successful — no rows returned (DDL command)</p>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5" />
                                Query Successful — {queryResult.rowCount.toLocaleString()} rows
                              </span>
                              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                <span className="text-xs">Rows per page:</span>
                                <select
                                  value={pageSize}
                                  onChange={handlePageSizeChange}
                                  className="border rounded px-2 py-1 text-xs dark:bg-slate-800 dark:border-gray-600"
                                >
                                  <option value={50}>50</option>
                                  <option value={100}>100</option>
                                  <option value={200}>200</option>
                                  <option value={500}>500</option>
                                </select>
                              </div>
                            </div>
                            <div className="overflow-x-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    {queryResult.columns.map((col) => (
                                      <TableHead key={col}>{col}</TableHead>
                                    ))}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {queryResult.rows
                                    .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                                    .map((row, rowIdx) => (
                                      <TableRow key={rowIdx}>
                                        {row.map((cell, cellIdx) => (
                                          <TableCell key={cellIdx} className="font-mono text-xs">
                                            {renderCellValue(cell)}
                                          </TableCell>
                                        ))}
                                      </TableRow>
                                    ))}
                                </TableBody>
                              </Table>
                            </div>

                            {queryResult.rows.length > pageSize && (
                              <div className="flex items-center justify-between pt-4 border-t dark:border-gray-700">
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                  Showing {(currentPage - 1) * pageSize + 1}–
                                  {Math.min(currentPage * pageSize, queryResult.rows.length)} of{" "}
                                  {queryResult.rows.length.toLocaleString()} rows
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(1)} disabled={currentPage === 1}>First</Button>
                                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>Previous</Button>
                                  <span className="text-sm text-gray-600 dark:text-gray-400 px-3">
                                    Page {currentPage} of {Math.ceil(queryResult.rows.length / pageSize)}
                                  </span>
                                  <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(Math.ceil(queryResult.rows.length / pageSize), p + 1))} disabled={currentPage >= Math.ceil(queryResult.rows.length / pageSize)}>Next</Button>
                                  <Button variant="outline" size="sm" onClick={() => setCurrentPage(Math.ceil(queryResult.rows.length / pageSize))} disabled={currentPage >= Math.ceil(queryResult.rows.length / pageSize)}>Last</Button>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </TabsContent>

                  <TabsContent value="explain" className="mt-0">
                    {isExplaining && (
                      <div className="flex items-center justify-center gap-2 py-10">
                        <div className="w-4 h-4 border-2 border-gray-400 border-t-gray-900 rounded-full animate-spin" />
                        <span className="text-sm text-muted-foreground">Analyzing...</span>
                      </div>
                    )}
                    {explainError && !isExplaining && (
                      <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                        <XCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <h4 className="text-red-900 dark:text-red-300">Explain Error</h4>
                          <pre className="text-sm text-red-800 dark:text-red-400 mt-1 whitespace-pre-wrap font-mono">
                            {explainError}
                          </pre>
                        </div>
                      </div>
                    )}
                    {explainResult && !isExplaining && (
                      <pre className="text-xs font-mono bg-gray-50 dark:bg-slate-900 text-gray-800 dark:text-gray-200 p-4 rounded-lg overflow-x-auto whitespace-pre leading-relaxed">
                        {explainResult.lines.join('\n')}
                      </pre>
                    )}
                  </TabsContent>

                  <TabsContent value="profile" className="mt-0">
                    {!profileData && !profileError && (
                      <div className="flex flex-col items-center justify-center py-12 gap-3">
                        <p className="text-sm text-muted-foreground text-center">
                          View per-processor execution time after running a query.
                          <br />
                          <span className="text-xs text-muted-foreground/70">
                            Based on ClickHouse&apos;s <code className="font-mono">system.processors_profile_log</code>
                          </span>
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void loadProfile()}
                          disabled={isLoadingProfile || !activeResult.queryId}
                        >
                          {isLoadingProfile ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-gray-900 rounded-full animate-spin mr-2" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <Clock className="w-3.5 h-3.5 mr-2" />
                              Load Profile
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    {profileError && !isLoadingProfile && (
                      <div className="space-y-3">
                        <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800">
                          <XCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <h4 className="text-red-900 dark:text-red-300">Profile Error</h4>
                            <p className="text-sm text-red-800 dark:text-red-400 mt-1">{profileError}</p>
                          </div>
                        </div>
                        <div className="flex justify-center">
                          <Button variant="outline" size="sm" onClick={() => void loadProfile()} disabled={isLoadingProfile}>
                            <Clock className="w-3.5 h-3.5 mr-2" />
                            Retry
                          </Button>
                        </div>
                      </div>
                    )}

                    {profileData && !isLoadingProfile && (() => {
                      const totalUs = profileData.reduce((s, p) => s + p.elapsed_us, 0);
                      const chartData = [...profileData]
                        .slice(0, 20)
                        .reverse()
                        .map((p) => ({
                          name: p.name,
                          active: Math.round(p.elapsed_us / 100) / 10,
                          inputWait: Math.round(p.input_wait_us / 100) / 10,
                          outputWait: Math.round(p.output_wait_us / 100) / 10,
                          inputRows: p.input_rows,
                          outputRows: p.output_rows,
                          calls: p.calls,
                          pct: totalUs > 0 ? ((p.elapsed_us / totalUs) * 100).toFixed(1) : '0',
                        }));

                      return (
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">
                              Top {chartData.length} processors · {profileData.length} total
                              {profileData.length > 20 && ' (top 20 shown)'}
                            </p>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void loadProfile()}
                              disabled={isLoadingProfile}
                            >
                              Refresh
                            </Button>
                          </div>
                          <ResponsiveContainer width="100%" height={Math.max(260, chartData.length * 42)}>
                            <BarChart
                              data={chartData}
                              layout="vertical"
                              margin={{ top: 4, right: 48, left: 0, bottom: 4 }}
                            >
                              <XAxis
                                type="number"
                                unit="ms"
                                tick={{ fontSize: 11 }}
                                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${v}ms`}
                              />
                              <YAxis
                                type="category"
                                dataKey="name"
                                width={220}
                                tick={{ fontSize: 10, fontFamily: 'monospace' }}
                              />
                              <Tooltip
                                formatter={(value: number | undefined, name: string | undefined) => {
                                  const label = name === 'active' ? 'Active' : name === 'inputWait' ? 'Input wait' : 'Output wait';
                                  return [`${(value ?? 0).toFixed(2)} ms`, label];
                                }}
                                content={({ active, payload, label }) => {
                                  if (!active || !payload?.length) return null;
                                  const entry = chartData.find(d => d.name === label);
                                  return (
                                    <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-xs shadow-lg max-w-xs">
                                      <p className="font-mono mb-2 text-gray-900 dark:text-gray-100 break-all">{label}</p>
                                      {payload.map((p) => (
                                        <div key={p.name} className="flex justify-between gap-4">
                                          <span style={{ color: p.color }}>{p.name === 'active' ? 'Active' : p.name === 'inputWait' ? 'Input wait' : 'Output wait'}</span>
                                          <span className="font-mono">{Number(p.value).toFixed(2)} ms</span>
                                        </div>
                                      ))}
                                      {entry && (
                                        <div className="mt-2 pt-2 border-t dark:border-gray-600 text-muted-foreground space-y-0.5">
                                          <div className="flex justify-between gap-4">
                                            <span>Input rows</span>
                                            <span className="font-mono">{entry.inputRows.toLocaleString()}</span>
                                          </div>
                                          <div className="flex justify-between gap-4">
                                            <span>Output rows</span>
                                            <span className="font-mono">{entry.outputRows.toLocaleString()}</span>
                                          </div>
                                          <div className="flex justify-between gap-4">
                                            <span>Calls</span>
                                            <span className="font-mono">{entry.calls.toLocaleString()}</span>
                                          </div>
                                          <div className="flex justify-between gap-4">
                                            <span>Share</span>
                                            <span className="font-mono">{entry.pct}%</span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                }}
                              />
                              <Legend
                                formatter={(value) =>
                                  value === 'active' ? 'Active' : value === 'inputWait' ? 'Input wait' : 'Output wait'
                                }
                              />
                              <Bar dataKey="active" name="active" stackId="a" fill="#3b82f6" />
                              <Bar dataKey="inputWait" name="inputWait" stackId="a" fill="#f59e0b" />
                              <Bar dataKey="outputWait" name="outputWait" stackId="a" fill="#ef4444" radius={[0, 2, 2, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      );
                    })()}
                  </TabsContent>

                  <TabsContent value="columns" className="mt-0">
                    {isLoadingColumns ? (
                      <div className="flex items-center justify-center py-10 text-sm text-gray-500 dark:text-gray-400">
                        Loading columns...
                      </div>
                    ) : columnInfo.length === 0 ? (
                      <div className="flex items-center justify-center py-10 text-sm text-gray-500 dark:text-gray-400">
                        No column info available
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-800">
                              <th className="text-left px-3 py-2 text-gray-600 dark:text-gray-400">#</th>
                              <th className="text-left px-3 py-2 text-gray-600 dark:text-gray-400">Name</th>
                              <th className="text-left px-3 py-2 text-gray-600 dark:text-gray-400">Type</th>
                              <th className="text-left px-3 py-2 text-gray-600 dark:text-gray-400">Default</th>
                              <th className="text-left px-3 py-2 text-gray-600 dark:text-gray-400">Comment</th>
                            </tr>
                          </thead>
                          <tbody>
                            {columnInfo.map((col, i) => (
                              <tr
                                key={col.name}
                                className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-slate-800/50"
                              >
                                <td className="px-3 py-1.5 text-gray-400 dark:text-gray-500">{i + 1}</td>
                                <td className="px-3 py-1.5 text-gray-900 dark:text-gray-100 font-mono">{col.name}</td>
                                <td className="px-3 py-1.5 text-blue-600 dark:text-blue-400 font-mono">{col.type}</td>
                                <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 font-mono">
                                  {col.defaultKind && col.defaultExpression
                                    ? `${col.defaultKind} ${col.defaultExpression}`
                                    : col.defaultExpression || '—'}
                                </td>
                                <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{col.comment || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </TabsContent>
                </CardContent>
              </Tabs>
            </Card>
          )}
        </TabsContent>

        {/* Saved Queries Tab */}
        <TabsContent value="saved" className="space-y-4">
          {savedQueries.length === 0 ? (
            <div className="text-center py-16 text-gray-500 dark:text-gray-400">
              <Save className="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-sm">No saved queries.</p>
              <p className="text-xs mt-1 text-gray-400">
                Write a query in the editor and click Save to store it.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {savedQueries.map((query) => (
                <Card key={query.id}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg dark:text-white mb-2">
                          {query.name}
                        </h3>
                        <pre className="text-xs font-mono bg-gray-50 dark:bg-slate-800 dark:text-gray-300 p-3 rounded-lg overflow-x-auto mb-2">
                          {query.query}
                        </pre>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Saved: {formatDateWithTimezone(query.createdAt, timezone, {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => loadQuery(query)}
                        >
                          <PlayCircle className="w-3.5 h-3.5 mr-1" />
                          Load
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditSavedQueryDialog(query)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            const copied = await writeTextSafe(query.query);
                            if (copied) {
                              setCopiedSavedQueryId(query.id);
                              toast.success("Copied to clipboard.");
                              return;
                            }
                            toast.error("Clipboard access denied.");
                          }}
                        >
                          {copiedSavedQueryId === query.id ? (
                            <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() => deleteQuery(query.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Database Explorer Tab */}
        {/* Examples Tab */}
        <TabsContent value="examples" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base dark:text-white">
                Query Examples
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {exampleQueries.map((example) => (
                  <button
                    key={example.name}
                    type="button"
                    className="p-4 border rounded-lg hover:border-gray-900 dark:hover:border-gray-400 transition-colors dark:border-gray-700 text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-slate-400"
                    onClick={() => insertExample(example.query)}
                  >
                    <h4 className="text-sm mb-2 dark:text-white">
                      {example.name}
                    </h4>
                    <pre className="text-xs font-mono text-gray-600 dark:text-gray-400">
                      {example.query}
                    </pre>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base dark:text-white">
                Advanced Query Examples
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-sm dark:text-white">
                  Aggregation with GROUP BY
                </h4>
                <pre className="text-xs font-mono bg-gray-50 dark:bg-slate-800 dark:text-gray-300 p-3 rounded-lg overflow-x-auto">
                  {`SELECT
    toDate(event_time) as date,
    COUNT(*) as events,
    uniq(user) as unique_users
FROM system.query_log
WHERE event_date >= today() - 7
GROUP BY date
ORDER BY date DESC`}
                </pre>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm dark:text-white">
                  Top Queries by Duration
                </h4>
                <pre className="text-xs font-mono bg-gray-50 dark:bg-slate-800 dark:text-gray-300 p-3 rounded-lg overflow-x-auto">
                  {`SELECT
    user,
    query,
    query_duration_ms,
    read_rows,
    read_bytes
FROM system.query_log
WHERE event_date >= toDate(now() - INTERVAL 1 DAY)
  AND type = 'QueryFinish'
  AND event_time >= now() - INTERVAL 1 HOUR
ORDER BY query_duration_ms DESC
LIMIT 10`}
                </pre>
              </div>

              <div className="space-y-2">
                <h4 className="text-sm dark:text-white">
                  Table Storage Stats
                </h4>
                <pre className="text-xs font-mono bg-gray-50 dark:bg-slate-800 dark:text-gray-300 p-3 rounded-lg overflow-x-auto">
                  {`SELECT
    database,
    table,
    formatReadableSize(sum(bytes_on_disk)) AS size,
    sum(rows) AS total_rows,
    count() AS parts
FROM system.parts
WHERE active
GROUP BY database, table
ORDER BY sum(bytes_on_disk) DESC
LIMIT 20`}
                </pre>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isSavedQueryDialogOpen} onOpenChange={(open) => !open && closeSavedQueryDialog()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingQueryId ? "Edit saved query" : "Save query"}</DialogTitle>
            <DialogDescription>
              Review the query name and body, then save.
            </DialogDescription>
          </DialogHeader>
          <Form {...savedQueryForm}>
            <form onSubmit={submitSavedQuery} className="space-y-4">
              <FormField
                control={savedQueryForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Query name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g. Slow queries in the last 1 hour"
                        disabled={isSubmittingSavedQuery}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={savedQueryForm.control}
                name="query"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Query</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={10}
                        className="font-mono text-xs"
                        placeholder="SELECT * FROM system.query_log LIMIT 10"
                        disabled={isSubmittingSavedQuery}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeSavedQueryDialog}
                  disabled={isSubmittingSavedQuery}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmittingSavedQuery}>
                  <Save className="w-4 h-4 mr-2" />
                  {isSubmittingSavedQuery
                    ? "Saving..."
                    : editingQueryId
                      ? "Update"
                      : "Save"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteQueryId !== null} onOpenChange={(open) => !open && setDeleteQueryId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete query</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this saved query? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteQueryId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmDeleteQuery()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
