import YahooFinance from "yahoo-finance2";
import { prisma } from "@/lib/prisma";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

type HistoricalRow = { date: Date; close: number };

// Normalize a date to midnight UTC for consistent cache keys
function toDateKey(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

/**
 * Fetch historical price data, returning array of rows.
 * Wraps yahoo-finance2 with explicit typing.
 */
async function fetchHistorical(
  symbol: string,
  period1: Date,
  period2: Date
): Promise<HistoricalRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await yahooFinance.historical(symbol, {
    period1,
    period2,
    interval: "1d",
  }, { validateResult: false });
  return result as HistoricalRow[];
}

/**
 * Fetch the historical FX rate for a currency to NZD on a given date.
 * Uses FxRateCache first; falls back to yahoo-finance2.
 * Yahoo pair format: e.g. USDNZD=X
 */
export async function getFxRate(
  currency: string,
  date: Date
): Promise<number | null> {
  if (currency === "NZD") return 1;

  const dateKey = toDateKey(date);

  // Check cache
  const cached = await prisma.fxRateCache.findUnique({
    where: { date_currency: { date: dateKey, currency } },
  });
  if (cached) return cached.rateNzd;

  // Fetch from Yahoo Finance
  try {
    const symbol = `${currency}NZD=X`;
    const nextDay = new Date(dateKey.getTime() + 86400000);

    let rows = await fetchHistorical(symbol, dateKey, nextDay);

    // If exact date not found (weekend/holiday), search backwards up to 5 days
    if (rows.length === 0) {
      const lookback = new Date(dateKey.getTime() - 5 * 86400000);
      rows = await fetchHistorical(symbol, lookback, nextDay);
    }

    if (rows.length > 0) {
      const rate = rows[rows.length - 1].close;
      if (rate != null) {
        await prisma.fxRateCache.upsert({
          where: { date_currency: { date: dateKey, currency } },
          update: { rateNzd: rate },
          create: { date: dateKey, currency, rateNzd: rate },
        });
        return rate;
      }
    }
  } catch (error) {
    console.error(
      `Failed to fetch FX rate for ${currency} on ${dateKey.toISOString()}:`,
      error
    );
  }

  return null;
}

/**
 * Fetch the historical EOD price for a ticker on a given date.
 * Uses EodPriceCache first; falls back to yahoo-finance2.
 */
export async function getEodPrice(
  ticker: string,
  date: Date
): Promise<number | null> {
  const dateKey = toDateKey(date);

  // Check cache
  const cached = await prisma.eodPriceCache.findUnique({
    where: { date_ticker: { date: dateKey, ticker } },
  });
  if (cached) return cached.price;

  // Fetch from Yahoo Finance
  try {
    const nextDay = new Date(dateKey.getTime() + 86400000);

    let rows = await fetchHistorical(ticker, dateKey, nextDay);

    // If exact date not found (weekend/holiday), search backwards up to 5 days
    if (rows.length === 0) {
      const lookback = new Date(dateKey.getTime() - 5 * 86400000);
      rows = await fetchHistorical(ticker, lookback, nextDay);
    }

    if (rows.length > 0) {
      let price = rows[rows.length - 1].close;
      if (price != null) {
        // Convert minor currency (e.g. GBp pence) to major (GBP pounds)
        const divisor = await getMinorCurrencyDivisor(ticker);
        price = price / divisor;

        await prisma.eodPriceCache.upsert({
          where: { date_ticker: { date: dateKey, ticker } },
          update: { price },
          create: { date: dateKey, ticker, price },
        });
        return price;
      }
    }
  } catch (error) {
    console.error(
      `Failed to fetch EOD price for ${ticker} on ${dateKey.toISOString()}:`,
      error
    );
  }

  return null;
}

/**
 * After a trade is saved, cache the EOD price and FX rate for that date.
 * Best-effort: does not throw if fetching fails.
 */
export async function cacheTradeMarketData(
  ticker: string,
  currency: string,
  tradeDate: Date
): Promise<void> {
  await Promise.allSettled([
    getEodPrice(ticker, tradeDate),
    getFxRate(currency, tradeDate),
  ]);
}

// ── Latest quote functions (for portfolio tracking) ──────────────────────────

interface CacheEntry {
  value: number;
  fetchedAt: number;
}

const latestPriceCache = new Map<string, CacheEntry>();
const latestFxCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function isCacheFresh(entry: CacheEntry | undefined): entry is CacheEntry {
  return !!entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS;
}

/**
 * Minor currency units used by some exchanges (e.g. London Stock Exchange
 * quotes in GBp = pence). Maps minor unit → { major, divisor }.
 */
const MINOR_CURRENCY_MAP: Record<string, { major: string; divisor: number }> = {
  GBp: { major: "GBP", divisor: 100 },
  GBX: { major: "GBP", divisor: 100 },
  ILA: { major: "ILS", divisor: 100 },
  ZAc: { major: "ZAR", divisor: 100 },
};

/**
 * In-memory cache for ticker quote currency (e.g. "GBp", "GBP", "USD").
 * Used to detect minor currency units for historical price conversion.
 */
const quoteCurrencyCache = new Map<string, { value: string | null; fetchedAt: number }>();

/**
 * Get the quote currency for a ticker from Yahoo Finance.
 * Needed because the historical() API doesn't return currency info,
 * so we can't otherwise detect pence vs pounds.
 */
