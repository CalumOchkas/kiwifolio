"use server";

import { prisma } from "@/lib/prisma";
import { getEodPrice, getFxRate } from "@/lib/market-data";
import { deriveAvailableTaxYears } from "@/lib/tax-years";
import { applyStockSplits, type SplitResult } from "@/app/actions/stock-splits";
import { recordSyncIssues } from "@/lib/sync-issues";
import { revalidatePath } from "next/cache";

/**
 * Parse a tax year string like "2024-2025" into start/end dates.
 * FIF tax year: April 1 of first year to March 31 of second year.
 */
function parseTaxYear(taxYear: string): { start: Date; end: Date } {
  const [startYear, endYear] = taxYear.split("-").map(Number);
  if (!startYear || !endYear || endYear !== startYear + 1) {
    throw new Error(`Invalid tax year format: ${taxYear}. Expected "YYYY-YYYY".`);
  }
  return {
    start: new Date(Date.UTC(startYear, 3, 1)), // April 1
    end: new Date(Date.UTC(endYear, 2, 31)),     // March 31
  };
}

/**
 * Calculate the quantity held for a ticker at a given date,
 * based on all trades up to and including that date.
 */
function calculateQtyAtDate(
  trades: { tradeType: string; quantity: number; tradeDate: Date }[],
  asOfDate: Date
): number {
  return trades
    .filter((t) => t.tradeDate <= asOfDate)
    .reduce((qty, t) => {
      return t.tradeType === "BUY" ? qty + t.quantity : qty - t.quantity;
    }, 0);
}

/**
 * Sync Market Data: populate TaxYearSnapshot for the selected portfolios and tax year.
 *
 * For each (portfolio, ticker) pair with trades in/before the tax year:
 * - Opening: qty on April 1, price on March 31 of PRIOR year, FX on March 31 of PRIOR year
 * - Closing: qty on March 31, price on March 31, FX on March 31
 *
 * Prices and FX rates are cached per-ticker so the same ticker across multiple
 * portfolios only triggers one API fetch.
 *
 * Skips rows that have been manually edited (isManuallyEdited = true).
 */
