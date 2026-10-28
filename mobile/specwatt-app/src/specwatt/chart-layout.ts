/** Presentation only: never turns an absent measurement into zero. */
export function chartValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function chartScale(values: readonly unknown[]) {
  const peak = values.reduce<number>((max, value) => Math.max(max, chartValue(value) ?? 0), 0);
  const rawStep = Math.max(peak, 1) / 3;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = Math.ceil(rawStep / magnitude) * magnitude;
  const max = step * 3;
  return { max, ticks: [0, step, step * 2, max] };
}
