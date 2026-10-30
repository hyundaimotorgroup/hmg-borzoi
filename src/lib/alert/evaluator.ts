import { prisma } from '@/lib/prisma';
import { executeQuery, parseResult } from './clickhouse-client';
import { sendNotification, sendResolvedNotification } from './notifier';
import { buildThresholdFilteredQuery } from './query-builder';
import { logger } from '@/lib/utils/logger';
import type { AlertRule } from '@prisma/client';
import {
  ALERT_SEVERITY_RANK,
  formatThresholdCondition,
  getPrefilterThreshold,
  isAlertSeverityLevel,
  parseThresholdLevels,
  resolveMatchedThreshold,
  type AlertSeverityLevel,
  type AlertThresholdLevel,
} from './thresholds';

export type AlertNotificationAction =
  | { type: 'none' }
  | { type: 'fire' }
  | { type: 'resolve'; previousSeverity: AlertSeverityLevel };

/**
 * Compares the previous alert status with the current evaluation status to determine whether to send a notification.
 * Suppresses (none) if the status has not changed, sends when transitioning to the fired state, and resolves on recovery.
 */
export function resolveNotificationAction(
  previousStatus: AlertSeverityLevel | null,
  currentStatus: AlertSeverityLevel | null
): AlertNotificationAction {
  if (previousStatus === currentStatus) return { type: 'none' };
  if (currentStatus === null) return { type: 'resolve', previousSeverity: previousStatus! };
  return { type: 'fire' };
}

export interface AlertEvaluationSummary {
  startedAt: string;
  completedAt: string;
  enabledRuleCount: number;
  evaluatedRuleCount: number;
  skippedRuleCount: number;
  failedRuleCount: number;
}

export async function evaluateAlerts(): Promise<AlertEvaluationSummary> {
  const startedAt = new Date();

  logger.debug('[Evaluator] Starting evaluation cycle...');

  const rules = await prisma.alertRule.findMany({
    where: { enabled: true }
  });

  logger.debug(`[Evaluator] Found ${rules.length} enabled rules`);

  let evaluatedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const rule of rules) {
    if (shouldExecuteNow(rule.lastExecutedAt, rule.checkIntervalMinutes)) {
      try {
        const nextStatus = await evaluateRule(rule);
        evaluatedCount++;

        await prisma.alertRule.update({
          where: { id: rule.id },
          data: {
            lastExecutedAt: startedAt,
            ...(nextStatus !== undefined && { lastAlertStatus: nextStatus }),
          }
        });

      } catch (error) {
        failedCount++;
        logger.error(
          `[Evaluator] Failed to evaluate rule "${rule.name}" (${rule.id}):`,
          error
        );
      }
    } else {
      skippedCount++;
    }
  }

  logger.debug(`[Evaluator] Evaluated ${evaluatedCount} rules`);

  return {
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    enabledRuleCount: rules.length,
    evaluatedRuleCount: evaluatedCount,
    skippedRuleCount: skippedCount,
    failedRuleCount: failedCount,
  };
}

function shouldExecuteNow(
  lastExecutedAt: Date | null,
  intervalMinutes: number
): boolean {
  if (!lastExecutedAt) {
    return true;
  }

  const now = Date.now();
  const lastExecution = lastExecutedAt.getTime();
  const intervalMs = intervalMinutes * 60 * 1000;

  return (now - lastExecution) >= intervalMs;
}