async function getQuoteCurrency(ticker: string): Promise<string | null> {
  const cached = quoteCurrencyCache.get(ticker);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.value;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quote: any = await yahooFinance.quote(ticker, {}, { validateResult: false });
    const currency: string | null = quote?.currency ?? null;
    quoteCurrencyCache.set(ticker, { value: currency, fetchedAt: Date.now() });
    return currency;
  } catch {
    return null;
  }
}

/**
 * Get the minor currency divisor for a ticker (e.g. 100 for GBp-quoted LSE stocks).
 * Returns 1 if the ticker is quoted in a major currency.
 */
async function getMinorCurrencyDivisor(ticker: string): Promise<number> {
  const currency = await getQuoteCurrency(ticker);
  if (currency && MINOR_CURRENCY_MAP[currency]) {
    return MINOR_CURRENCY_MAP[currency].divisor;
  }
  return 1;
}

/**
 * Fetch the latest/current price for a ticker using the quote API.
 * Uses an in-memory cache with 1-hour TTL to avoid hammering Yahoo Finance.
 * Automatically converts minor currency units (GBp/GBX → GBP, etc.) to major units.
 */
export async function getLatestQuote(
  ticker: string
): Promise<number | null> {
  const cached = latestPriceCache.get(ticker);
  const staleValue = cached?.value ?? null;
  if (isCacheFresh(cached)) return cached.value;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quote: any = await yahooFinance.quote(ticker, {}, { validateResult: false });
    let price = quote?.regularMarketPrice;
    if (price != null && typeof price === "number") {
      // Convert minor currency (e.g. GBp pence) to major (GBP pounds)
      const quoteCurrency: string | undefined = quote?.currency;
      if (quoteCurrency && MINOR_CURRENCY_MAP[quoteCurrency]) {
        price = price / MINOR_CURRENCY_MAP[quoteCurrency].divisor;
      }
      latestPriceCache.set(ticker, { value: price, fetchedAt: Date.now() });
      return price;
    }
  } catch (error) {
    console.error(`Failed to fetch latest quote for ${ticker}:`, error);
  }

  // Stale cache fallback
  return staleValue;
}

/**
 * Fetch the latest FX rate for a currency to NZD using the quote API.
 * Uses an in-memory cache with 1-hour TTL.
 */
export async function getLatestFxRate(
  currency: string
): Promise<number | null> {
  if (currency === "NZD") return 1;

  const cached = latestFxCache.get(currency);
  const staleValue = cached?.value ?? null;
  if (isCacheFresh(cached)) return cached.value;

  try {
    const symbol = `${currency}NZD=X`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quote: any = await yahooFinance.quote(symbol, {}, { validateResult: false });
    const rate = quote?.regularMarketPrice;
    if (rate != null && typeof rate === "number") {
      latestFxCache.set(currency, { value: rate, fetchedAt: Date.now() });
      return rate;
    }
  } catch (error) {
    console.error(`Failed to fetch latest FX rate for ${currency}:`, error);
  }

  // Stale cache fallback
  return staleValue;
}

// ── Instrument Metadata ──────────────────────────────────────────────────

export interface InstrumentMeta {
  shortName: string | null;
  longName: string | null;
  exchange: string | null;
  fullExchangeName: string | null;
}

const metaCache = new Map<string, { value: InstrumentMeta; fetchedAt: number }>();

/**
 * Fetch instrument metadata (name, exchange) from Yahoo Finance quote API.
 * Uses an in-memory cache with 1-hour TTL.
 */
export async function getInstrumentMeta(
  ticker: string
): Promise<InstrumentMeta | null> {
  const cached = metaCache.get(ticker);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.value;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const quote: any = await yahooFinance.quote(ticker, {}, { validateResult: false });
    const meta: InstrumentMeta = {
      shortName: quote?.shortName ?? null,
      longName: quote?.longName ?? null,
      exchange: quote?.exchange ?? null,
      fullExchangeName: quote?.fullExchangeName ?? null,
    };
    metaCache.set(ticker, { value: meta, fetchedAt: Date.now() });
    return meta;
  } catch (error) {
    console.error(`Failed to fetch instrument metadata for ${ticker}:`, error);
    return null;
  }
}

// ── Stock Split Events ──────────────────────────────────────────────────────

export interface SplitEvent {
  date: Date;
  numerator: number;
  denominator: number;
  splitRatio: string;
}

/**
 * Fetch stock split events for a symbol since a given date.
 * Uses the chart() API which returns structured split data.
 */
export async function fetchSplitEvents(
  symbol: string,
  since: Date
): Promise<SplitEvent[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await yahooFinance.chart(symbol, {
      period1: since,
      period2: new Date(),
      interval: "1mo",
      events: "split",
    }, { validateResult: false });

    const splits: SplitEvent[] = [];
    const rawSplits = result?.events?.splits;
    if (Array.isArray(rawSplits)) {
      for (const s of rawSplits) {
        if (s.date && s.numerator && s.denominator) {
          splits.push({
            date: s.date instanceof Date ? s.date : new Date(s.date),
            numerator: s.numerator,
            denominator: s.denominator,
            splitRatio: s.splitRatio ?? `${s.numerator}:${s.denominator}`,
          });
        }
      }
    }

    // Sort chronologically
    splits.sort((a, b) => a.date.getTime() - b.date.getTime());
    return splits;
  } catch (error) {
    console.error(`Failed to fetch split events for ${symbol}:`, error);
    return [];
  }
}
