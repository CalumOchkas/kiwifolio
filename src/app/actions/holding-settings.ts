"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function toggleFifExempt(
  portfolioId: string,
  ticker: string,
  isFifExempt: boolean
) {
  await prisma.holdingSettings.upsert({
    where: { portfolioId_ticker: { portfolioId, ticker } },
    update: { isFifExempt },
    create: { portfolioId, ticker, isFifExempt },
  });
  revalidatePath(`/holdings/${portfolioId}`);
}

export async function updateYahooSymbol(
  portfolioId: string,
  ticker: string,
  yahooSymbol: string
) {
  const value = yahooSymbol.trim() || null;
  await prisma.holdingSettings.upsert({
    where: { portfolioId_ticker: { portfolioId, ticker } },
    update: { yahooSymbol: value },
    create: { portfolioId, ticker, yahooSymbol: value },
  });
  revalidatePath(`/holdings/${portfolioId}`);
}
