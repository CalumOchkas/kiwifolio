"use server";

import { backfillHoldingMetadata } from "@/lib/holding-metadata";
import { prisma } from "@/lib/prisma";
import { cacheTradeMarketData } from "@/lib/market-data";
import { revalidatePath } from "next/cache";

export async function createTrade(portfolioId: string, formData: FormData) {
  const ticker = (formData.get("ticker") as string)?.trim().toUpperCase();
  const tradeType = formData.get("tradeType") as string;
  const tradeDate = formData.get("tradeDate") as string;
  const quantity = parseFloat(formData.get("quantity") as string);
  const price = parseFloat(formData.get("price") as string);
  const brokerage = parseFloat(formData.get("brokerage") as string) || 0;
  const currency = (formData.get("currency") as string)?.trim().toUpperCase();
  const fxRateToNzd = parseFloat(formData.get("fxRateToNzd") as string);

  if (!ticker) throw new Error("Ticker is required");
  if (!tradeType || !["BUY", "SELL"].includes(tradeType))
    throw new Error("Trade type must be BUY or SELL");
  if (!tradeDate) throw new Error("Trade date is required");
  if (isNaN(quantity) || quantity <= 0) throw new Error("Quantity must be positive");
  if (isNaN(price) || price <= 0) throw new Error("Price must be positive");
  if (isNaN(fxRateToNzd) || fxRateToNzd <= 0)
    throw new Error("FX rate must be positive");
  if (!currency) throw new Error("Currency is required");

  await prisma.trade.create({
    data: {
      portfolioId,
      ticker,
      tradeType,
      tradeDate: new Date(tradeDate),
      quantity,
      price,
      brokerage,
      currency,
      fxRateToNzd,
    },
  });

  backfillHoldingMetadata(portfolioId, [ticker]).catch(() => {});

  // Best-effort: cache EOD price and FX rate for this trade date
  cacheTradeMarketData(ticker, currency, new Date(tradeDate)).catch(() => {});

  revalidatePath(`/holdings/${portfolioId}`);
}

export async function updateTrade(id: string, portfolioId: string, formData: FormData) {
  const ticker = (formData.get("ticker") as string)?.trim().toUpperCase();
  const tradeType = formData.get("tradeType") as string;
  const tradeDate = formData.get("tradeDate") as string;
  const quantity = parseFloat(formData.get("quantity") as string);
  const price = parseFloat(formData.get("price") as string);
  const brokerage = parseFloat(formData.get("brokerage") as string) || 0;
  const currency = (formData.get("currency") as string)?.trim().toUpperCase();
  const fxRateToNzd = parseFloat(formData.get("fxRateToNzd") as string);

  if (!ticker) throw new Error("Ticker is required");
  if (!tradeType || !["BUY", "SELL"].includes(tradeType))
    throw new Error("Trade type must be BUY or SELL");
  if (!tradeDate) throw new Error("Trade date is required");
  if (isNaN(quantity) || quantity <= 0) throw new Error("Quantity must be positive");
  if (isNaN(price) || price <= 0) throw new Error("Price must be positive");
  if (isNaN(fxRateToNzd) || fxRateToNzd <= 0)
    throw new Error("FX rate must be positive");
  if (!currency) throw new Error("Currency is required");

  await prisma.trade.update({
    where: { id },
    data: {
      ticker,
      tradeType,
      tradeDate: new Date(tradeDate),
      quantity,
      price,
      brokerage,
      currency,
      fxRateToNzd,
    },
  });

  backfillHoldingMetadata(portfolioId, [ticker]).catch(() => {});

  // Best-effort: cache EOD price and FX rate for this trade date
  cacheTradeMarketData(ticker, currency, new Date(tradeDate)).catch(() => {});

  revalidatePath(`/holdings/${portfolioId}`);
}

export async function deleteTrade(id: string, portfolioId: string) {
  await prisma.trade.delete({ where: { id } });
  revalidatePath(`/holdings/${portfolioId}`);
}
