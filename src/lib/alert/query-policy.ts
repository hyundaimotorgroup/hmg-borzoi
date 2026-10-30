export const FORBIDDEN_SQL_KEYWORDS = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER', 'TRUNCATE', 'RENAME',
  'SYSTEM', 'KILL', 'GRANT', 'REVOKE', 'ATTACH', 'DETACH', 'OPTIMIZE', 'WATCH',
  'BACKUP', 'RESTORE', 'SET',
];

/**
 * True when `query` contains more than one SQL statement (i.e. a `;` other
 * than a single optional trailing one), which would let forbidden-keyword
 * checks on the first statement be bypassed via a stacked second statement.
 */
export function hasMultipleStatements(query: string): boolean {
  return query.trim().replace(/;\s*$/, '').includes(';');
}

/**
 * Returns the first forbidden keyword found in `query`, or null if none.
 * `SYSTEM` is exempted when used as a table-schema reference (`system.tables`,
 * `system.processes`, ...) — a very common, legitimate pattern in alert
 * queries — but still flagged as the `SYSTEM ...` administrative command.
 */
export function findForbiddenKeyword(query: string): string | null {
  for (const keyword of FORBIDDEN_SQL_KEYWORDS) {
    const pattern =
      keyword === 'SYSTEM'
        ? /\bSYSTEM\b(?!\s*\.)/i
        : new RegExp(`\\b${keyword}\\b`, 'i');
    if (pattern.test(query)) {
      return keyword;
    }
  }
  return null;
}
