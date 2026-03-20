import { describe, it, expect } from "vitest";
import {
  calculateTickerFdr,
  calculateTickerCv,
  calculateDeMinimis,
  calculateFtc,
  calculatePortfolioTax,
  parseTaxYearRange,
  type SnapshotData,
  type TradeData,
  type DividendData,
} from "../fif-tax";

// ── Helpers ──────────────────────────────────────────────────────────────────

const d = (s: string) => new Date(s + "T00:00:00Z");
const TY = "2024-2025"; // April 1 2024 – March 31 2025
const TY_START = d("2024-04-01");
const TY_END = d("2025-03-31");

function makeTrade(overrides: Partial<TradeData> & { ticker: string }): TradeData {
  return {
    tradeType: "BUY",
    tradeDate: d("2024-06-01"),
    quantity: 10,
    price: 100,
    brokerage: 0,
    currency: "USD",
    fxRateToNzd: 1.6,
    ...overrides,
  };
}

function makeSnapshot(overrides: Partial<SnapshotData> & { ticker: string }): SnapshotData {
  return {
    openingQty: 0,
    openingPrice: 0,
    openingFxRate: 1.6,
    closingQty: 0,
    closingPrice: 0,
    closingFxRate: 1.6,
    ...overrides,
  };
}

function makeDiv(overrides: Partial<DividendData> & { ticker: string }): DividendData {
  return {
    date: d("2024-09-15"),
    grossAmount: 50,
    taxWithheld: 7.5,
    fxRateToNzd: 1.6,
    ...overrides,
  };
}

// ── parseTaxYearRange ────────────────────────────────────────────────────────

describe("parseTaxYearRange", () => {
  it("parses 2024-2025 correctly", () => {
    const { start, end } = parseTaxYearRange("2024-2025");
    expect(start.toISOString()).toBe("2024-04-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2025-03-31T00:00:00.000Z");
  });

  it("throws on invalid format", () => {
    expect(() => parseTaxYearRange("2024")).toThrow();
    expect(() => parseTaxYearRange("2024-2026")).toThrow();
  });
});

// ── FDR (Section 3.3) ───────────────────────────────────────────────────────

describe("calculateTickerFdr", () => {
  it("calculates base FDR with no trades in year", () => {
    const snapshot = makeSnapshot({
      ticker: "AAPL",
      openingQty: 100,
      openingPrice: 150,
      openingFxRate: 1.6,
    });

    const result = calculateTickerFdr(snapshot, [], [], TY_START, TY_END);

    // Opening Value = 100 * 150 * 1.6 = 24,000 NZD
    // FDR = 24,000 * 0.05 = 1,200
    expect(result.openingValueNzd).toBe(24000);
    expect(result.baseCalculation).toBe(1200);
    expect(result.quickSaleAdjustment).toBe(0);
    expect(result.totalFdrIncome).toBe(1200);
  });

  it("returns 0 when no opening position", () => {
    const snapshot = makeSnapshot({
      ticker: "AAPL",
      openingQty: 0,
      closingQty: 50,
      closingPrice: 160,
    });

    const result = calculateTickerFdr(snapshot, [], [], TY_START, TY_END);
    expect(result.totalFdrIncome).toBe(0);
  });

  it("calculates quick sale adjustment when bought and sold in year", () => {
    const snapshot = makeSnapshot({
      ticker: "AAPL",
      openingQty: 100,
      openingPrice: 150,
      openingFxRate: 1.6,
      closingQty: 100,
      closingPrice: 180,
      closingFxRate: 1.6,
    });

    // Buy 20 shares at $160, then sell 10 at $180 during the year
    const trades: TradeData[] = [
      makeTrade({
        ticker: "AAPL",
        tradeType: "BUY",
        tradeDate: d("2024-06-01"),
        quantity: 20,
        price: 160,
        brokerage: 0,
        fxRateToNzd: 1.6,
      }),
      makeTrade({
        ticker: "AAPL",
        tradeType: "SELL",
        tradeDate: d("2024-09-01"),
        quantity: 10,
        price: 180,
        brokerage: 0,
        fxRateToNzd: 1.6,
      }),
    ];

    const result = calculateTickerFdr(snapshot, trades, [], TY_START, TY_END);

    // Base = 100 * 150 * 1.6 * 0.05 = 1200
    expect(result.baseCalculation).toBe(1200);

    // Peak: start 100, buy 20 -> 120, sell 10 -> 110. Peak = 120
    // Peak Holding Differential = 120 - 100 = 20
    // Quick Sale Qty = min(20 bought, 10 sold) = 10
    // Avg cost of buys = (20 * 160 * 1.6) / 20 = 256 NZD per share
    // Option 1 = 0.05 * 20 * 256 = 256
    // Option 2 = (10 * 180 * 1.6 * 10/10) + 0 - (256 * 10)
    //          = 2880 + 0 - 2560 = 320
    // Adjustment = min(256, 320) = 256
    expect(result.quickSaleAdjustment).toBe(256);
    expect(result.totalFdrIncome).toBe(1456);
  });

  it("no quick sale if only buys in year", () => {
    const snapshot = makeSnapshot({
      ticker: "AAPL",
      openingQty: 50,
      openingPrice: 150,
      openingFxRate: 1.6,
    });

    const trades = [
      makeTrade({ ticker: "AAPL", tradeType: "BUY", quantity: 10 }),
    ];

    const result = calculateTickerFdr(snapshot, trades, [], TY_START, TY_END);
    expect(result.quickSaleAdjustment).toBe(0);
  });
});

