/**
 * Portfolio Holdings Computation Engine
 *
 * Computes current holdings with market values, capital gains, dividends,
 * and returns using weighted average cost method.
 */

import { prisma } from "@/lib/prisma";
import { getLatestQuote, getLatestFxRate, getInstrumentMeta } from "@/lib/market-data";

// ── Types ────────────────────────────────────────────────────────────────────

export interface HoldingRow {
  ticker: string;
  instrumentName: string | null;
  exchange: string | null;
  currency: string;
  quantity: number;
  avgCostPerShare: number;
  avgCostFxRate: number;
  costBaseNzd: number;
  currentPrice: number | null;
  currentFxRate: number | null;
  marketValueNzd: number | null;
  capitalGainNzd: number | null;
  capitalGainPct: number | null;
  totalDividendsNzd: number;
  totalReturnNzd: number | null;
  totalReturnPct: number | null;
}

export interface PortfolioSummary {
  totalMarketValueNzd: number | null;
  totalCostBaseNzd: number;
  totalCapitalGainNzd: number | null;
  totalCapitalGainPct: number | null;
  totalDividendsNzd: number;
  totalReturnNzd: number | null;
  totalReturnPct: number | null;
}

export interface PortfolioHoldingsResult {
  holdings: HoldingRow[];
  summary: PortfolioSummary;
  priceErrors: string[];
}

// ── Trade/Dividend input types for the pure function ─────────────────────────

export interface TradeInput {
  ticker: string;
  tradeType: string;
  quantity: number;
  price: number;
  brokerage: number;
  currency: string;
  fxRateToNzd: number;
}

export interface DividendInput {
  ticker: string;
  grossAmount: number;
  fxRateToNzd: number;
}

// ── Pure computation (unit-testable, no DB/network) ──────────────────────────

export function computeHoldingRows(
  trades: TradeInput[],
  dividends: DividendInput[],
  latestPrices: Map<string, number | null>,
  latestFxRates: Map<string, number | null>,
  tickerMeta?: Map<string, { instrumentName: string | null; exchange: string | null }>
): { holdings: HoldingRow[]; summary: PortfolioSummary } {
  // Track per-ticker state
  const tickerState = new Map<
    string,
    { qty: number; avgCost: number; avgFx: number; currency: string }
  >();

  // Walk trades chronologically (caller must sort by tradeDate asc)
  for (const t of trades) {
    const state = tickerState.get(t.ticker) ?? {
      qty: 0,
      avgCost: 0,
      avgFx: 0,
      currency: t.currency,
    };

    if (t.tradeType === "BUY") {
      const effectivePrice = t.price + (t.quantity > 0 ? t.brokerage / t.quantity : 0);
      const newQty = state.qty + t.quantity;
      if (newQty > 0) {
        state.avgCost =
          (state.qty * state.avgCost + t.quantity * effectivePrice) / newQty;
        state.avgFx =
          (state.qty * state.avgFx + t.quantity * t.fxRateToNzd) / newQty;
      }
      state.qty = newQty;
      state.currency = t.currency;
    } else if (t.tradeType === "SELL") {
      state.qty = Math.max(0, state.qty - t.quantity);
    }

    tickerState.set(t.ticker, state);
  }

  // Aggregate dividends per ticker
  const divByTicker = new Map<string, number>();
  for (const d of dividends) {
    divByTicker.set(
      d.ticker,
      (divByTicker.get(d.ticker) ?? 0) + d.grossAmount * d.fxRateToNzd
    );
  }

  // Snap near-zero quantities to zero (floating point dust from matched buys/sells)
  for (const [, state] of tickerState) {
    if (Math.abs(state.qty) < 0.0001) state.qty = 0;
  }

  // Build holding rows for tickers with qty > 0
  const holdings: HoldingRow[] = [];
  let totalMV: number | null = 0;
  let totalCost = 0;
  let totalDiv = 0;
  let anyPriceMissing = false;

  for (const [ticker, state] of tickerState) {
    if (state.qty <= 0) continue;

    const costBaseNzd = state.qty * state.avgCost * state.avgFx;
    const currentPrice = latestPrices.get(ticker) ?? null;
    const currentFxRate = latestFxRates.get(state.currency) ?? null;

    let marketValueNzd: number | null = null;
    let capitalGainNzd: number | null = null;
    let capitalGainPct: number | null = null;

    if (currentPrice !== null && currentFxRate !== null) {
      marketValueNzd = state.qty * currentPrice * currentFxRate;
      capitalGainNzd = marketValueNzd - costBaseNzd;
      capitalGainPct = costBaseNzd > 0 ? (capitalGainNzd / costBaseNzd) * 100 : 0;
    } else {
      anyPriceMissing = true;
    }

    const tickerDiv = divByTicker.get(ticker) ?? 0;

    let totalReturnNzd: number | null = null;
    let totalReturnPct: number | null = null;
    if (capitalGainNzd !== null) {
      totalReturnNzd = capitalGainNzd + tickerDiv;
      totalReturnPct = costBaseNzd > 0 ? (totalReturnNzd / costBaseNzd) * 100 : 0;
    }

    const meta = tickerMeta?.get(ticker);
    holdings.push({
      ticker,
      instrumentName: meta?.instrumentName ?? null,
      exchange: meta?.exchange ?? null,
      currency: state.currency,
      quantity: state.qty,
      avgCostPerShare: state.avgCost,
      avgCostFxRate: state.avgFx,
      costBaseNzd,
      currentPrice,
      currentFxRate,
      marketValueNzd,
      capitalGainNzd,
      capitalGainPct,
      totalDividendsNzd: tickerDiv,
      totalReturnNzd,
      totalReturnPct,
    });

    if (marketValueNzd !== null && totalMV !== null) {
      totalMV += marketValueNzd;
    } else {
      anyPriceMissing = true;
    }
    totalCost += costBaseNzd;
    totalDiv += tickerDiv;
  }

  // Also include dividends from fully-sold tickers in the total
  for (const [ticker, divNzd] of divByTicker) {
    if (!tickerState.has(ticker) || (tickerState.get(ticker)!.qty <= 0)) {
      totalDiv += divNzd;
    }
  }

  // Sort holdings by market value descending (nulls last)
  holdings.sort((a, b) => (b.marketValueNzd ?? -1) - (a.marketValueNzd ?? -1));

  const finalMV = anyPriceMissing ? null : totalMV;
  const totalGain = finalMV !== null ? finalMV - totalCost : null;
  const totalGainPct = totalGain !== null && totalCost > 0 ? (totalGain / totalCost) * 100 : null;
  const totalReturn = totalGain !== null ? totalGain + totalDiv : null;
  const totalReturnPct = totalReturn !== null && totalCost > 0 ? (totalReturn / totalCost) * 100 : null;

  return {
    holdings,
    summary: {
      totalMarketValueNzd: finalMV,
      totalCostBaseNzd: totalCost,
      totalCapitalGainNzd: totalGain,
      totalCapitalGainPct: totalGainPct,
      totalDividendsNzd: totalDiv,
      totalReturnNzd: totalReturn,
      totalReturnPct: totalReturnPct,
    },
  };
}

