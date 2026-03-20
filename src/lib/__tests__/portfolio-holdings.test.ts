import { describe, it, expect } from "vitest";
import {
  computeHoldingRows,
  type TradeInput,
  type DividendInput,
} from "../portfolio-holdings";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTrade(overrides: Partial<TradeInput> & { ticker: string }): TradeInput {
  return {
    tradeType: "BUY",
    quantity: 10,
    price: 100,
    brokerage: 0,
    currency: "USD",
    fxRateToNzd: 1.6,
    ...overrides,
  };
}

function makeDividend(overrides: Partial<DividendInput> & { ticker: string }): DividendInput {
  return {
    grossAmount: 50,
    fxRateToNzd: 1.6,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("computeHoldingRows", () => {
  it("computes a single BUY holding", () => {
    const trades = [makeTrade({ ticker: "AAPL" })];
    const { holdings, summary } = computeHoldingRows(
      trades,
      [],
      new Map([["AAPL", 150]]),
      new Map([["USD", 1.7]])
    );

    expect(holdings).toHaveLength(1);
    const h = holdings[0];
    expect(h.ticker).toBe("AAPL");
    expect(h.quantity).toBe(10);
    expect(h.avgCostPerShare).toBe(100);
    expect(h.avgCostFxRate).toBe(1.6);
    expect(h.costBaseNzd).toBe(10 * 100 * 1.6); // 1600
    expect(h.currentPrice).toBe(150);
    expect(h.currentFxRate).toBe(1.7);
    expect(h.marketValueNzd).toBe(10 * 150 * 1.7); // 2550
    expect(h.capitalGainNzd).toBeCloseTo(2550 - 1600); // 950
    expect(h.capitalGainPct).toBeCloseTo((950 / 1600) * 100);
  });

  it("computes weighted average cost across multiple BUYs", () => {
    const trades = [
      makeTrade({ ticker: "AAPL", quantity: 10, price: 100, fxRateToNzd: 1.5 }),
      makeTrade({ ticker: "AAPL", quantity: 10, price: 200, fxRateToNzd: 1.7 }),
    ];
    const { holdings } = computeHoldingRows(
      trades,
      [],
      new Map([["AAPL", 200]]),
      new Map([["USD", 1.6]])
    );

    expect(holdings).toHaveLength(1);
    const h = holdings[0];
    expect(h.quantity).toBe(20);
    expect(h.avgCostPerShare).toBe(150); // (10*100 + 10*200) / 20
    expect(h.avgCostFxRate).toBe(1.6); // (10*1.5 + 10*1.7) / 20
  });

  it("includes brokerage in average cost", () => {
    const trades = [
      makeTrade({ ticker: "AAPL", quantity: 10, price: 100, brokerage: 50 }),
    ];
    const { holdings } = computeHoldingRows(
      trades,
      [],
      new Map([["AAPL", 150]]),
      new Map([["USD", 1.6]])
    );

    const h = holdings[0];
    // effective price = 100 + 50/10 = 105
    expect(h.avgCostPerShare).toBe(105);
    expect(h.costBaseNzd).toBe(10 * 105 * 1.6);
  });

  it("handles partial SELL — reduces quantity, avg cost unchanged", () => {
    const trades = [
      makeTrade({ ticker: "AAPL", quantity: 20, price: 100 }),
      makeTrade({ ticker: "AAPL", tradeType: "SELL", quantity: 5 }),
    ];
    const { holdings } = computeHoldingRows(
      trades,
      [],
      new Map([["AAPL", 150]]),
      new Map([["USD", 1.6]])
    );

    expect(holdings).toHaveLength(1);
    expect(holdings[0].quantity).toBe(15);
    expect(holdings[0].avgCostPerShare).toBe(100); // unchanged
  });

  it("excludes fully-sold holdings from the list", () => {
    const trades = [
      makeTrade({ ticker: "AAPL", quantity: 10 }),
      makeTrade({ ticker: "AAPL", tradeType: "SELL", quantity: 10 }),
    ];
    const { holdings } = computeHoldingRows(
      trades,
      [],
      new Map(),
      new Map()
    );

    expect(holdings).toHaveLength(0);
  });

  it("handles null prices gracefully", () => {
    const trades = [makeTrade({ ticker: "AAPL" })];
    const { holdings, summary } = computeHoldingRows(
      trades,
      [],
      new Map([["AAPL", null]]),
      new Map([["USD", 1.6]])
    );

    expect(holdings).toHaveLength(1);
    expect(holdings[0].marketValueNzd).toBeNull();
    expect(holdings[0].capitalGainNzd).toBeNull();
    expect(holdings[0].totalReturnNzd).toBeNull();
    expect(summary.totalMarketValueNzd).toBeNull();
  });

  it("handles null FX rates gracefully", () => {
    const trades = [makeTrade({ ticker: "AAPL" })];
    const { holdings, summary } = computeHoldingRows(
      trades,
      [],
      new Map([["AAPL", 150]]),
      new Map([["USD", null]])
    );

    expect(holdings[0].marketValueNzd).toBeNull();
    expect(summary.totalMarketValueNzd).toBeNull();
  });

  it("aggregates dividends per ticker", () => {
    const trades = [makeTrade({ ticker: "AAPL" })];
    const dividends = [
      makeDividend({ ticker: "AAPL", grossAmount: 50, fxRateToNzd: 1.6 }),
      makeDividend({ ticker: "AAPL", grossAmount: 30, fxRateToNzd: 1.5 }),
    ];
    const { holdings } = computeHoldingRows(
      trades,
      dividends,
      new Map([["AAPL", 150]]),
      new Map([["USD", 1.7]])
    );

    // (50 * 1.6) + (30 * 1.5) = 80 + 45 = 125
    expect(holdings[0].totalDividendsNzd).toBeCloseTo(125);
  });

  it("computes total return including dividends", () => {
    const trades = [makeTrade({ ticker: "AAPL", quantity: 10, price: 100, fxRateToNzd: 1.6 })];
    const dividends = [makeDividend({ ticker: "AAPL", grossAmount: 50, fxRateToNzd: 1.6 })];

    const { holdings } = computeHoldingRows(
      trades,
      dividends,
      new Map([["AAPL", 150]]),
      new Map([["USD", 1.7]])
    );

    const h = holdings[0];
    const costBase = 10 * 100 * 1.6; // 1600
    const mv = 10 * 150 * 1.7; // 2550
    const capitalGain = mv - costBase; // 950
    const divNzd = 50 * 1.6; // 80
    expect(h.totalReturnNzd).toBeCloseTo(capitalGain + divNzd); // 1030
    expect(h.totalReturnPct).toBeCloseTo((1030 / 1600) * 100);
  });

  it("includes dividends from fully-sold tickers in summary total", () => {
    const trades = [
      makeTrade({ ticker: "AAPL", quantity: 10 }),
      makeTrade({ ticker: "AAPL", tradeType: "SELL", quantity: 10 }),
    ];
    const dividends = [
      makeDividend({ ticker: "AAPL", grossAmount: 100, fxRateToNzd: 1.5 }),
    ];
    const { holdings, summary } = computeHoldingRows(
      trades,
      dividends,
      new Map(),
      new Map()
    );

    expect(holdings).toHaveLength(0);
    expect(summary.totalDividendsNzd).toBe(150); // 100 * 1.5
  });

  it("computes portfolio summary totals correctly", () => {
    const trades = [
      makeTrade({ ticker: "AAPL", quantity: 10, price: 100, currency: "USD", fxRateToNzd: 1.6 }),
      makeTrade({ ticker: "MSFT", quantity: 5, price: 200, currency: "USD", fxRateToNzd: 1.6 }),
    ];
    const dividends = [
      makeDividend({ ticker: "AAPL", grossAmount: 40, fxRateToNzd: 1.6 }),
    ];

    const { summary } = computeHoldingRows(
      trades,
      dividends,
      new Map([["AAPL", 150], ["MSFT", 250]]),
      new Map([["USD", 1.7]])
    );

    const aaplCost = 10 * 100 * 1.6; // 1600
    const msftCost = 5 * 200 * 1.6;  // 1600
    const totalCost = aaplCost + msftCost; // 3200

    const aaplMV = 10 * 150 * 1.7; // 2550
    const msftMV = 5 * 250 * 1.7;  // 2125
    const totalMV = aaplMV + msftMV; // 4675

    const totalGain = totalMV - totalCost; // 1475
    const divNzd = 40 * 1.6; // 64

    expect(summary.totalCostBaseNzd).toBeCloseTo(totalCost);
    expect(summary.totalMarketValueNzd).toBeCloseTo(totalMV);
    expect(summary.totalCapitalGainNzd).toBeCloseTo(totalGain);
    expect(summary.totalCapitalGainPct).toBeCloseTo((totalGain / totalCost) * 100);
    expect(summary.totalDividendsNzd).toBeCloseTo(divNzd);
    expect(summary.totalReturnNzd).toBeCloseTo(totalGain + divNzd);
  });

  it("sorts holdings by market value descending", () => {
    const trades = [
      makeTrade({ ticker: "SMALL", quantity: 1, price: 10, currency: "USD", fxRateToNzd: 1 }),
      makeTrade({ ticker: "BIG", quantity: 100, price: 100, currency: "USD", fxRateToNzd: 1 }),
    ];
    const { holdings } = computeHoldingRows(
      trades,
      [],
      new Map([["SMALL", 10], ["BIG", 100]]),
      new Map([["USD", 1]])
    );

    expect(holdings[0].ticker).toBe("BIG");
    expect(holdings[1].ticker).toBe("SMALL");
  });

  it("returns empty holdings and zero summary for no trades", () => {
    const { holdings, summary } = computeHoldingRows([], [], new Map(), new Map());

    expect(holdings).toHaveLength(0);
    expect(summary.totalCostBaseNzd).toBe(0);
    expect(summary.totalMarketValueNzd).toBe(0);
    expect(summary.totalDividendsNzd).toBe(0);
  });

  it("handles multiple currencies correctly", () => {
    const trades = [
      makeTrade({ ticker: "AAPL", quantity: 10, price: 100, currency: "USD", fxRateToNzd: 1.6 }),
      makeTrade({ ticker: "BP.L", quantity: 20, price: 5, currency: "GBP", fxRateToNzd: 2.1 }),
    ];
    const { holdings } = computeHoldingRows(
      trades,
      [],
      new Map([["AAPL", 150], ["BP.L", 6]]),
      new Map([["USD", 1.7], ["GBP", 2.2]])
    );

    expect(holdings).toHaveLength(2);

    const aapl = holdings.find((h) => h.ticker === "AAPL")!;
    expect(aapl.currentFxRate).toBe(1.7);
    expect(aapl.marketValueNzd).toBe(10 * 150 * 1.7);

    const bp = holdings.find((h) => h.ticker === "BP.L")!;
    expect(bp.currentFxRate).toBe(2.2);
    expect(bp.marketValueNzd).toBe(20 * 6 * 2.2);
  });
});
