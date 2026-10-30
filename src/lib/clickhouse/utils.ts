export function quoteIdentifier(name: string): string {
  return `\`${name.replace(/`/g, '``')}\``;
}

export function quoteString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
