/**
 * Simple SQL formatter for improved readability
 */

export function formatSQL(sql: string): string {
  if (!sql) return '';

  let formatted = sql;

  // Remove unnecessary whitespace
  formatted = formatted.replace(/\s+/g, ' ').trim();

  // Add line breaks after major keywords
  const keywords = [
    'CREATE ROLE',
    'CREATE USER',
    'CREATE SETTINGS PROFILE',
    'ALTER ROLE',
    'ALTER USER',
    'ALTER SETTINGS PROFILE',
    'GRANT',
    'REVOKE',
    'SETTINGS',
    'PROFILE',
    'PROFILES',
    'INHERIT',
    'TO NONE',
    'TO',
    'FROM',
    'WHERE',
    'AND',
    'OR'
  ];

  keywords.forEach(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    formatted = formatted.replace(regex, `\n${keyword}`);
  });

  // Format the SETTINGS section specially
  formatted = formatted.replace(/SETTINGS\s+/gi, '\nSETTINGS\n    ');

  // Add indentation to setting items
  formatted = formatted.replace(/,\s*(\w+)\s*=/g, ',\n    $1 =');

  // Clean up consecutive blank lines
  formatted = formatted.replace(/\n\s*\n/g, '\n');

  // Remove leading and trailing whitespace from each line
  formatted = formatted.split('\n').map(line => line.trim()).join('\n');

  // Add appropriate indentation
  const lines = formatted.split('\n');
  let indentLevel = 0;
  const indentedLines = lines.map(line => {
    if (line.match(/^(SETTINGS|GRANT|REVOKE|PROFILE|TO)/i)) {
      indentLevel = 1;
    } else if (line.match(/^(CREATE|ALTER)/i)) {
      indentLevel = 0;
    }

    const indent = '  '.repeat(indentLevel);
    return indent + line;
  });

  formatted = indentedLines.join('\n');

  return formatted.trim();
}

export async function formatSQLWithFallback(sql: string): Promise<string> {
  if (!sql) return "";

  try {
    const { format } = await import("sql-formatter");
    return format(sql, {
      language: "sql",
      tabWidth: 2,
      keywordCase: "upper",
      linesBetweenQueries: 1,
    });
  } catch (_error) {
    return formatSQL(sql);
  }
}

export function formatGrantsList(grants: string): string {
  if (!grants) return '';

  // Split by semicolon or newline
  const grantStatements = grants.split(/;|\n/).filter(g => g.trim());

  // Process each grant format
  const formatted = grantStatements.map(grant => {
    let g = grant.trim();
    if (!g) return '';

    // Add GRANT prefix if missing
    if (!g.toUpperCase().startsWith('GRANT')) {
      g = 'GRANT ' + g;
    }

    // Add semicolon if missing
    if (!g.endsWith(';')) {
      g += ';';
    }

    return g;
  }).filter(g => g);

  return formatted.join('\n');
}
