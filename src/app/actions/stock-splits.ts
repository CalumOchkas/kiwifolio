"use server";

import { prisma } from "@/lib/prisma";
import { fetchSplitEvents } from "@/lib/market-data";
import { recordSplitIssue } from "@/lib/sync-issues";
import { revalidatePath } from "next/cache";

export interface SplitResult {
  ticker: string;
  splitDate: string;
  splitRatio: string;
  tradesAdjusted: number;
  status: "applied" | "skipped" | "error";
  message?: string;
}

// Throttle: only check Yahoo for splits once per hour
let lastCheckedAt = 0;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function toDateKey(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

/**
 * Detect and apply stock splits for all tickers with trades.
 *
 * For each ticker:
 * 1. Fetch split events from Yahoo Finance (via chart API)
 * 2. Skip already-applied splits (tracked in AppliedSplit table)
 * 3. Adjust pre-split trades: multiply quantity by ratio, divide price by ratio
 * 4. Clear stale cached prices and snapshots for the ticker
 */
export async function applyStockSplits(force = false): Promise<SplitResult[]> {
  // Skip if checked recently (unless forced, e.g. from explicit sync)
  if (!force && Date.now() - lastCheckedAt < CHECK_INTERVAL_MS) {
    return [];
  }

  const results: SplitResult[] = [];

  // 1. Gather unique tickers with their earliest trade date
  const allTrades = await prisma.trade.findMany({
    select: { ticker: true, tradeDate: true },
    orderBy: { tradeDate: "asc" },
  });

  const tickerInfo = new Map<string, Date>();
  for (const t of allTrades) {
    if (!tickerInfo.has(t.ticker)) {
      tickerInfo.set(t.ticker, t.tradeDate);
    }
  }

  if (tickerInfo.size === 0) return results;

  // 2. Resolve Yahoo symbols from HoldingSettings
  const holdingSettings = await prisma.holdingSettings.findMany({
    where: { yahooSymbol: { not: null } },
    select: { ticker: true, yahooSymbol: true },
  });
  const yahooSymbolMap = new Map<string, string>();
  for (const s of holdingSettings) {
    if (s.yahooSymbol && !yahooSymbolMap.has(s.ticker)) {
      yahooSymbolMap.set(s.ticker, s.yahooSymbol);
    }
  }

  // 3. Load already-applied splits
  const appliedSplits = await prisma.appliedSplit.findMany();
  const appliedSet = new Set(
    appliedSplits.map((s) => `${s.ticker}|${toDateKey(s.splitDate).getTime()}`)
  );

  // 4. For each ticker, fetch and apply splits
  for (const [ticker, earliestDate] of tickerInfo) {
    const yahooSymbol = yahooSymbolMap.get(ticker) ?? ticker;

    let splits;
    try {
      splits = await fetchSplitEvents(yahooSymbol, earliestDate);
    } catch (err) {
      console.error(`Failed to fetch splits for ${ticker}:`, err);
      await recordSplitIssue(
        ticker,
        err instanceof Error ? err.message : "Failed to fetch split data"
      );
      results.push({
        ticker,
        splitDate: "",
        splitRatio: "",
        tradesAdjusted: 0,
        status: "error",
        message: "Failed to fetch split data",
      });
      continue;
    }

    for (const split of splits) {
      const splitDateKey = toDateKey(split.date);
      const dedupKey = `${ticker}|${splitDateKey.getTime()}`;

      if (appliedSet.has(dedupKey)) {
        continue; // Already applied
      }

      try {
        const ratio = split.numerator / split.denominator;
        let adjustedCount = 0;

        await prisma.$transaction(async (tx) => {
          // Find trades before the split date
          const tradesToAdjust = await tx.trade.findMany({
            where: {
              ticker,
              tradeDate: { lt: splitDateKey },
            },
            select: { id: true, quantity: true, price: true },
          });

          // Adjust each trade: quantity *= ratio, price /= ratio
          for (const trade of tradesToAdjust) {
            await tx.trade.update({
              where: { id: trade.id },
              data: {
                quantity: trade.quantity * ratio,
                price: trade.price / ratio,
              },
            });
          }

          // Clear stale EodPriceCache for this ticker
          await tx.eodPriceCache.deleteMany({
            where: { ticker },
          });

          // Clear non-manually-edited TaxYearSnapshots for this ticker
          await tx.taxYearSnapshot.deleteMany({
            where: {
              ticker,
              isManuallyEdited: false,
            },
          });

          // Record the applied split
          await tx.appliedSplit.create({
            data: {
              ticker,
              splitDate: splitDateKey,
              numerator: split.numerator,
              denominator: split.denominator,
              splitRatio: split.splitRatio,
              tradesAdjusted: tradesToAdjust.length,
            },
          });

          adjustedCount = tradesToAdjust.length;
        });

        appliedSet.add(dedupKey);

        results.push({
          ticker,
          splitDate: splitDateKey.toISOString().split("T")[0],
          splitRatio: split.splitRatio,
          tradesAdjusted: adjustedCount,
          status: "applied",
        });
      } catch (error) {
        results.push({
          ticker,
          splitDate: splitDateKey.toISOString().split("T")[0],
          splitRatio: split.splitRatio,
          tradesAdjusted: 0,
          status: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }
  }

  if (results.some((r) => r.status === "applied")) {
    revalidatePath("/");
    revalidatePath("/holdings");
    revalidatePath("/tax-report");
  }

  lastCheckedAt = Date.now();
  return results;
}
