import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseCSV } from "@/lib/csv-import";
import type { BrokerFormat } from "@/lib/csv-import";
import { getFxRate, cacheTradeMarketData } from "@/lib/market-data";
import { revalidatePath } from "next/cache";

/**
 * POST /api/import-csv
 * Accepts a CSV file + portfolioId, auto-detects broker format,
 * resolves missing FX rates, deduplicates, and bulk-inserts records.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");
  const portfolioId = formData.get("portfolioId");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!portfolioId || typeof portfolioId !== "string") {
    return NextResponse.json({ error: "portfolioId is required" }, { status: 400 });
  }

  // Validate portfolio exists
  const portfolio = await prisma.portfolio.findUnique({
    where: { id: portfolioId },
    select: { id: true },
  });
  if (!portfolio) {
    return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
  }

  // Size check (5MB)
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }

  // Parse CSV
  const text = await file.text();
  const formatHint = formData.get("formatHint");
  const parsed = parseCSV(text, typeof formatHint === "string" ? formatHint as BrokerFormat : undefined);

  if (!parsed.format) {
    return NextResponse.json(
      { success: false, format: null, tradesImported: 0, dividendsImported: 0, warnings: parsed.warnings, errors: parsed.errors },
      { status: 400 }
    );
  }

  if (parsed.trades.length === 0 && parsed.dividends.length === 0) {
    return NextResponse.json(
      { success: false, format: parsed.format, tradesImported: 0, dividendsImported: 0, warnings: parsed.warnings, errors: [...parsed.errors, "No valid trade or dividend rows found"] },
      { status: 400 }
    );
  }

  const warnings = [...parsed.warnings];
  const errors = [...parsed.errors];

  // ── Resolve missing FX rates ────────────────────────────────────────────

  // Collect unique (currency, dateKey) pairs that need fetching
  const fxNeeded = new Map<string, { currency: string; date: Date }>();

  for (const t of parsed.trades) {
    if (t.fxRateToNzd === undefined && t.currency !== "NZD") {
      const key = `${t.currency}|${t.tradeDate.toISOString().split("T")[0]}`;
      if (!fxNeeded.has(key)) fxNeeded.set(key, { currency: t.currency, date: t.tradeDate });
    }
  }
  for (const d of parsed.dividends) {
    if (d.fxRateToNzd === undefined && d.currency !== "NZD") {
      const key = `${d.currency}|${d.date.toISOString().split("T")[0]}`;
      if (!fxNeeded.has(key)) fxNeeded.set(key, { currency: d.currency, date: d.date });
    }
  }

  // Batch-fetch FX rates (5 concurrent)
  const fxRateMap = new Map<string, number>();
  const fxEntries = [...fxNeeded.entries()];

  for (let i = 0; i < fxEntries.length; i += 5) {
    const batch = fxEntries.slice(i, i + 5);
    const results = await Promise.allSettled(
      batch.map(([, { currency, date }]) => getFxRate(currency, date))
    );

    for (let j = 0; j < batch.length; j++) {
      const [key, { currency, date }] = batch[j];
      const result = results[j];
      if (result.status === "fulfilled" && result.value !== null) {
        fxRateMap.set(key, result.value);
      } else {
        fxRateMap.set(key, 1.0);
        warnings.push(
          `FX rate not found for ${currency} on ${date.toISOString().split("T")[0]} — using 1.0, please update manually`
        );
      }
    }
  }

  // Resolve fxRateToNzd for each record
  function resolveFxRate(currency: string, date: Date, csvRate?: number): number {
    if (currency === "NZD") return 1;
    if (csvRate !== undefined && csvRate > 0) return csvRate;
    const key = `${currency}|${date.toISOString().split("T")[0]}`;
    return fxRateMap.get(key) ?? 1.0;
  }

  // ── Deduplicate against existing records ────────────────────────────────

  const existingTrades = await prisma.trade.findMany({
    where: { portfolioId },
    select: { ticker: true, tradeDate: true, quantity: true, price: true, tradeType: true },
  });
  const existingTradeKeys = new Set(
    existingTrades.map(
      (t) => `${t.ticker}|${t.tradeDate.toISOString()}|${t.quantity}|${t.price}|${t.tradeType}`
    )
  );

  const existingDividends = await prisma.dividend.findMany({
    where: { portfolioId },
    select: { ticker: true, date: true, grossAmount: true },
  });
  const existingDivKeys = new Set(
    existingDividends.map(
      (d) => `${d.ticker}|${d.date.toISOString()}|${d.grossAmount}`
    )
  );

  // ── Prepare records ─────────────────────────────────────────────────────

  const tradesToInsert = parsed.trades
    .filter((t) => {
      const key = `${t.ticker}|${t.tradeDate.toISOString()}|${t.quantity}|${t.price}|${t.tradeType}`;
      if (existingTradeKeys.has(key)) {
        warnings.push(`Skipped duplicate trade: ${t.ticker} ${t.tradeType} ${t.quantity}@${t.price} on ${t.tradeDate.toISOString().split("T")[0]}`);
        return false;
      }
      return true;
    })
    .map((t) => ({
      portfolioId,
      ticker: t.ticker,
      tradeType: t.tradeType,
      tradeDate: t.tradeDate,
      quantity: t.quantity,
      price: t.price,
      brokerage: t.brokerage,
      currency: t.currency,
      fxRateToNzd: resolveFxRate(t.currency, t.tradeDate, t.fxRateToNzd),
    }));

  const dividendsToInsert = parsed.dividends
    .filter((d) => {
      const key = `${d.ticker}|${d.date.toISOString()}|${d.grossAmount}`;
      if (existingDivKeys.has(key)) {
        warnings.push(`Skipped duplicate dividend: ${d.ticker} ${d.grossAmount} on ${d.date.toISOString().split("T")[0]}`);
        return false;
      }
      return true;
    })
    .map((d) => ({
      portfolioId,
      ticker: d.ticker,
      date: d.date,
      grossAmount: d.grossAmount,
      taxWithheld: d.taxWithheld,
      currency: d.currency,
      fxRateToNzd: resolveFxRate(d.currency, d.date, d.fxRateToNzd),
    }));

  // ── Insert atomically ───────────────────────────────────────────────────

  try {
    await prisma.$transaction(async (tx) => {
      if (tradesToInsert.length > 0) {
        await tx.trade.createMany({ data: tradesToInsert });
      }
      if (dividendsToInsert.length > 0) {
        await tx.dividend.createMany({ data: dividendsToInsert });
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        format: parsed.format,
        tradesImported: 0,
        dividendsImported: 0,
        warnings,
        errors: [...errors, error instanceof Error ? error.message : "Database insert failed"],
      },
      { status: 500 }
    );
  }

  // ── Fire-and-forget market data caching ─────────────────────────────────

  // ── Upsert instrument metadata into HoldingSettings ───────────────────
  const tickerMeta = new Map<string, { instrumentName?: string; exchange?: string }>();
  for (const t of parsed.trades) {
    if (!tickerMeta.has(t.ticker)) tickerMeta.set(t.ticker, {});
    const meta = tickerMeta.get(t.ticker)!;
    if (t.instrumentName && !meta.instrumentName) meta.instrumentName = t.instrumentName;
    if (t.exchange && !meta.exchange) meta.exchange = t.exchange;
  }
  for (const d of parsed.dividends) {
    if (!tickerMeta.has(d.ticker)) tickerMeta.set(d.ticker, {});
    const meta = tickerMeta.get(d.ticker)!;
    if (d.instrumentName && !meta.instrumentName) meta.instrumentName = d.instrumentName;
    if (d.exchange && !meta.exchange) meta.exchange = d.exchange;
  }

  for (const [ticker, meta] of tickerMeta) {
    if (!meta.instrumentName && !meta.exchange) continue;
    const existing = await prisma.holdingSettings.findUnique({
      where: { portfolioId_ticker: { portfolioId, ticker } },
      select: { instrumentName: true, exchange: true },
    });
    const updates: Record<string, string> = {};
    if (meta.instrumentName && !existing?.instrumentName) updates.instrumentName = meta.instrumentName;
    if (meta.exchange && !existing?.exchange) updates.exchange = meta.exchange;
    if (Object.keys(updates).length > 0) {
      await prisma.holdingSettings.upsert({
        where: { portfolioId_ticker: { portfolioId, ticker } },
        update: updates,
        create: { portfolioId, ticker, ...updates },
      });
    }
  }

  const uniqueCachePairs = new Map<string, { ticker: string; currency: string; date: Date }>();
  for (const t of tradesToInsert) {
    const key = `${t.ticker}|${t.currency}|${t.tradeDate.toISOString().split("T")[0]}`;
    if (!uniqueCachePairs.has(key)) {
      uniqueCachePairs.set(key, { ticker: t.ticker, currency: t.currency, date: t.tradeDate });
    }
  }
  for (const [, { ticker, currency, date }] of uniqueCachePairs) {
    cacheTradeMarketData(ticker, currency, date).catch(() => {});
  }

  revalidatePath(`/holdings/${portfolioId}`);
  revalidatePath("/settings/import");

  return NextResponse.json({
    success: true,
    format: parsed.format,
    tradesImported: tradesToInsert.length,
    dividendsImported: dividendsToInsert.length,
    warnings,
    errors,
  });
}
