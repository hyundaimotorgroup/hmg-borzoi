export function serializeQueryResultCsv(columns: string[], rows: unknown[][]): string {
  return [
    columns.map((column) => `"${column.replace(/"/g, '""')}"`).join(','),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n');
}