async function evaluateRule(rule: AlertRule): Promise<AlertSeverityLevel | null | undefined> {
  const startTime = Date.now();

  let queryResult: number | null = null;
  let thresholdMet = false;
  let matchedSeverity: string | null = null;
  let error: string | null = null;
  let notificationSent = false;
  let triggeringRow: Record<string, unknown> | null = null;
  let allRows: Record<string, unknown>[] = [];
  // undefined = unable to determine status in this execution cycle (e.g. error) → keep lastAlertStatus
  let nextStatus: AlertSeverityLevel | null | undefined = undefined;

  const previousStatus = isAlertSeverityLevel(rule.lastAlertStatus) ? rule.lastAlertStatus : null;

  async function handleResolve(): Promise<void> {
    const action = resolveNotificationAction(previousStatus, null);
    if (action.type !== 'resolve') return;

    try {
      await sendResolvedNotification(rule, action.previousSeverity, Date.now() - startTime);
      notificationSent = true;
      logger.debug(`[Evaluator] Resolved notification sent for rule "${rule.name}"`);
    } catch (notificationError) {
      logger.error(`[Evaluator] Resolved notification failed for rule "${rule.name}":`, notificationError);
      error = notificationError instanceof Error ? notificationError.message : String(notificationError);
      notificationSent = false;
      // Do not commit status on send failure so it can be retried in the next cycle
      nextStatus = previousStatus;
    }
  }

  try {
    logger.debug(`[Evaluator] Evaluating rule "${rule.name}"`);

    const executorUserId = rule.createdBy;

    if (!executorUserId) {
      throw new Error(`Alert rule "${rule.name}" has no createdBy user`);
    }

    const thresholds = parseThresholdLevels(rule.thresholds);
    const hasThresholdSettings = thresholds.length > 0;
    const prefilterThreshold = getPrefilterThreshold(thresholds);

    if (!hasThresholdSettings) {
      logger.warn(
        `[Evaluator] Rule "${rule.name}" has no threshold settings configured - skipping evaluation`
      );
      error = 'No thresholds configured';
      thresholdMet = false;
      notificationSent = false;
    } else {
      const filteredQuery = buildThresholdFilteredQuery(rule.query, {
        columnName: rule.thresholdColumnName ?? undefined,
        thresholds: thresholds.map((threshold) => ({
          operator: threshold.operator,
          value: threshold.value,
        })),
      });

      logger.debug(`[Evaluator] Original query: ${rule.query}`);
      logger.debug(`[Evaluator] Filtered query: ${filteredQuery}`);

      const data = await executeQuery(rule.clusterId, filteredQuery, executorUserId);
      const parsed = parseResult(data);
      allRows = parsed.rows;

      logger.debug(`[Evaluator] Query returned ${parsed.rows.length} row(s)`);

      if (parsed.rows.length > 0) {
        const matchedResult = findHighestMatchedEvaluation(
          parsed.rows,
          thresholds,
          rule.thresholdColumnName ?? undefined,
          parsed.singleValue ?? null
        );

        if (matchedResult) {
          thresholdMet = true;
          queryResult = matchedResult.value;
          matchedSeverity = matchedResult.threshold.severity;
          triggeringRow = matchedResult.row;
          nextStatus = matchedResult.threshold.severity;

          logger.debug(
            `[Evaluator] Threshold met at severity=${matchedSeverity}: ${matchedResult.value} ${formatThresholdCondition(matchedResult.threshold)}`
          );

          const action = resolveNotificationAction(previousStatus, nextStatus);

          if (action.type === 'fire') {
            try {
              const executionTime = Date.now() - startTime;

              await sendNotification(
                rule,
                matchedResult.row,
                allRows,
                executionTime,
                matchedResult.threshold
              );
              notificationSent = true;
              logger.debug(`[Evaluator] Notification sent for rule "${rule.name}"`);
            } catch (notificationError) {
              logger.error(`[Evaluator] Notification failed for rule "${rule.name}":`, notificationError);
              error = notificationError instanceof Error ? notificationError.message : String(notificationError);
              notificationSent = false;
              // Do not commit status on send failure so it can be retried in the next cycle
              nextStatus = previousStatus;
            }
          } else {
            logger.debug(`[Evaluator] Notification suppressed for rule "${rule.name}" (status unchanged: ${previousStatus})`);
          }
        } else if (hasNumericRows(parsed.rows, rule.thresholdColumnName ?? undefined, parsed.singleValue ?? null)) {
          logger.debug(
            `[Evaluator] Threshold not met for rule "${rule.name}" across ${thresholds.length} threshold level(s)${prefilterThreshold ? ` (prefilter ${formatThresholdCondition(prefilterThreshold)})` : ''}`
          );
          nextStatus = null;
          await handleResolve();
        } else {
          logger.warn(
            `[Evaluator] No numeric value found in query result for rule "${rule.name}"`
          );
          error = 'No numeric value found in query result';
        }
      } else {
        logger.debug(`[Evaluator] Query returned no rows for rule "${rule.name}"`);
        nextStatus = null;
        await handleResolve();
      }
    }

  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
    logger.error(`[Evaluator] Error evaluating rule "${rule.name}": ${error}`);
    notificationSent = false;
    nextStatus = undefined;

  } finally {
    const ruleWithMode = rule as AlertRule & { resultDisplayMode?: string };
    const resultDisplayMode = ruleWithMode.resultDisplayMode || 'showOnlyTriggering';
    let logQueryResult: string | null = null;

    if (error) {
      logQueryResult = null;
    } else if (queryResult !== null) {
      logQueryResult = String(queryResult);
    } else if (resultDisplayMode === 'showAll' && allRows.length > 0) {
      logQueryResult = JSON.stringify(allRows);
    } else if (triggeringRow) {
      logQueryResult = JSON.stringify(triggeringRow);
    }

    await prisma.executionLog.create({
      data: {
        alertRuleId: rule.id,
        ...(logQueryResult !== null && { queryResult: logQueryResult }),
        thresholdMet,
        ...(matchedSeverity !== null && { matchedSeverity }),
        notificationSent,
        ...(error !== null && { error }),
        executionTimeMs: Date.now() - startTime
      }
    });
  }

  return nextStatus;
}

