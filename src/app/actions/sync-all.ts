"use server";

import { prisma } from "@/lib/prisma";
import {
  syncMarketData,
  getAvailableTaxYears,
} from "@/app/actions/sync-market-data";
import { applyStockSplits } from "@/app/actions/stock-splits";

export interface SyncAllResult {
  startedAt: string;
  completedAt: string;
  portfolioCount: number;
  taxYearCount: number;
  totalSynced: number;
  totalErrors: number;
  errors: { ticker: string; taxYear: string; message: string }[];
}

export async function syncAllData(): Promise<SyncAllResult> {
  const startedAt = new Date().toISOString();

  // 1. Apply stock splits first (forced)
  await applyStockSplits(true);

  // 2. Get all portfolios
  const portfolios = await prisma.portfolio.findMany({
    select: { id: true },
  });
  const portfolioIds = portfolios.map((p) => p.id);

  if (portfolioIds.length === 0) {
    return {
      startedAt,
      completedAt: new Date().toISOString(),
      portfolioCount: 0,
      taxYearCount: 0,
      totalSynced: 0,
      totalErrors: 0,
      errors: [],
    };
  }

  // 3. Get all available tax years
  const taxYears = await getAvailableTaxYears(portfolioIds);

  // 4. Sync each tax year
  let totalSynced = 0;
  let totalErrors = 0;
  const errors: { ticker: string; taxYear: string; message: string }[] = [];

  for (const taxYear of taxYears) {
    const result = await syncMarketData(portfolioIds, taxYear);
    for (const r of result.syncResults) {
      if (r.status === "synced") totalSynced++;
      if (r.status === "error") {
        totalErrors++;
        errors.push({
          ticker: r.ticker,
          taxYear,
          message: r.message ?? "Unknown",
        });
      }
    }
  }

  // 5. Update last_sync_at
  await prisma.appSetting.upsert({
    where: { key: "last_sync_at" },
    update: { value: String(Date.now()) },
    create: { key: "last_sync_at", value: String(Date.now()) },
  });

  return {
    startedAt,
    completedAt: new Date().toISOString(),
    portfolioCount: portfolioIds.length,
    taxYearCount: taxYears.length,
    totalSynced,
    totalErrors,
    errors,
  };
}
