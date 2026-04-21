"use server";

import { prisma } from "@/lib/prisma";
import { detectNegativePositionIssues } from "@/lib/data-issues";
import { revalidatePath } from "next/cache";

export interface SyncIssueRow {
  id: string;
  ticker: string;
  issueType: string;
  message: string;
  context: Record<string, string> | null;
  resolution: string;
  occurredAt: Date;
  resolvedAt: Date | null;
  canDismiss: boolean;
}

function mapIssue(
  i: Awaited<ReturnType<typeof prisma.syncIssue.findMany>>[number]
): SyncIssueRow {
  return {
    ...i,
    context: i.context ? JSON.parse(i.context) : null,
    canDismiss: true,
  };
}

async function getNegativePositionIssues(): Promise<SyncIssueRow[]> {
  const [portfolios, trades] = await Promise.all([
    prisma.portfolio.findMany({
      select: { id: true, name: true },
    }),
    prisma.trade.findMany({
      select: {
        id: true,
        portfolioId: true,
        ticker: true,
        tradeType: true,
        tradeDate: true,
        quantity: true,
      },
      orderBy: [{ tradeDate: "asc" }],
    }),
  ]);

  const portfolioNames = new Map(portfolios.map((portfolio) => [portfolio.id, portfolio.name]));

  return detectNegativePositionIssues(
    trades.map((trade) => ({
      id: trade.id,
      portfolioId: trade.portfolioId,
      ticker: trade.ticker,
      tradeType: trade.tradeType as "BUY" | "SELL",
      tradeDate: trade.tradeDate,
      quantity: trade.quantity,
    })),
    portfolioNames
  ).map((issue) => ({
    id: issue.id,
    ticker: issue.ticker,
    issueType: issue.issueType,
    message: issue.message,
    context: {
      portfolioId: issue.portfolioId,
      portfolioName: issue.portfolioName,
    },
    resolution: issue.resolution,
    occurredAt: issue.occurredAt,
    resolvedAt: null,
    canDismiss: false,
  }));
}

export async function getOpenIssues(): Promise<SyncIssueRow[]> {
  const [issues, negativePositionIssues] = await Promise.all([
    prisma.syncIssue.findMany({
      where: { resolvedAt: null },
      orderBy: { occurredAt: "desc" },
    }),
    getNegativePositionIssues(),
  ]);

  return [...issues.map(mapIssue), ...negativePositionIssues].sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()
  );
}

export async function getAllIssues(
  includeResolved = false
): Promise<SyncIssueRow[]> {
  const [issues, negativePositionIssues] = await Promise.all([
    prisma.syncIssue.findMany({
      where: includeResolved ? {} : { resolvedAt: null },
      orderBy: { occurredAt: "desc" },
    }),
    getNegativePositionIssues(),
  ]);

  return [...issues.map(mapIssue), ...negativePositionIssues].sort(
    (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()
  );
}

export async function resolveIssue(issueId: string): Promise<void> {
  await prisma.syncIssue.update({
    where: { id: issueId },
    data: { resolvedAt: new Date() },
  });
  revalidatePath("/settings/issues");
}

export async function resolveAllIssuesForTicker(
  ticker: string
): Promise<void> {
  await prisma.syncIssue.updateMany({
    where: { ticker, resolvedAt: null },
    data: { resolvedAt: new Date() },
  });
  revalidatePath("/settings/issues");
}

export async function getOpenIssueCount(): Promise<number> {
  const [storedIssueCount, negativePositionIssues] = await Promise.all([
    prisma.syncIssue.count({ where: { resolvedAt: null } }),
    getNegativePositionIssues(),
  ]);

  return storedIssueCount + negativePositionIssues.length;
}
