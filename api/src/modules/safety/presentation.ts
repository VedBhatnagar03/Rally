export function presentReport<T extends { dedupeKey: string | null }>(report: T): Omit<T, "dedupeKey"> {
  const { dedupeKey, ...presented } = report;
  void dedupeKey;
  return presented;
}
