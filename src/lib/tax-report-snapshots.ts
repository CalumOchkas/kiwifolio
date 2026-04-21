import type { SnapshotData, DividendData, TradeData } from "@/lib/fif-tax";

export const POSITION_DUST_EPSILON = 0.001;

export function normalizePositionQuantity(quantity: number): number {
  return Math.abs(quantity) < POSITION_DUST_EPSILON ? 0 : quantity;
}

export function hasMaterialSnapshotPosition(snapshot: SnapshotData): boolean {
  return (
    Math.abs(snapshot.openingQty) >= POSITION_DUST_EPSILON ||
    Math.abs(snapshot.closingQty) >= POSITION_DUST_EPSILON
  );
}

export function hasTaxYearActivity(
  ticker: string,
  trades: TradeData[],
  dividends: DividendData[],
  start: Date,
  end: Date,
  portfolioId?: string
): boolean {
  const hasTrade = trades.some((trade) => {
    if (trade.ticker !== ticker) return false;
    if (portfolioId && "portfolioId" in trade && trade.portfolioId !== portfolioId) {
      return false;
    }
    return trade.tradeDate >= start && trade.tradeDate <= end;
  });

  if (hasTrade) return true;

  return dividends.some((dividend) => {
    if (dividend.ticker !== ticker) return false;
    if (portfolioId && "portfolioId" in dividend && dividend.portfolioId !== portfolioId) {
      return false;
    }
    return dividend.date >= start && dividend.date <= end;
  });
}

export function shouldIncludeTaxReportSnapshot(
  snapshot: SnapshotData,
  hasActivity: boolean
): boolean {
  return hasMaterialSnapshotPosition(snapshot) || hasActivity;
}