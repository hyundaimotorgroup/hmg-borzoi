export const ALERT_SEVERITY_LEVELS = ["info", "warning", "critical"] as const;
export const ALERT_THRESHOLD_OPERATORS = [">", "<", ">=", "<=", "=", "!="] as const;

export type AlertSeverityLevel = (typeof ALERT_SEVERITY_LEVELS)[number];
export type AlertThresholdOperator = (typeof ALERT_THRESHOLD_OPERATORS)[number];

export interface AlertThresholdLevel {
  severity: AlertSeverityLevel;
  operator: AlertThresholdOperator;
  value: number;
  order?: number;
}

export const ALERT_SEVERITY_RANK: Record<AlertSeverityLevel, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export function isAlertSeverityLevel(value: unknown): value is AlertSeverityLevel {
  return typeof value === "string" && ALERT_SEVERITY_LEVELS.includes(value as AlertSeverityLevel);
}

export function isAlertThresholdOperator(value: unknown): value is AlertThresholdOperator {
  return typeof value === "string" && ALERT_THRESHOLD_OPERATORS.includes(value as AlertThresholdOperator);
}

export function parseThresholdLevels(value: unknown): AlertThresholdLevel[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index): AlertThresholdLevel | null => {
      if (!item || typeof item !== "object") return null;

      const raw = item as Record<string, unknown>;
      const severity = raw.severity;
      const operator = raw.operator;
      const thresholdValue = raw.value;
      const order = raw.order;

      if (!isAlertSeverityLevel(severity) || !isAlertThresholdOperator(operator)) {
        return null;
      }

      const numericValue = typeof thresholdValue === "number" ? thresholdValue : Number(thresholdValue);
      if (!Number.isFinite(numericValue)) {
        return null;
      }

      const numericOrder = typeof order === "number" && Number.isFinite(order) ? order : index;

      return {
        severity,
        operator,
        value: numericValue,
        order: numericOrder,
      };
    })
    .filter((item): item is AlertThresholdLevel => item !== null)
    .sort((a, b) => {
      const orderDiff = (a.order ?? 0) - (b.order ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return ALERT_SEVERITY_RANK[a.severity] - ALERT_SEVERITY_RANK[b.severity];
    });
}

export function getHighestSeverity(thresholds: AlertThresholdLevel[]): AlertSeverityLevel {
  return thresholds.reduce<AlertSeverityLevel>(
    (highest, threshold) =>
      ALERT_SEVERITY_RANK[threshold.severity] > ALERT_SEVERITY_RANK[highest]
        ? threshold.severity
        : highest,
    "info"
  );
}

export function getPrimaryThreshold(thresholds: AlertThresholdLevel[]): AlertThresholdLevel | null {
  if (thresholds.length === 0) return null;

  return thresholds.reduce<AlertThresholdLevel>((selected, threshold) => {
    if (ALERT_SEVERITY_RANK[threshold.severity] > ALERT_SEVERITY_RANK[selected.severity]) {
      return threshold;
    }

    if (ALERT_SEVERITY_RANK[threshold.severity] === ALERT_SEVERITY_RANK[selected.severity]) {
      return threshold.order !== undefined && selected.order !== undefined && threshold.order > selected.order
        ? threshold
        : selected;
    }

    return selected;
  }, thresholds[0]);
}

export function resolveMatchedThreshold(
  value: number,
  thresholds: AlertThresholdLevel[],
  compare: (actual: number, operator: string, threshold: number) => boolean
): AlertThresholdLevel | null {
  let matched: AlertThresholdLevel | null = null;

  for (const threshold of thresholds) {
    if (!compare(value, threshold.operator, threshold.value)) continue;

    if (!matched || ALERT_SEVERITY_RANK[threshold.severity] > ALERT_SEVERITY_RANK[matched.severity]) {
      matched = threshold;
      continue;
    }

    if (
      ALERT_SEVERITY_RANK[threshold.severity] === ALERT_SEVERITY_RANK[matched.severity] &&
      (threshold.order ?? 0) > (matched.order ?? 0)
    ) {
      matched = threshold;
    }
  }

  return matched;
}

export function getPrefilterThreshold(thresholds: AlertThresholdLevel[]): AlertThresholdLevel | null {
  if (thresholds.length === 0) return null;

  const operatorFamily = thresholds[0]?.operator;

  if (operatorFamily === ">" || operatorFamily === ">=") {
    return thresholds.reduce((selected, threshold) => (threshold.value < selected.value ? threshold : selected), thresholds[0]);
  }

  if (operatorFamily === "<" || operatorFamily === "<=") {
    return thresholds.reduce((selected, threshold) => (threshold.value > selected.value ? threshold : selected), thresholds[0]);
  }

  return getPrimaryThreshold(thresholds);
}

export function formatThresholdCondition(
  threshold: Pick<AlertThresholdLevel, "operator" | "value">
): string {
  return `${threshold.operator} ${threshold.value}`;
}
