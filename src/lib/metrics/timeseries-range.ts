export type LegacyTimeRange = "1h" | "6h" | "12h" | "24h" | "3d" | "7d";

export type RelativePreset =
  | "last-15m"
  | "last-1h"
  | "last-3h"
  | "last-6h"
  | "last-12h"
  | "last-24h"
  | "last-3d"
  | "last-7d";

export type DashboardTimeRange =
  | { mode: "relative"; preset: RelativePreset }
  | { mode: "absolute"; from: string; to: string };

export type TimeseriesRangeSelection = LegacyTimeRange | DashboardTimeRange;

export interface RelativePresetConfig {
  label: string;
  durationMs: number;
  legacy?: LegacyTimeRange;
}

export interface ResolvedTimeseriesRange {
  selection: DashboardTimeRange;
  timezone: string;
  label: string;
  start: Date;
  end: Date;
  startUtc: string;
  endUtc: string;
  intervalSeconds: number;
  intervalMinutes: number;
  rangeHours: number;
  points: number;
  cacheKey: string;
  legacyTimeRange: LegacyTimeRange | null;
}

export class TimeseriesRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeseriesRangeError";
  }
}

export const DEFAULT_TIMEZONE = "UTC";
export const DEFAULT_RELATIVE_PRESET: RelativePreset = "last-1h";

export const RELATIVE_PRESET_CONFIGS: Record<RelativePreset, RelativePresetConfig> = {
  "last-15m": { label: "Last 15 mins", durationMs: 15 * 60 * 1000 },
  "last-1h": { label: "Last 1 hour", durationMs: 60 * 60 * 1000, legacy: "1h" },
  "last-3h": { label: "Last 3 hours", durationMs: 3 * 60 * 60 * 1000 },
  "last-6h": { label: "Last 6 hours", durationMs: 6 * 60 * 60 * 1000, legacy: "6h" },
  "last-12h": { label: "Last 12 hours", durationMs: 12 * 60 * 60 * 1000, legacy: "12h" },
  "last-24h": { label: "Last 24 hours", durationMs: 24 * 60 * 60 * 1000, legacy: "24h" },
  "last-3d": { label: "Last 3 days", durationMs: 3 * 24 * 60 * 60 * 1000, legacy: "3d" },
  "last-7d": { label: "Last 7 days", durationMs: 7 * 24 * 60 * 60 * 1000, legacy: "7d" },
};

export const RELATIVE_PRESET_OPTIONS = (Object.entries(RELATIVE_PRESET_CONFIGS) as Array<
  [RelativePreset, RelativePresetConfig]
>).map(([value, config]) => ({ value, label: config.label }));

const LEGACY_TO_PRESET: Record<LegacyTimeRange, RelativePreset> = {
  "1h": "last-1h",
  "6h": "last-6h",
  "12h": "last-12h",
  "24h": "last-24h",
  "3d": "last-3d",
  "7d": "last-7d",
};

const ABSOLUTE_INPUT_REGEX = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}

