"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/**
 * Update a TaxYearSnapshot's price/FX fields manually.
 * Marks the row as isManuallyEdited = true so syncMarketData won't overwrite it.
 */
export async function updateSnapshot(
  snapshotId: string,
  data: {
    openingPrice: number;
    openingFxRate: number;
    closingPrice: number;
    closingFxRate: number;
  }
) {
  await prisma.taxYearSnapshot.update({
    where: { id: snapshotId },
    data: {
      openingPrice: data.openingPrice,
      openingFxRate: data.openingFxRate,
      closingPrice: data.closingPrice,
      closingFxRate: data.closingFxRate,
      isManuallyEdited: true,
    },
  });

  revalidatePath("/tax-report");
}

/**
 * Reset a snapshot's isManuallyEdited flag so syncMarketData can refresh it.
 */
export async function resetSnapshotOverride(snapshotId: string) {
  await prisma.taxYearSnapshot.update({
    where: { id: snapshotId },
    data: { isManuallyEdited: false },
  });

  revalidatePath("/tax-report");
}
