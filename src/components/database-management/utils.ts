import { Network, Cpu, Eye, Copy, RefreshCw, BarChart2, TrendingUp, Table } from "lucide-react";
import type { TableType } from "./types";

export function getTableType(engine: string): TableType {
  if (engine.includes("Distributed")) return "Distributed";
  if (engine.includes("MaterializedView")) return "MaterializedView";
  if (engine.includes("View")) return "View";
  if (engine.includes("ReplicatedMergeTree")) return "ReplicatedMergeTree";
  if (engine.includes("ReplacingMergeTree")) return "ReplacingMergeTree";
  if (engine.includes("AggregatingMergeTree")) return "AggregatingMergeTree";
  if (engine.includes("SummingMergeTree")) return "SummingMergeTree";
  return "MergeTree";
}

export function formatNumber(num: number | string | null | undefined): string {
  if (num === null || num === undefined || num === "") return "0";
  const n = typeof num === "string" ? parseInt(num) : num;
  if (isNaN(n)) return "0";
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toString();
}

export function formatBytes(bytes: number | string | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes === "") return "0 B";
  const value = typeof bytes === "string" ? parseInt(bytes, 10) : bytes;
  if (!Number.isFinite(value) || value <= 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const fractionDigits = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

export function formatDDL(ddl: string): string {
  if (!ddl) return "";

  let formatted = ddl;

  const keywords = [
    "CREATE TABLE",
    "ENGINE =",
    "PARTITION BY",
    "ORDER BY",
    "PRIMARY KEY",
    "SETTINGS",
    "SAMPLE BY",
    "TTL",
    "CODEC",
    "AS SELECT",
    "MATERIALIZED VIEW",
    "VIEW",
    "DISTRIBUTED",
  ];

  keywords.forEach((keyword) => {
    const regex = new RegExp(`\\s+(${keyword})`, "gi");
    formatted = formatted.replace(regex, "\n$1");
  });

  formatted = formatted.replace(/\(\s*/g, "(\n  ");
  formatted = formatted.replace(/\s*\)/g, "\n)");
  formatted = formatted.replace(/,\s*(?=[a-zA-Z_`])/g, ",\n  ");
  formatted = formatted.replace(/\nENGINE/g, "\nENGINE");
  formatted = formatted.replace(/\nPARTITION BY/g, "\nPARTITION BY");
  formatted = formatted.replace(/\nORDER BY/g, "\nORDER BY");
  formatted = formatted.replace(/\nPRIMARY KEY/g, "\nPRIMARY KEY");
  formatted = formatted.replace(/\nSETTINGS/g, "\nSETTINGS");
  formatted = formatted.replace(/\n{3,}/g, "\n\n");
  formatted = formatted.trim();

  return formatted;
}

export function getTableTypeIcon(tableType: TableType) {
  switch (tableType) {
    case "Distributed":
      return { icon: Network, color: "text-purple-600", bgColor: "bg-purple-50" };
    case "MaterializedView":
      return { icon: Cpu, color: "text-amber-600", bgColor: "bg-amber-50" };
    case "View":
      return { icon: Eye, color: "text-cyan-600", bgColor: "bg-cyan-50" };
    case "ReplicatedMergeTree":
      return { icon: Copy, color: "text-blue-600", bgColor: "bg-blue-50" };
    case "ReplacingMergeTree":
      return { icon: RefreshCw, color: "text-green-600", bgColor: "bg-green-50" };
    case "AggregatingMergeTree":
      return { icon: BarChart2, color: "text-indigo-600", bgColor: "bg-indigo-50" };
    case "SummingMergeTree":
      return { icon: TrendingUp, color: "text-rose-600", bgColor: "bg-rose-50" };
    default:
      return { icon: Table, color: "text-gray-600", bgColor: "bg-gray-50" };
  }
}

export function getTableTypeBadgeVariant(
  tableType: TableType
): "default" | "secondary" | "outline" {
  if (tableType === "Distributed") return "default";
  if (tableType === "MaterializedView" || tableType === "View") return "outline";
  return "secondary";
}

export function isLogicalObjectTableType(tableType: TableType): boolean {
  return (
    tableType === "Distributed" ||
    tableType === "View" ||
    tableType === "MaterializedView"
  );
}
