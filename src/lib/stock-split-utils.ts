const LEGACY_SPLIT_MATCH_WINDOW_MS = 36 * 60 * 60 * 1000;

export interface SplitIdentity {
  splitDate: Date;
  numerator: number;
  denominator: number;
}

// Use the Yahoo event's UTC calendar date as the canonical market date.
export function toMarketDateKey(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

// Older app versions stored split dates at midnight using the host timezone,
// so the same event can exist one day earlier or later across environments.
export function isSameSplitEvent(
  appliedSplit: SplitIdentity,
  incomingSplit: SplitIdentity
): boolean {
  if (
    appliedSplit.numerator !== incomingSplit.numerator ||
    appliedSplit.denominator !== incomingSplit.denominator
  ) {
    return false;
  }

  return (
    Math.abs(appliedSplit.splitDate.getTime() - incomingSplit.splitDate.getTime()) <=
    LEGACY_SPLIT_MATCH_WINDOW_MS
  );
}