// ── Async wrapper (fetches from DB + market data) ────────────────────────────

export async function computePortfolioHoldings(
  portfolioId: string
): Promise<PortfolioHoldingsResult> {
  const [trades, dividends, holdingSettings] = await Promise.all([
    prisma.trade.findMany({
      where: { portfolioId },
      orderBy: { tradeDate: "asc" },
    }),
    prisma.dividend.findMany({
      where: { portfolioId },
    }),
    prisma.holdingSettings.findMany({
      where: { portfolioId },
    }),
  ]);

  // Build symbol mapping: ticker -> yahooSymbol (or ticker itself)
  const symbolMap = new Map<string, string>();
  for (const s of holdingSettings) {
    if (s.yahooSymbol) {
      symbolMap.set(s.ticker, s.yahooSymbol);
    }
  }

  // Determine unique tickers with positive holdings and their currencies
  const tickerCurrency = new Map<string, string>();
  const qtyTracker = new Map<string, number>();
  for (const t of trades) {
    const qty = qtyTracker.get(t.ticker) ?? 0;
    qtyTracker.set(
      t.ticker,
      t.tradeType === "BUY" ? qty + t.quantity : Math.max(0, qty - t.quantity)
    );
    tickerCurrency.set(t.ticker, t.currency);
  }

  // Only fetch prices for tickers we currently hold
  const activeTickers = [...qtyTracker.entries()]
    .filter(([, qty]) => qty > 0.0001)
    .map(([ticker]) => ticker);

  const activeCurrencies = new Set(
    activeTickers.map((t) => tickerCurrency.get(t)!).filter(Boolean)
  );

  // Fetch latest prices and FX rates in parallel
  const priceErrors: string[] = [];

  const [priceResults, fxResults] = await Promise.all([
    Promise.allSettled(
      activeTickers.map(async (ticker) => {
        // Use yahooSymbol override if configured, otherwise use ticker directly
        const yahooSymbol = symbolMap.get(ticker) ?? ticker;
        const price = await getLatestQuote(yahooSymbol);
        return { ticker, price };
      })
    ),
    Promise.allSettled(
      [...activeCurrencies].map(async (currency) => {
        const rate = await getLatestFxRate(currency);
        return { currency, rate };
      })
    ),
  ]);

  const latestPrices = new Map<string, number | null>();
  for (const result of priceResults) {
    if (result.status === "fulfilled") {
      latestPrices.set(result.value.ticker, result.value.price);
      if (result.value.price === null) priceErrors.push(result.value.ticker);
    }
  }

  const latestFxRates = new Map<string, number | null>();
  for (const result of fxResults) {
    if (result.status === "fulfilled") {
      latestFxRates.set(result.value.currency, result.value.rate);
    }
  }

  const tradeInputs: TradeInput[] = trades.map((t) => ({
    ticker: t.ticker,
    tradeType: t.tradeType,
    quantity: t.quantity,
    price: t.price,
    brokerage: t.brokerage,
    currency: t.currency,
    fxRateToNzd: t.fxRateToNzd,
  }));

  const divInputs: DividendInput[] = dividends.map((d) => ({
    ticker: d.ticker,
    grossAmount: d.grossAmount,
    fxRateToNzd: d.fxRateToNzd,
  }));

  // Backfill missing instrument metadata from Yahoo Finance
  const tickerMeta = await backfillInstrumentMeta(holdingSettings, activeTickers, symbolMap);

  const { holdings, summary } = computeHoldingRows(
    tradeInputs,
    divInputs,
    latestPrices,
    latestFxRates,
    tickerMeta
  );

  return { holdings, summary, priceErrors };
}