export async function syncMarketData(portfolioIds: string[], taxYear: string) {
  // Apply any pending stock splits before syncing snapshots
  const splitResults = await applyStockSplits(true);

  const { start, end } = parseTaxYear(taxYear);

  // For a tax year that hasn't ended yet, use today as the effective closing date
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const isPartialYear = today < end;
  const effectiveEnd = isPartialYear ? today : end;

  const openingPriceDate = new Date(Date.UTC(start.getUTCFullYear(), 2, 31));
  const closingPriceDate = effectiveEnd;

  // Get all trades for selected portfolios up to effective end date
  const allTrades = await prisma.trade.findMany({
    where: {
      portfolioId: { in: portfolioIds },
      tradeDate: { lte: effectiveEnd },
    },
    orderBy: { tradeDate: "asc" },
  });

  // Build (portfolioId, ticker) pairs with their trades
  const pairMap = new Map<string, { portfolioId: string; ticker: string; currency: string; trades: typeof allTrades }>();
  for (const trade of allTrades) {
    const key = `${trade.portfolioId}|${trade.ticker}`;
    const existing = pairMap.get(key);
    if (existing) {
      existing.trades.push(trade);
    } else {
      pairMap.set(key, {
        portfolioId: trade.portfolioId,
        ticker: trade.ticker,
        currency: trade.currency,
        trades: [trade],
      });
    }
  }

  // Load Yahoo symbol overrides from HoldingSettings
  const holdingSettings = await prisma.holdingSettings.findMany({
    where: { portfolioId: { in: portfolioIds } },
    select: { portfolioId: true, ticker: true, yahooSymbol: true },
  });
  const symbolMap = new Map<string, string>();
  for (const s of holdingSettings) {
    if (s.yahooSymbol) {
      const key = `${s.portfolioId}|${s.ticker}`;
      symbolMap.set(key, s.yahooSymbol);
    }
  }

  // Cache market data per yahoo symbol to avoid duplicate fetches
  const priceCache = new Map<string, { openingPrice: number | null; closingPrice: number | null; openingFxRate: number | null; closingFxRate: number | null }>();

  const results: {
    ticker: string;
    portfolioId: string;
    status: "synced" | "skipped" | "error";
    message?: string;
    yahooSymbol?: string;
  }[] = [];

  for (const [, { portfolioId, ticker, currency, trades }] of pairMap) {
    // Check if manually edited — skip
    const existing = await prisma.taxYearSnapshot.findUnique({
      where: {
        portfolioId_taxYear_ticker: { portfolioId, taxYear, ticker },
      },
    });

    if (existing?.isManuallyEdited) {
      results.push({ ticker, portfolioId, status: "skipped", message: "Manually edited" });
      continue;
    }

    // Calculate per-portfolio quantities
    const openingQty = calculateQtyAtDate(trades, new Date(start.getTime() - 1));
    const closingQty = calculateQtyAtDate(trades, effectiveEnd);

    // Skip if no position at either end and no trades during the year
    if (openingQty === 0 && closingQty === 0) {
      const tradesInYear = trades.filter(
        (t) => t.tradeDate >= start && t.tradeDate <= effectiveEnd
      );
      if (tradesInYear.length === 0) continue;
    }

    // Resolve Yahoo symbol (use override if configured, otherwise raw ticker)
    const yahooSymbol = symbolMap.get(`${portfolioId}|${ticker}`) ?? ticker;

    try {
      // Fetch prices/FX only once per yahoo symbol
      if (!priceCache.has(yahooSymbol)) {
        const [op, cp, ofx, cfx] = await Promise.all([
          openingQty > 0 ? getEodPrice(yahooSymbol, openingPriceDate) : Promise.resolve(0),
          closingQty > 0 ? getEodPrice(yahooSymbol, closingPriceDate) : Promise.resolve(0),
          openingQty > 0 ? getFxRate(currency, openingPriceDate) : Promise.resolve(1),
          closingQty > 0 ? getFxRate(currency, closingPriceDate) : Promise.resolve(1),
        ]);
        priceCache.set(yahooSymbol, {
          openingPrice: op,
          closingPrice: cp,
          openingFxRate: ofx,
          closingFxRate: cfx,
        });
      }

      const cached = priceCache.get(yahooSymbol)!;

      // For tickers already cached but this portfolio has different qty needs,
      // fetch any prices that were skipped (e.g., opening price was 0 because first portfolio had no opening position)
      let { openingPrice, closingPrice, openingFxRate, closingFxRate } = cached;
      if (openingQty > 0 && openingPrice === 0 && !existing) {
        openingPrice = await getEodPrice(yahooSymbol, openingPriceDate);
        openingFxRate = await getFxRate(currency, openingPriceDate);
      }
      if (closingQty > 0 && closingPrice === 0 && !existing) {
        closingPrice = await getEodPrice(yahooSymbol, closingPriceDate);
        closingFxRate = await getFxRate(currency, closingPriceDate);
      }

      await prisma.taxYearSnapshot.upsert({
        where: {
          portfolioId_taxYear_ticker: { portfolioId, taxYear, ticker },
        },
        update: {
          openingQty,
          openingPrice: openingPrice ?? 0,
          openingFxRate: openingFxRate ?? 1,
          closingQty,
          closingPrice: closingPrice ?? 0,
          closingFxRate: closingFxRate ?? 1,
          isManuallyEdited: false,
        },
        create: {
          portfolioId,
          taxYear,
          ticker,
          openingQty,
          openingPrice: openingPrice ?? 0,
          openingFxRate: openingFxRate ?? 1,
          closingQty,
          closingPrice: closingPrice ?? 0,
          closingFxRate: closingFxRate ?? 1,
        },
      });

      const warnings: string[] = [];
      if (openingPrice === null && openingQty > 0) warnings.push("opening price not found");
      if (closingPrice === null && closingQty > 0) warnings.push("closing price not found");
      if (openingFxRate === null && openingQty > 0) warnings.push("opening FX rate not found");
      if (closingFxRate === null && closingQty > 0) warnings.push("closing FX rate not found");

      results.push({
        ticker,
        portfolioId,
        yahooSymbol,
        status: "synced",
        message: warnings.length > 0 ? `Warnings: ${warnings.join(", ")}` : undefined,
      });
    } catch (error) {
      results.push({
        ticker,
        portfolioId,
        yahooSymbol,
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Record sync issues for the issues page
  await recordSyncIssues(results, taxYear);

  revalidatePath(`/tax-report`);
  return {
    syncResults: results,
    splitResults: splitResults.filter((r) => r.status === "applied"),
  };
}

/**
 * Get available tax years across selected portfolios based on their trades.
 */
export async function getAvailableTaxYears(portfolioIds: string[]): Promise<string[]> {
  if (portfolioIds.length === 0) return [];

  const trades = await prisma.trade.findMany({
    where: { portfolioId: { in: portfolioIds } },
    select: {
      portfolioId: true,
      ticker: true,
      tradeType: true,
      quantity: true,
      tradeDate: true,
    },
    orderBy: { tradeDate: "asc" },
  });

  return deriveAvailableTaxYears(trades);
}
