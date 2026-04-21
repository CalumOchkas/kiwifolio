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
import {
  normalizePositionQuantity,
  shouldIncludeTaxReportSnapshot,
} from "@/lib/tax-report-snapshots";

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
  return [...byTicker.values()].map((snapshot) => ({
    ...snapshot,
    openingQty: normalizePositionQuantity(snapshot.openingQty),
    closingQty: normalizePositionQuantity(snapshot.closingQty),
  }));
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

  const { start, end } = parseTaxYearRange(taxYear);
  const rawSnapshotYearActivity = new Set(
    [
      ...rawTrades
        .filter((trade) => trade.tradeDate >= start && trade.tradeDate <= end)
        .map((trade) => `${trade.portfolioId}|${trade.ticker}`),
      ...rawDividends
        .filter((dividend) => dividend.date >= start && dividend.date <= end)
        .map((dividend) => `${dividend.portfolioId}|${dividend.ticker}`),
    ]
  );
  const mergedSnapshotYearActivity = new Set(
    [
      ...rawTrades
        .filter((trade) => trade.tradeDate >= start && trade.tradeDate <= end)
        .map((trade) => trade.ticker),
      ...rawDividends
        .filter((dividend) => dividend.date >= start && dividend.date <= end)
        .map((dividend) => dividend.ticker),
    ]
  );

  const filteredRawSnapshots = rawSnapshots
    .map((snapshot) => ({
      ...snapshot,
      openingQty: normalizePositionQuantity(snapshot.openingQty),
      closingQty: normalizePositionQuantity(snapshot.closingQty),
    }))
    .filter((snapshot) =>
      shouldIncludeTaxReportSnapshot(
        snapshot,
        rawSnapshotYearActivity.has(`${snapshot.portfolioId}|${snapshot.ticker}`)
      )
    );

  const mergedSnapshots = mergeSnapshots(
    filteredRawSnapshots.map((snapshot) => ({
      ticker: snapshot.ticker,
      openingQty: snapshot.openingQty,
      openingPrice: snapshot.openingPrice,
      openingFxRate: snapshot.openingFxRate,
      closingQty: snapshot.closingQty,
      closingPrice: snapshot.closingPrice,
      closingFxRate: snapshot.closingFxRate,
    }))
  ).filter((snapshot) =>
    shouldIncludeTaxReportSnapshot(snapshot, mergedSnapshotYearActivity.has(snapshot.ticker))
  );

  const result = calculatePortfolioTax(
    mergedSnapshots,
    trades,
    dividends,
    exemptTickers,
    taxYear,
    trades
  );

  const snapshotsWithMeta: TaxReportSnapshot[] = filteredRawSnapshots.map((s) => ({
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
  const isPartialYear = new Date() < end;

  return {
    portfolioNames: portfolios.map((p) => p.name).sort(),
    taxYear,
    isPartialYear,
    snapshots: snapshotsWithMeta,
    result,
  };
}