// ── CV (Section 3.4) ────────────────────────────────────────────────────────

describe("calculateTickerCv", () => {
  it("calculates CV with opening and closing values only", () => {
    const snapshot = makeSnapshot({
      ticker: "AAPL",
      openingQty: 100,
      openingPrice: 150,
      openingFxRate: 1.6,
      closingQty: 100,
      closingPrice: 180,
      closingFxRate: 1.7,
    });

    const result = calculateTickerCv(snapshot, [], [], TY_START, TY_END);

    // Opening = 100 * 150 * 1.6 = 24,000
    // Closing = 100 * 180 * 1.7 = 30,600
    // CV = 30600 - 24000 = 6,600
    expect(result.openingValueNzd).toBe(24000);
    expect(result.closingValueNzd).toBe(30600);
    expect(result.cvIncome).toBe(6600);
  });

  it("calculates CV with trades and dividends", () => {
    const snapshot = makeSnapshot({
      ticker: "AAPL",
      openingQty: 100,
      openingPrice: 150,
      openingFxRate: 1.6,
      closingQty: 120,
      closingPrice: 160,
      closingFxRate: 1.6,
    });

    const trades: TradeData[] = [
      makeTrade({
        ticker: "AAPL",
        tradeType: "BUY",
        tradeDate: d("2024-07-01"),
        quantity: 30,
        price: 155,
        brokerage: 10,
        fxRateToNzd: 1.6,
      }),
      makeTrade({
        ticker: "AAPL",
        tradeType: "SELL",
        tradeDate: d("2024-10-01"),
        quantity: 10,
        price: 170,
        brokerage: 10,
        fxRateToNzd: 1.6,
      }),
    ];

    const dividends = [
      makeDiv({ ticker: "AAPL", grossAmount: 100, fxRateToNzd: 1.6 }),
    ];

    const result = calculateTickerCv(snapshot, trades, dividends, TY_START, TY_END);

    // Opening = 100 * 150 * 1.6 = 24,000
    // Closing = 120 * 160 * 1.6 = 30,720
    // Sales = (10 * 170 - 10) * 1.6 = 1690 * 1.6 = 2,704
    // Purchases = (30 * 155 + 10) * 1.6 = 4660 * 1.6 = 7,456
    // Dividends = 100 * 1.6 = 160
    // CV = 30720 + 2704 + 160 - 24000 - 7456 = 2,128
    expect(result.openingValueNzd).toBe(24000);
    expect(result.closingValueNzd).toBe(30720);
    expect(result.salesProceedsNzd).toBe(2704);
    expect(result.purchaseCostsNzd).toBe(7456);
    expect(result.dividendsNzd).toBe(160);
    expect(result.cvIncome).toBe(2128);
  });

  it("allows negative per-ticker CV income", () => {
    const snapshot = makeSnapshot({
      ticker: "AAPL",
      openingQty: 100,
      openingPrice: 200,
      openingFxRate: 1.6,
      closingQty: 100,
      closingPrice: 100,
      closingFxRate: 1.6,
    });

    const result = calculateTickerCv(snapshot, [], [], TY_START, TY_END);

    // Opening = 32,000, Closing = 16,000
    expect(result.cvIncome).toBe(-16000);
  });
});

// ── De Minimis (Section 3.2) ────────────────────────────────────────────────

