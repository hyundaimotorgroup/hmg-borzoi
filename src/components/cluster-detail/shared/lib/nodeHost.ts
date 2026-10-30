import type { ClusterWithMetrics } from "@/lib/services/cluster.service";

export type NodeNameResolver = (hostname?: string | null) => string;

const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const BRACKETED_IPV6_PATTERN = /^\[[0-9a-fA-F:]+\](?::\d+)?$/;
const RAW_IPV6_PATTERN = /:/;

function stripBrackets(value: string): string {
  if (value.startsWith("[") && value.endsWith("]")) {
    return value.slice(1, -1);
  }

  return value;
}

function stripHostPort(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  if (BRACKETED_IPV6_PATTERN.test(trimmed)) {
    const closingIndex = trimmed.indexOf("]");
    return stripBrackets(trimmed.slice(0, closingIndex + 1));
  }

  const colonCount = (trimmed.match(/:/g) || []).length;
  if (colonCount === 1) {
    const [host] = trimmed.split(":");
    return host;
  }

  return trimmed;
}

export function isIpAddress(value?: string | null): boolean {
  if (!value) return false;
  const normalized = stripHostPort(value);
  if (!normalized) return false;

  if (IPV4_PATTERN.test(normalized)) {
    return normalized.split(".").every((segment) => {
      const parsed = Number(segment);
      return Number.isInteger(parsed) && parsed >= 0 && parsed <= 255;
    });
  }

  if (normalized.includes(".") && !normalized.includes(":")) {
    return false;
  }

  return RAW_IPV6_PATTERN.test(normalized);
}

function normalizeHostKey(value?: string | null): string {
  const withoutPort = stripHostPort((value || "").trim());
  const lowered = withoutPort.toLowerCase();

  if (!lowered) return "";
  if (isIpAddress(lowered)) return lowered;

  return lowered.split(".")[0];
}

export function getNodeLabelFromHost(value?: string | null): string {
  if (!value) return "";

  const withoutPort = stripHostPort(value.trim());
  if (!withoutPort) return "";

  if (isIpAddress(withoutPort)) {
    return withoutPort;
  }

  return withoutPort.split(".")[0];
}

export function createClusterNodeNameResolver(cluster?: ClusterWithMetrics | null): NodeNameResolver {
  const aliasMap = new Map<string, string>();

  const registerAlias = (alias: string | undefined | null, displayName: string) => {
    const key = normalizeHostKey(alias);
    if (!key) return;

    aliasMap.set(key, displayName);
  };

  const nodeDetails = (cluster?.nodeDetails || []) as Array<{
    host_name?: string;
    host_address?: string;
    runtime_host_name?: string;
  }>;

  for (const node of nodeDetails) {
    const displayName = getNodeLabelFromHost(node.host_name);
    if (!displayName) continue;

    registerAlias(node.host_name, displayName);
    registerAlias(displayName, displayName);
    registerAlias(node.host_address, displayName);
    registerAlias(node.runtime_host_name, displayName);
  }

  const nodeList = (cluster?.nodeList || []) as string[];
  for (const node of nodeList) {
    const displayName = getNodeLabelFromHost(node);
    if (!displayName) continue;

    registerAlias(node, displayName);
    registerAlias(displayName, displayName);
  }

  return (hostname?: string | null) => {
    const key = normalizeHostKey(hostname);
    if (!key) return "";

    return aliasMap.get(key) || getNodeLabelFromHost(hostname);
  };
}