function getRowNumericValue(
  row: Record<string, unknown>,
  columnName?: string,
  fallbackValue?: number | null
): number | null {
  if (columnName) {
    return getColumnValue(row, columnName) ?? getFirstNumericValue(row);
  }

  if (fallbackValue !== undefined && fallbackValue !== null) {
    return fallbackValue;
  }

  return getFirstNumericValue(row);
}

function hasNumericRows(
  rows: Record<string, unknown>[],
  columnName?: string,
  singleValue?: number | null
): boolean {
  return rows.some((row, index) => getRowNumericValue(row, columnName, index === 0 ? singleValue : null) !== null);
}

function findHighestMatchedEvaluation(
  rows: Record<string, unknown>[],
  thresholds: AlertThresholdLevel[],
  columnName?: string,
  singleValue?: number | null
): { row: Record<string, unknown>; value: number; threshold: AlertThresholdLevel } | null {
  let bestMatch: { row: Record<string, unknown>; value: number; threshold: AlertThresholdLevel } | null = null;

  rows.forEach((row, index) => {
    const value = getRowNumericValue(row, columnName, index === 0 ? singleValue : null);
    if (value === null) {
      return;
    }

    const matchedThreshold = resolveMatchedThreshold(value, thresholds, compareThreshold);
    if (!matchedThreshold) {
      return;
    }

    if (
      !bestMatch ||
      ALERT_SEVERITY_RANK[matchedThreshold.severity] > ALERT_SEVERITY_RANK[bestMatch.threshold.severity]
    ) {
      bestMatch = { row, value, threshold: matchedThreshold };
    }
  });

  return bestMatch;
}

function getColumnValue(row: Record<string, unknown>, columnName: string): number | null {
  const value = row[columnName];
  if (value === null || value === undefined) {
    return null;
  }
  const num = parseFloat(String(value));
  return isNaN(num) ? null : num;
}

function getFirstNumericValue(row: Record<string, unknown>): number | null {
  for (const value of Object.values(row)) {
    const num = parseFloat(String(value));
    if (!isNaN(num)) {
      return num;
    }
  }
  return null;
}

export function compareThreshold(
  value: number,
  operator: string,
  threshold: number
): boolean {
  switch (operator) {
    case '>':
      return value > threshold;
    case '<':
      return value < threshold;
    case '>=':
      return value >= threshold;
    case '<=':
      return value <= threshold;
    case '=':
      return value === threshold;
    case '!=':
      return value !== threshold;
    default:
      throw new Error(`Unknown operator: ${operator}`);
  }
}