describe("calculateDeMinimis", () => {
  it("eligible when cost basis under 50k", () => {
    const trades = [
      makeTrade({
        ticker: "AAPL",
        tradeDate: d("2024-06-01"),
        quantity: 100,
        price: 100,
        fxRateToNzd: 1.6,
      }),
    ];
    // Cost = 100 * 100 * 1.6 = 16,000 < 50,000

    const result = calculateDeMinimis(trades, new Set(), TY_START, TY_END);
    expect(result.eligible).toBe(true);
    expect(result.maxCostBasis).toBe(16000);
  });

  it("not eligible when cost basis over 50k", () => {
    const trades = [
      makeTrade({
        ticker: "AAPL",
        tradeDate: d("2024-06-01"),
        quantity: 200,
        price: 200,
        fxRateToNzd: 1.6,
      }),
    ];
    // Cost = 200 * 200 * 1.6 = 64,000 > 50,000

    const result = calculateDeMinimis(trades, new Set(), TY_START, TY_END);
    expect(result.eligible).toBe(false);
    expect(result.maxCostBasis).toBe(64000);
  });

  it("excludes exempt tickers", () => {
    const trades = [
      makeTrade({
        ticker: "BHP.AX",
        tradeDate: d("2024-06-01"),
        quantity: 200,
        price: 200,
        fxRateToNzd: 1.1,
      }),
    ];
    // Would be 44,000 but ticker is exempt

    const result = calculateDeMinimis(
      trades,
      new Set(["BHP.AX"]),
      TY_START,
      TY_END
    );
    expect(result.eligible).toBe(true);
    expect(result.maxCostBasis).toBe(0);
  });

  it("tracks cost basis from pre-year trades", () => {
    const trades = [
      makeTrade({
        ticker: "AAPL",
        tradeDate: d("2024-01-15"), // before tax year
        quantity: 200,
        price: 200,
        fxRateToNzd: 1.6,
      }),
    ];
    // Pre-year cost basis = 64,000

    const result = calculateDeMinimis(trades, new Set(), TY_START, TY_END);
    expect(result.eligible).toBe(false);
    expect(result.maxCostBasis).toBe(64000);
  });
});

// ── FTC (Section 3.5) ───────────────────────────────────────────────────────

describe("calculateFtc", () => {
  it("sums tax withheld in NZD", () => {
    const dividends = [
      makeDiv({ ticker: "AAPL", taxWithheld: 15, fxRateToNzd: 1.6 }),
      makeDiv({ ticker: "MSFT", taxWithheld: 10, fxRateToNzd: 1.6 }),
    ];

    const result = calculateFtc(dividends, TY_START, TY_END);
    // (15 * 1.6) + (10 * 1.6) = 24 + 16 = 40
    expect(result).toBe(40);
  });

  it("excludes dividends outside tax year", () => {
    const dividends = [
      makeDiv({
        ticker: "AAPL",
        date: d("2024-02-01"), // before tax year
        taxWithheld: 100,
        fxRateToNzd: 1.6,
      }),
    ];

    const result = calculateFtc(dividends, TY_START, TY_END);
    expect(result).toBe(0);
  });
});

// ── Portfolio-level ─────────────────────────────────────────────────────────

describe("calculatePortfolioTax", () => {
  it("floors portfolio CV at 0 when negative", () => {
    const snapshots = [
      makeSnapshot({
        ticker: "AAPL",
        openingQty: 100,
        openingPrice: 200,
        openingFxRate: 1.6,
        closingQty: 100,
        closingPrice: 50,
        closingFxRate: 1.6,
      }),
    ];

    const result = calculatePortfolioTax(
      snapshots,
      [],
      [],
      new Set(),
      TY
    );

    expect(result.totalCvIncome).toBe(0);
  });

  it("excludes exempt tickers from FDR and CV", () => {
    const snapshots = [
      makeSnapshot({
        ticker: "AAPL",
        openingQty: 100,
        openingPrice: 150,
        openingFxRate: 1.6,
      }),
      makeSnapshot({
        ticker: "BHP.AX",
        openingQty: 200,
        openingPrice: 40,
        openingFxRate: 1.1,
      }),
    ];

    const exempt = new Set(["BHP.AX"]);
    const result = calculatePortfolioTax(snapshots, [], [], exempt, TY);

    // Only AAPL should appear
    expect(result.fdrResults).toHaveLength(1);
    expect(result.fdrResults[0].ticker).toBe("AAPL");
    expect(result.cvResults).toHaveLength(1);
    expect(result.cvResults[0].ticker).toBe("AAPL");
  });

  it("picks lower of FDR and CV as optimal", () => {
    const snapshots = [
      makeSnapshot({
        ticker: "AAPL",
        openingQty: 100,
        openingPrice: 150,
        openingFxRate: 1.6,
        closingQty: 100,
        closingPrice: 180,
        closingFxRate: 1.7,
      }),
    ];

    const result = calculatePortfolioTax(snapshots, [], [], new Set(), TY);

    // FDR = 100 * 150 * 1.6 * 0.05 = 1,200
    // CV = (100*180*1.7) - (100*150*1.6) = 30600 - 24000 = 6,600
    expect(result.totalFdrIncome).toBe(1200);
    expect(result.totalCvIncome).toBe(6600);
    expect(Math.min(result.totalFdrIncome, result.totalCvIncome)).toBe(1200);
  });
});
