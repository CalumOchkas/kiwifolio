import { describe, it, expect } from "vitest";
import YahooFinance from "yahoo-finance2";

/**
 * Integration tests for yahoo-finance2 API.
 * These hit the real Yahoo Finance API and confirm data comes back.
 * They may be slow or flaky depending on network/rate limits.
 */

const yahooFinance = new YahooFinance();

type HistoricalRow = { date: Date; close: number };

async function fetchHistorical(
  symbol: string,
  period1: Date,
  period2: Date
): Promise<HistoricalRow[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await yahooFinance.chart(symbol, {
    period1,
    period2,
    interval: "1d",
  });

  const quotes = Array.isArray(result?.quotes) ? result.quotes : [];

  return quotes
    .filter((quote: { date?: unknown; close?: unknown }) => {
      return quote.date != null && typeof quote.close === "number";
    })
    .map((quote: { date: Date | string | number; close: number }) => ({
      date: quote.date instanceof Date ? quote.date : new Date(quote.date),
      close: quote.close,
    }));
}

describe("yahoo-finance2 API integration", () => {
  it("fetches historical price for AAPL", async () => {
    // Use a known past date range (Mon-Fri to avoid weekend gaps)
    const rows = await fetchHistorical(
      "AAPL",
      new Date("2025-01-06"), // Monday
      new Date("2025-01-08")  // Wednesday
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].close).toBeGreaterThan(0);
    expect(rows[0].date).toBeInstanceOf(Date);
  }, 15000);

  it("fetches historical price for MSFT", async () => {
    const rows = await fetchHistorical(
      "MSFT",
      new Date("2025-01-06"),
      new Date("2025-01-08")
    );

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].close).toBeGreaterThan(0);
  }, 15000);

  it("fetches FX rate for USDNZD=X", async () => {
    const rows = await fetchHistorical(
      "USDNZD=X",
      new Date("2025-01-06"),
      new Date("2025-01-08")
    );

    expect(rows.length).toBeGreaterThan(0);
    // USD/NZD should be roughly 1.4-2.0
    expect(rows[0].close).toBeGreaterThan(1);
    expect(rows[0].close).toBeLessThan(3);
  }, 15000);

  it("fetches FX rate for AUDNZD=X", async () => {
    const rows = await fetchHistorical(
      "AUDNZD=X",
      new Date("2025-01-06"),
      new Date("2025-01-08")
    );

    expect(rows.length).toBeGreaterThan(0);
    // AUD/NZD should be roughly 1.0-1.2
    expect(rows[0].close).toBeGreaterThan(0.8);
    expect(rows[0].close).toBeLessThan(1.5);
  }, 15000);

  it("returns empty array for weekend-only date range", async () => {
    const rows = await fetchHistorical(
      "AAPL",
      new Date("2025-01-04"), // Saturday
      new Date("2025-01-05")  // Sunday
    );

    expect(rows.length).toBe(0);
  }, 15000);

  it("handles lookback for weekend dates", async () => {
    // Fetch a broader range that includes the preceding Friday
    const rows = await fetchHistorical(
      "AAPL",
      new Date("2025-01-01"), // Wednesday (but holiday)
      new Date("2025-01-06")  // Monday
    );

    // Should get at least Friday Jan 3's data
    expect(rows.length).toBeGreaterThan(0);
  }, 15000);
});