function formatUtcDateTime(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function floorToInterval(date: Date, intervalSeconds: number): Date {
  const ms = intervalSeconds * 1000;
  return new Date(Math.floor(date.getTime() / ms) * ms);
}

function parseAbsoluteInput(value: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const match = value.match(ABSOLUTE_INPUT_REGEX);

  if (!match) {
    throw new TimeseriesRangeError(`Invalid absolute date-time: ${value}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? 0),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const lookup = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? "0");
  const utcFromParts = Date.UTC(
    lookup("year"),
    lookup("month") - 1,
    lookup("day"),
    lookup("hour"),
    lookup("minute"),
    lookup("second")
  );

  return utcFromParts - date.getTime();
}

function zonedDateTimeToUtc(value: string, timeZone: string): Date {
  const parsed = parseAbsoluteInput(value);
  const guessMs = Date.UTC(parsed.year, parsed.month - 1, parsed.day, parsed.hour, parsed.minute, parsed.second);
  let date = new Date(guessMs - getTimeZoneOffsetMs(new Date(guessMs), timeZone));
  const adjustedOffset = getTimeZoneOffsetMs(date, timeZone);
  date = new Date(guessMs - adjustedOffset);
  return date;
}

function normalizePreset(value: string | null | undefined): RelativePreset | null {
  if (!value) return null;

  if (value in RELATIVE_PRESET_CONFIGS) {
    return value as RelativePreset;
  }

  if (value in LEGACY_TO_PRESET) {
    return LEGACY_TO_PRESET[value as LegacyTimeRange];
  }

  return null;
}

export function getDefaultDashboardTimeRange(): DashboardTimeRange {
  return { mode: "relative", preset: DEFAULT_RELATIVE_PRESET };
}

export function getRelativePresetLabel(preset: RelativePreset): string {
  return RELATIVE_PRESET_CONFIGS[preset].label;
}

export function describeDashboardTimeRange(range: DashboardTimeRange): string {
  if (range.mode === "relative") {
    return getRelativePresetLabel(range.preset);
  }

  return `${range.from} → ${range.to}`;
}

export function getBucketIntervalSeconds(durationMs: number): number {
  if (durationMs <= 15 * 60 * 1000) return 15;
  if (durationMs <= 60 * 60 * 1000) return 60;
  if (durationMs <= 3 * 60 * 60 * 1000) return 3 * 60;
  if (durationMs <= 6 * 60 * 60 * 1000) return 5 * 60;
  if (durationMs <= 12 * 60 * 60 * 1000) return 10 * 60;
  if (durationMs <= 24 * 60 * 60 * 1000) return 20 * 60;
  if (durationMs <= 3 * 24 * 60 * 60 * 1000) return 60 * 60;
  if (durationMs <= 7 * 24 * 60 * 60 * 1000) return 2 * 60 * 60;
  return 6 * 60 * 60;
}

export function resolveTimeseriesRange(params: {
  mode?: string | null;
  preset?: string | null;
  from?: string | null;
  to?: string | null;
  timeRange?: string | null;
  timezone?: string | null;
  now?: Date;
}): ResolvedTimeseriesRange {
  const timezone = params.timezone || DEFAULT_TIMEZONE;
  const now = params.now ?? new Date();

  if (params.mode === "absolute" || params.from || params.to) {
    if (!params.from || !params.to) {
      throw new TimeseriesRangeError("Absolute time range requires both 'from' and 'to'.");
    }

    const start = zonedDateTimeToUtc(params.from, timezone);
    const end = zonedDateTimeToUtc(params.to, timezone);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new TimeseriesRangeError("Absolute time range contains an invalid date-time.");
    }

    if (end.getTime() <= start.getTime()) {
      throw new TimeseriesRangeError("Absolute time range requires 'to' to be later than 'from'.");
    }

    const durationMs = end.getTime() - start.getTime();
    const intervalSeconds = getBucketIntervalSeconds(durationMs);
    const points = Math.max(1, Math.ceil(durationMs / (intervalSeconds * 1000)));

    return {
      selection: { mode: "absolute", from: params.from, to: params.to },
      timezone,
      label: `${params.from} → ${params.to}`,
      start,
      end,
      startUtc: formatUtcDateTime(start),
      endUtc: formatUtcDateTime(end),
      intervalSeconds,
      intervalMinutes: intervalSeconds / 60,
      rangeHours: durationMs / (60 * 60 * 1000),
      points,
      cacheKey: `absolute:${timezone}:${start.toISOString()}:${end.toISOString()}:${intervalSeconds}`,
      legacyTimeRange: null,
    };
  }

  const preset = normalizePreset(params.preset ?? params.timeRange) ?? DEFAULT_RELATIVE_PRESET;
  const config = RELATIVE_PRESET_CONFIGS[preset];
  const intervalSeconds = getBucketIntervalSeconds(config.durationMs);
  const end = floorToInterval(now, intervalSeconds);
  const start = new Date(end.getTime() - config.durationMs);
  const points = Math.max(1, Math.ceil(config.durationMs / (intervalSeconds * 1000)));

  return {
    selection: { mode: "relative", preset },
    timezone,
    label: config.label,
    start,
    end,
    startUtc: formatUtcDateTime(start),
    endUtc: formatUtcDateTime(end),
    intervalSeconds,
    intervalMinutes: intervalSeconds / 60,
    rangeHours: config.durationMs / (60 * 60 * 1000),
    points,
    cacheKey: `relative:${preset}:${timezone}:${end.toISOString()}:${intervalSeconds}`,
    legacyTimeRange: config.legacy ?? null,
  };
}

export function buildTimeseriesSearchParams(range: TimeseriesRangeSelection, timezone: string): URLSearchParams {
  const params = new URLSearchParams();

  if (typeof range === "string") {
    params.set("timeRange", range);
    return params;
  }

  params.set("mode", range.mode);
  params.set("timezone", timezone || DEFAULT_TIMEZONE);

  if (range.mode === "relative") {
    params.set("preset", range.preset);
    return params;
  }

  params.set("from", range.from);
  params.set("to", range.to);
  return params;
}

export function toDateTimeLocalValue(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);

  const lookup = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${lookup("year")}-${lookup("month")}-${lookup("day")}T${lookup("hour")}:${lookup("minute")}`;
}
