"use server";

import { prisma } from "@/lib/prisma";
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
}

function mapIssue(
  i: Awaited<ReturnType<typeof prisma.syncIssue.findMany>>[number]
): SyncIssueRow {
  return {
    ...i,
    context: i.context ? JSON.parse(i.context) : null,
  };
}

export async function getOpenIssues(): Promise<SyncIssueRow[]> {
  const issues = await prisma.syncIssue.findMany({
    where: { resolvedAt: null },
    orderBy: { occurredAt: "desc" },
  });
  return issues.map(mapIssue);
}

export async function getAllIssues(
  includeResolved = false
): Promise<SyncIssueRow[]> {
  const issues = await prisma.syncIssue.findMany({
    where: includeResolved ? {} : { resolvedAt: null },
    orderBy: { occurredAt: "desc" },
  });
  return issues.map(mapIssue);
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
  return prisma.syncIssue.count({ where: { resolvedAt: null } });
}
