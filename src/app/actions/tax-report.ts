"use server";

import { prisma } from "@/lib/prisma";
import {
  calculatePortfolioTax,
  parseTaxYearRange,
  type SnapshotData,
  type TradeData,
  type DividendData,
  type PortfolioTaxResult,
} from "@/lib/fif-tax";

export interface TaxReportSnapshot extends SnapshotData {
  id: string;
  portfolioId: string;
  portfolioName: string;
  isManuallyEdited: boolean;
}

export interface TaxReportData {
  portfolioNames: string[];
  taxYear: string;
  isPartialYear: boolean;
  snapshots: TaxReportSnapshot[];
  result: PortfolioTaxResult;
}

/**
 * Merge snapshots for the same ticker across portfolios.
 * Sums quantities, takes prices/FX from first non-zero entry (same EOD value).
 */
function mergeSnapshots(snapshots: SnapshotData[]): SnapshotData[] {
  const byTicker = new Map<string, SnapshotData>();
  for (const s of snapshots) {
    const existing = byTicker.get(s.ticker);
    if (existing) {
      existing.openingQty += s.openingQty;
      existing.closingQty += s.closingQty;
      if (existing.openingPrice === 0 && s.openingPrice !== 0) {
        existing.openingPrice = s.openingPrice;
        existing.openingFxRate = s.openingFxRate;
      }
      if (existing.closingPrice === 0 && s.closingPrice !== 0) {
        existing.closingPrice = s.closingPrice;
        existing.closingFxRate = s.closingFxRate;
      }
    } else {
      byTicker.set(s.ticker, { ...s });
    }
  }
  return [...byTicker.values()];
}

/**
 * Compute the FIF tax report across selected portfolios for a tax year.
 * Merges snapshots, trades, dividends, and exempt tickers from all portfolios.
 */
export async function computeTaxReport(
  portfolioIds: string[],
  taxYear: string
): Promise<TaxReportData | null> {
  if (portfolioIds.length === 0) return null;

  const portfolios = await prisma.portfolio.findMany({
    where: { id: { in: portfolioIds } },
    select: { id: true, name: true },
  });

  if (portfolios.length === 0) return null;

  const portfolioNameMap = new Map(portfolios.map((p) => [p.id, p.name]));

  const [rawSnapshots, rawTrades, rawDividends, holdingSettings] = await Promise.all([
    prisma.taxYearSnapshot.findMany({
      where: { portfolioId: { in: portfolioIds }, taxYear },
    }),
    prisma.trade.findMany({
      where: { portfolioId: { in: portfolioIds } },
      orderBy: { tradeDate: "asc" },
    }),
    prisma.dividend.findMany({
      where: { portfolioId: { in: portfolioIds } },
      orderBy: { date: "asc" },
    }),
    prisma.holdingSettings.findMany({
      where: { portfolioId: { in: portfolioIds }, isFifExempt: true },
    }),
  ]);

  const exemptTickers = new Set(holdingSettings.map((s) => s.ticker));

  const allSnapshotData: SnapshotData[] = rawSnapshots.map((s) => ({
    ticker: s.ticker,
    openingQty: s.openingQty,
    openingPrice: s.openingPrice,
    openingFxRate: s.openingFxRate,
    closingQty: s.closingQty,
    closingPrice: s.closingPrice,
    closingFxRate: s.closingFxRate,
  }));

  const trades: TradeData[] = rawTrades.map((t) => ({
    ticker: t.ticker,
    tradeType: t.tradeType as "BUY" | "SELL",
    tradeDate: t.tradeDate,
    quantity: t.quantity,
    price: t.price,
    brokerage: t.brokerage,
    currency: t.currency,
    fxRateToNzd: t.fxRateToNzd,
  }));

  const dividends: DividendData[] = rawDividends.map((d) => ({
    ticker: d.ticker,
    date: d.date,
    grossAmount: d.grossAmount,
    taxWithheld: d.taxWithheld,
    fxRateToNzd: d.fxRateToNzd,
  }));

  const mergedSnapshots = mergeSnapshots(allSnapshotData);

  const result = calculatePortfolioTax(
    mergedSnapshots,
    trades,
    dividends,
    exemptTickers,
    taxYear,
    trades
  );

  const snapshotsWithMeta: TaxReportSnapshot[] = rawSnapshots.map((s) => ({
    ticker: s.ticker,
    id: s.id,
    portfolioId: s.portfolioId,
    portfolioName: portfolioNameMap.get(s.portfolioId) ?? "Unknown",
    isManuallyEdited: s.isManuallyEdited,
    openingQty: s.openingQty,
    openingPrice: s.openingPrice,
    openingFxRate: s.openingFxRate,
    closingQty: s.closingQty,
    closingPrice: s.closingPrice,
    closingFxRate: s.closingFxRate,
  }));

  const { end } = parseTaxYearRange(taxYear);
  const isPartialYear = new Date() < end;

  return {
    portfolioNames: portfolios.map((p) => p.name).sort(),
    taxYear,
    isPartialYear,
    snapshots: snapshotsWithMeta,
    result,
  };
}
