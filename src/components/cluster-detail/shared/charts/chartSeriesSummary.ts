export interface ChartSeriesDescriptor {
  key: string;
  label: string;
  color: string;
  parentKey?: string;
}

export interface ChartSeriesSummaryRow {
  key: string;
  label: string;
  color: string;
  min: number;
  max: number;
  last: number;
  parentKey?: string;
}

export function buildChartSeriesSummaryRows(
  data: Array<Record<string, string | number>>,
  descriptors: ChartSeriesDescriptor[],
): ChartSeriesSummaryRow[] {
  if (data.length === 0 || descriptors.length === 0) {
    return [];
  }

  return descriptors
    .map((descriptor) => {
      const values = data
        .map((row) => row[descriptor.key])
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

      if (values.length === 0) {
        return null;
      }

      return {
        key: descriptor.key,
        label: descriptor.label,
        color: descriptor.color,
        min: Math.min(...values),
        max: Math.max(...values),
        last: values[values.length - 1],
        ...(descriptor.parentKey !== undefined ? { parentKey: descriptor.parentKey } : {}),
      } satisfies ChartSeriesSummaryRow;
    })
    .filter((row): row is ChartSeriesSummaryRow => row !== null);
}
