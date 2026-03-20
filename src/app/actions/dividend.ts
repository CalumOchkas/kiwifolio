"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createDividend(portfolioId: string, formData: FormData) {
  const ticker = (formData.get("ticker") as string)?.trim().toUpperCase();
  const date = formData.get("date") as string;
  const grossAmount = parseFloat(formData.get("grossAmount") as string);
  const taxWithheld = parseFloat(formData.get("taxWithheld") as string) || 0;
  const currency = (formData.get("currency") as string)?.trim().toUpperCase();
  const fxRateToNzd = parseFloat(formData.get("fxRateToNzd") as string);

  if (!ticker) throw new Error("Ticker is required");
  if (!date) throw new Error("Date is required");
  if (isNaN(grossAmount) || grossAmount <= 0)
    throw new Error("Gross amount must be positive");
  if (isNaN(fxRateToNzd) || fxRateToNzd <= 0)
    throw new Error("FX rate must be positive");
  if (!currency) throw new Error("Currency is required");

  await prisma.dividend.create({
    data: {
      portfolioId,
      ticker,
      date: new Date(date),
      grossAmount,
      taxWithheld,
      currency,
      fxRateToNzd,
    },
  });
  revalidatePath(`/holdings/${portfolioId}`);
}

export async function updateDividend(
  id: string,
  portfolioId: string,
  formData: FormData
) {
  const ticker = (formData.get("ticker") as string)?.trim().toUpperCase();
  const date = formData.get("date") as string;
  const grossAmount = parseFloat(formData.get("grossAmount") as string);
  const taxWithheld = parseFloat(formData.get("taxWithheld") as string) || 0;
  const currency = (formData.get("currency") as string)?.trim().toUpperCase();
  const fxRateToNzd = parseFloat(formData.get("fxRateToNzd") as string);

  if (!ticker) throw new Error("Ticker is required");
  if (!date) throw new Error("Date is required");
  if (isNaN(grossAmount) || grossAmount <= 0)
    throw new Error("Gross amount must be positive");
  if (isNaN(fxRateToNzd) || fxRateToNzd <= 0)
    throw new Error("FX rate must be positive");
  if (!currency) throw new Error("Currency is required");

  await prisma.dividend.update({
    where: { id },
    data: {
      ticker,
      date: new Date(date),
      grossAmount,
      taxWithheld,
      currency,
      fxRateToNzd,
    },
  });
  revalidatePath(`/holdings/${portfolioId}`);
}

export async function deleteDividend(id: string, portfolioId: string) {
  await prisma.dividend.delete({ where: { id } });
  revalidatePath(`/holdings/${portfolioId}`);
}
