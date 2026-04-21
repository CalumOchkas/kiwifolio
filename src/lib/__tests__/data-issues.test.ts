import { describe, expect, it } from "vitest";

import { detectNegativePositionIssues } from "../data-issues";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("detectNegativePositionIssues", () => {
  it("reports a sell that exceeds the available quantity", () => {
    const issues = detectNegativePositionIssues(
      [
        {
          portfolioId: "p1",
          ticker: "AAPL",
          tradeType: "BUY",
          tradeDate: d("2025-01-10"),
          quantity: 10,
        },
        {
          portfolioId: "p1",
          ticker: "AAPL",
          tradeType: "SELL",
          tradeDate: d("2025-01-11"),
          quantity: 15,
        },
      ],
      new Map([["p1", "Main Portfolio"]])
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      ticker: "AAPL",
      portfolioId: "p1",
      portfolioName: "Main Portfolio",
      issueType: "NEGATIVE_POSITION",
      occurredAt: d("2025-01-11"),
    });
    expect(issues[0].message).toContain("sold 15");
    expect(issues[0].message).toContain("only 10 available");
    expect(issues[0].message).toContain("5 shares short");
  });

  it("does not report a sell that is covered by earlier buys", () => {
    const issues = detectNegativePositionIssues(
      [
        {
          portfolioId: "p1",
          ticker: "AAPL",
          tradeType: "BUY",
          tradeDate: d("2025-01-10"),
          quantity: 10,
        },
        {
          portfolioId: "p1",
          ticker: "AAPL",
          tradeType: "SELL",
          tradeDate: d("2025-01-11"),
          quantity: 8,
        },
      ],
      new Map([["p1", "Main Portfolio"]])
    );

    expect(issues).toEqual([]);
  });

  it("processes same-day buys before sells to avoid false positives", () => {
    const issues = detectNegativePositionIssues(
      [
        {
          portfolioId: "p1",
          ticker: "AAPL",
          tradeType: "SELL",
          tradeDate: d("2025-01-11"),
          quantity: 8,
        },
        {
          portfolioId: "p1",
          ticker: "AAPL",
          tradeType: "BUY",
          tradeDate: d("2025-01-11"),
          quantity: 10,
        },
      ],
      new Map([["p1", "Main Portfolio"]])
    );

    expect(issues).toEqual([]);
  });
});