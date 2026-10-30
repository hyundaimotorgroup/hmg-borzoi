export function formatBytes(bytes: number | string | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes === "") return "0 B";

  const value = typeof bytes === "string" ? Number(bytes) : bytes;
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

export function formatMegabytesAsBytes(megabytes: number | string | null | undefined): string {
  if (megabytes === null || megabytes === undefined || megabytes === "") return "0 B";

  const value = typeof megabytes === "string" ? Number(megabytes) : megabytes;
  if (!Number.isFinite(value) || value <= 0) return "0 B";

  return formatBytes(value * 1024 * 1024);
}

export function formatBytesPerSecond(bytesPerSecond: number | string | null | undefined): string {
  if (bytesPerSecond === null || bytesPerSecond === undefined || bytesPerSecond === "") return "0 B/s";

  const value = typeof bytesPerSecond === "string" ? Number(bytesPerSecond) : bytesPerSecond;
  if (!Number.isFinite(value) || value <= 0) return "0 B/s";

  return `${formatBytes(value)}/s`;
}