// ── Lazy backfill: populate missing instrumentName/exchange from Yahoo ──────

async function backfillInstrumentMeta(
  holdingSettings: Array<{ id: string; ticker: string; yahooSymbol: string | null; instrumentName: string | null; exchange: string | null }>,
  activeTickers: string[],
  symbolMap: Map<string, string>
): Promise<Map<string, { instrumentName: string | null; exchange: string | null }>> {
  const tickerMeta = new Map<string, { instrumentName: string | null; exchange: string | null }>();
  for (const s of holdingSettings) {
    tickerMeta.set(s.ticker, {
      instrumentName: s.instrumentName ?? null,
      exchange: s.exchange ?? null,
    });
  }

  // Find active tickers missing metadata
  const needsMeta = holdingSettings.filter(
    (s) => activeTickers.includes(s.ticker) && (!s.instrumentName || !s.exchange)
  );

  if (needsMeta.length > 0) {
    await Promise.allSettled(
      needsMeta.map(async (s) => {
        const yahooSymbol = symbolMap.get(s.ticker) ?? s.ticker;
        const meta = await getInstrumentMeta(yahooSymbol);
        if (!meta) return;

        const updates: Record<string, string> = {};
        if (!s.instrumentName && (meta.shortName || meta.longName)) {
          const name = meta.shortName || meta.longName!;
          updates.instrumentName = name;
          tickerMeta.set(s.ticker, {
            ...tickerMeta.get(s.ticker)!,
            instrumentName: name,
          });
        }
        if (!s.exchange && (meta.fullExchangeName || meta.exchange)) {
          const exchange = meta.fullExchangeName || meta.exchange!;
          updates.exchange = exchange;
          tickerMeta.set(s.ticker, {
            ...tickerMeta.get(s.ticker)!,
            exchange,
          });
        }

        if (Object.keys(updates).length > 0) {
          await prisma.holdingSettings.update({
            where: { id: s.id },
            data: updates,
          });
        }
      })
    );
  }

  return tickerMeta;
}

export async function computeAllPortfoliosSummary(): Promise<{
  portfolios: Array<{
    id: string;
    name: string;
    summary: PortfolioSummary;
    holdingCount: number;
  }>;
  globalSummary: PortfolioSummary;
}> {
  const allPortfolios = await prisma.portfolio.findMany({
    orderBy: { name: "asc" },
  });

  const results = await Promise.all(
    allPortfolios.map(async (p) => {
      const { holdings, summary } = await computePortfolioHoldings(p.id);
      return { id: p.id, name: p.name, summary, holdingCount: holdings.length };
    })
  );

  // Aggregate global summary
  let globalMV: number | null = 0;
  let globalCost = 0;
  let globalDiv = 0;
  let anyNull = false;

  for (const r of results) {
    if (r.summary.totalMarketValueNzd !== null && globalMV !== null) {
      globalMV += r.summary.totalMarketValueNzd;
    } else {
      anyNull = true;
    }
    globalCost += r.summary.totalCostBaseNzd;
    globalDiv += r.summary.totalDividendsNzd;
  }

  const finalMV = anyNull ? null : globalMV;
  const totalGain = finalMV !== null ? finalMV - globalCost : null;
  const totalGainPct = totalGain !== null && globalCost > 0 ? (totalGain / globalCost) * 100 : null;
  const totalReturn = totalGain !== null ? totalGain + globalDiv : null;
  const totalReturnPct = totalReturn !== null && globalCost > 0 ? (totalReturn / globalCost) * 100 : null;

  return {
    portfolios: results,
    globalSummary: {
      totalMarketValueNzd: finalMV,
      totalCostBaseNzd: globalCost,
      totalCapitalGainNzd: totalGain,
      totalCapitalGainPct: totalGainPct,
      totalDividendsNzd: globalDiv,
      totalReturnNzd: totalReturn,
      totalReturnPct: totalReturnPct,
    },
  };
}
