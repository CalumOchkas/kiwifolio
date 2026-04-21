import { describe, expect, it } from "vitest";

import { deriveAvailableTaxYears, type TaxYearTradeInput } from "../tax-years";

function trade(overrides: Partial<TaxYearTradeInput> = {}): TaxYearTradeInput {
  return {
    portfolioId: "portfolio-1",
    ticker: "ETF",
    tradeType: "BUY",
    quantity: 10,
    tradeDate: new Date("2024-02-15T00:00:00.000Z"),
    ...overrides,
  };
}

describe("deriveAvailableTaxYears", () => {
  it("includes intermediate years where a holding exists without any trades", () => {
    const years = deriveAvailableTaxYears(
      [
        trade({ tradeDate: new Date("2024-02-15T00:00:00.000Z") }),
        trade({
          tradeType: "SELL",
          quantity: 10,
          tradeDate: new Date("2026-05-10T00:00:00.000Z"),
        }),
      ],
      new Date("2026-04-21T00:00:00.000Z")
    );

    expect(years).toEqual(["2023-2024", "2024-2025", "2025-2026", "2026-2027"]);
  });

  it("includes the current partial tax year when a holding is still open", () => {
    const years = deriveAvailableTaxYears(
      [trade({ tradeDate: new Date("2026-03-12T00:00:00.000Z") })],
      new Date("2026-04-21T00:00:00.000Z")
    );

    expect(years).toEqual(["2025-2026", "2026-2027"]);
  });
});