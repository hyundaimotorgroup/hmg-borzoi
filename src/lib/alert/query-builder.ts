export interface FilterOptions {
  columnName?: string;
  thresholds?: Array<{
    operator?: string;
    value?: number;
  }>;
}

function buildThresholdCondition(
  columnName: string,
  thresholds?: FilterOptions['thresholds']
): string | null {
  const validThresholds = Array.isArray(thresholds) && thresholds.length > 0
    ? thresholds.filter(
        (threshold): threshold is { operator: string; value: number } =>
          typeof threshold.operator === 'string' &&
          threshold.operator.trim() !== '' &&
          typeof threshold.value === 'number' &&
          Number.isFinite(threshold.value)
      )
    : [];

  const conditions = validThresholds.map((threshold) => `${columnName} ${threshold.operator} ${threshold.value}`);

  if (conditions.length === 0) {
    return null;
  }

  return conditions.length === 1 ? conditions[0] : `(${conditions.join(' OR ')})`;
}

export function buildThresholdFilteredQuery(
  originalQuery: string,
  filterOptions: FilterOptions
): string {
  const { columnName, thresholds } = filterOptions;
  const thresholdCondition = columnName
    ? buildThresholdCondition(columnName, thresholds)
    : null;

  if (!columnName || !thresholdCondition) {
    return originalQuery;
  }

  const queryTrimmed = originalQuery.trim().replace(/;$/, '');
  const hasAggregateInSelect = /\b(sum|avg|count|min|max|any|groupArray)\s*\(/i.test(queryTrimmed);
  // \s{1,20} (not \s+) bounds the lookahead's worst-case backtracking to a constant per
  // position, so scanning the preceding [\s\S]+? can't be driven into superlinear time by
  // a query with a long run of whitespace after GROUP/ORDER.
  const clauseTerminator = String.raw`\s*(?:GROUP\s{1,20}BY|ORDER\s{1,20}BY|LIMIT|FORMAT|SETTINGS|$)`;

  if (hasAggregateInSelect) {
    // If columnName itself is an aggregate function (e.g., count()), it cannot be used in WHERE, so use an alias
    const isAggregateColumn = /^(sum|avg|count|min|max|any|groupArray)\s*\(/i.test((columnName || '').trim());
    if (isAggregateColumn) {
      const escaped = columnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const aliasedQuery = queryTrimmed.replace(new RegExp(escaped, 'i'), `${columnName} AS _threshold_val`);
      const aliasedCondition = buildThresholdCondition('_threshold_val', thresholds);
      return aliasedCondition
        ? `SELECT * FROM (${aliasedQuery}) WHERE ${aliasedCondition}`
        : originalQuery;
    }
    return `SELECT * FROM (${queryTrimmed}) WHERE ${thresholdCondition}`;
  }

  const hasGroupBy = /\bGROUP\s+BY\b/i.test(queryTrimmed);

  if (hasGroupBy) {
    const hasHaving = /\bHAVING\b/i.test(queryTrimmed);

    if (hasHaving) {
      const result = queryTrimmed.replace(
        new RegExp(String.raw`(\bHAVING\b[\s\S]+?)(?=${clauseTerminator})`, 'i'),
        `$1 AND ${thresholdCondition}`
      );
      if (result === queryTrimmed) {
        return `SELECT * FROM (${queryTrimmed}) WHERE ${thresholdCondition}`;
      }
      return result;
    } else {
      const result = queryTrimmed.replace(
        new RegExp(String.raw`(\bGROUP\s+BY\b[\s\S]+?)(?=${clauseTerminator})`, 'i'),
        `$1 HAVING ${thresholdCondition}`
      );
      if (result === queryTrimmed) {
        return `SELECT * FROM (${queryTrimmed}) WHERE ${thresholdCondition}`;
      }
      return result;
    }
  } else {
    const hasWhere = /\bWHERE\b/i.test(queryTrimmed);

    if (hasWhere) {
      const result = queryTrimmed.replace(
        new RegExp(String.raw`(\bWHERE\b[\s\S]+?)(?=${clauseTerminator})`, 'i'),
        `$1 AND ${thresholdCondition}`
      );
      if (result === queryTrimmed) {
        return `SELECT * FROM (${queryTrimmed}) WHERE ${thresholdCondition}`;
      }
      return result;
    } else {
      const result = queryTrimmed.replace(
        /(\bFROM\b[\s\S]+?)(?=\s*(?:WHERE|GROUP\s{1,20}BY|ORDER\s{1,20}BY|LIMIT|FORMAT|SETTINGS|$))/i,
        `$1 WHERE ${thresholdCondition}`
      );
      if (result === queryTrimmed) {
        return `SELECT * FROM (${queryTrimmed}) WHERE ${thresholdCondition}`;
      }
      return result;
    }
  }
}
