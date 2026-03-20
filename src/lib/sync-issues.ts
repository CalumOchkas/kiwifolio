import { prisma } from "@/lib/prisma";

interface SyncResult {
  ticker: string;
  portfolioId: string;
  status: "synced" | "skipped" | "error";
  message?: string;
  yahooSymbol?: string;
}

/**
 * Record sync issues from market data sync results.
 * Auto-resolves issues for tickers that now sync OK.
 * Deduplicates by ticker + issueType (updates existing open issue).
 */
export async function recordSyncIssues(
  results: SyncResult[],
  taxYear: string
): Promise<void> {
  // Auto-resolve issues for tickers that synced without warnings
  const cleanTickers = results
    .filter((r) => r.status === "synced" && !r.message)
    .map((r) => r.ticker);

  if (cleanTickers.length > 0) {
    await prisma.syncIssue.updateMany({
      where: { ticker: { in: cleanTickers }, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
  }

  // Record new issues for errors and warnings
  for (const r of results) {
    const symbol = r.yahooSymbol ?? r.ticker;
    const symbolNote = r.yahooSymbol && r.yahooSymbol !== r.ticker
      ? ` (using Yahoo symbol "${r.yahooSymbol}")`
      : "";

    if (r.status === "error") {
      await upsertIssue({
        ticker: r.ticker,
        issueType: "SYNC_FAILED",
        message: r.message ?? "Sync failed",
        context: JSON.stringify({
          taxYear,
          portfolioId: r.portfolioId,
        }),
        resolution: `[${taxYear}] Sync failed for "${symbol}"${symbolNote}. Check if this is a valid Yahoo Finance symbol. Go to Holdings settings to set or update the Yahoo Symbol override.`,
      });
    } else if (r.status === "synced" && r.message) {
      // Has warnings (missing prices, FX rates)
      const msg = r.message;
      let issueType = "PRICE_MISSING";
      let resolution = `[${taxYear}] Could not find a price for "${symbol}"${symbolNote}. Try setting a Yahoo Symbol override in Holdings settings, or manually edit the snapshot on the Tax Report page.`;

      if (msg.includes("FX rate")) {
        issueType = "FX_RATE_MISSING";
        resolution = `[${taxYear}] FX rate could not be fetched for this currency. You can manually override the FX rate in the Tax Report snapshot editor.`;
      }

      await upsertIssue({
        ticker: r.ticker,
        issueType,
        message: msg,
        context: JSON.stringify({
          taxYear,
          portfolioId: r.portfolioId,
        }),
        resolution,
      });
    }
  }
}

/**
 * Record a stock split fetch failure as a sync issue.
 */
export async function recordSplitIssue(
  ticker: string,
  message: string
): Promise<void> {
  await upsertIssue({
    ticker,
    issueType: "SPLIT_FETCH_FAILED",
    message,
    resolution: `Could not check stock splits for "${ticker}". This is usually temporary. If it persists, verify the ticker symbol is valid on Yahoo Finance.`,
  });
}

/**
 * Upsert an issue: if an open issue for the same ticker+issueType exists,
 * update it instead of creating a duplicate.
 */
async function upsertIssue(data: {
  ticker: string;
  issueType: string;
  message: string;
  context?: string;
  resolution: string;
}): Promise<void> {
  const existing = await prisma.syncIssue.findFirst({
    where: {
      ticker: data.ticker,
      issueType: data.issueType,
      resolvedAt: null,
    },
  });

  if (existing) {
    await prisma.syncIssue.update({
      where: { id: existing.id },
      data: {
        message: data.message,
        context: data.context,
        resolution: data.resolution,
        occurredAt: new Date(),
      },
    });
  } else {
    await prisma.syncIssue.create({ data });
  }
}
