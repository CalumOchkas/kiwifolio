"use server";

import {
  computePortfolioHoldings,
  computeAllPortfoliosSummary,
  type PortfolioHoldingsResult,
  type PortfolioSummary,
} from "@/lib/portfolio-holdings";

export async function getPortfolioHoldings(
  portfolioId: string
): Promise<PortfolioHoldingsResult> {
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
  return computeAllPortfoliosSummary();
}
