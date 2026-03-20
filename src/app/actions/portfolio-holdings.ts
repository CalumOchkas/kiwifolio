"use server";

import {
  computePortfolioHoldings,
  computeAllPortfoliosSummary,
  type PortfolioHoldingsResult,
  type PortfolioSummary,
} from "@/lib/portfolio-holdings";
import { applyStockSplits } from "@/app/actions/stock-splits";

export async function getPortfolioHoldings(
  portfolioId: string
): Promise<PortfolioHoldingsResult> {
  await applyStockSplits();
  return computePortfolioHoldings(portfolioId);
}

export async function getAllPortfoliosSummary(): Promise<{
  portfolios: Array<{
    id: string;
    name: string;
    summary: PortfolioSummary;
    holdingCount: number;
  }>;
  globalSummary: PortfolioSummary;
}> {
  await applyStockSplits();
  return computeAllPortfoliosSummary();
}
