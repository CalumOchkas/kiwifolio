import { prisma } from "@/lib/prisma";
import { getInstrumentMeta } from "@/lib/market-data";

export async function backfillHoldingMetadata(
  portfolioId: string,
  tickers: string[]
): Promise<void> {
  const uniqueTickers = [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()))]
    .filter(Boolean)
    .sort();

  if (uniqueTickers.length === 0) {
    return;
  }

  const existingSettings = await prisma.holdingSettings.findMany({
    where: {
      portfolioId,
      ticker: { in: uniqueTickers },
    },
    select: {
      id: true,
      ticker: true,
      yahooSymbol: true,
      instrumentName: true,
      exchange: true,
    },
  });

  const settingsMap = new Map(existingSettings.map((setting) => [setting.ticker, setting]));

  await Promise.allSettled(
    uniqueTickers.map(async (ticker) => {
      const existing = settingsMap.get(ticker);
      const yahooSymbol = existing?.yahooSymbol ?? ticker;
      const meta = await getInstrumentMeta(yahooSymbol);

      if (!meta) {
        return;
      }

      const data: { instrumentName?: string; exchange?: string } = {};
      const instrumentName = meta.shortName || meta.longName;
      const exchange = meta.fullExchangeName || meta.exchange;

      if (!existing?.instrumentName && instrumentName) {
        data.instrumentName = instrumentName;
      }

      if (!existing?.exchange && exchange) {
        data.exchange = exchange;
      }

      if (existing) {
        if (Object.keys(data).length === 0) {
          return;
        }

        await prisma.holdingSettings.update({
          where: { id: existing.id },
          data,
        });
        return;
      }

      await prisma.holdingSettings.create({
        data: {
          portfolioId,
          ticker,
          ...data,
        },
      });
    })
  );
}