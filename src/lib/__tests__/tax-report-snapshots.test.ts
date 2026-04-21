import { describe, expect, it } from "vitest";

import { shouldIncludeTaxReportSnapshot } from "../tax-report-snapshots";

describe("shouldIncludeTaxReportSnapshot", () => {
  it("excludes dust-only snapshots with no tax year activity", () => {
    expect(
      shouldIncludeTaxReportSnapshot(
        {
          ticker: "SNAP",
          openingQty: 0.000281120000011015,
          openingPrice: 8.71,
          openingFxRate: 1.76,
          closingQty: 0.000281120000011015,
          closingPrice: 4.6,
          closingFxRate: 1.73,
        },
        false
      )
    ).toBe(false);
  });

  it("keeps zero-quantity snapshots when there was tax year activity", () => {
    expect(
      shouldIncludeTaxReportSnapshot(
        {
          ticker: "SNAP",
          openingQty: 0,
          openingPrice: 0,
          openingFxRate: 1,
          closingQty: 0,
          closingPrice: 0,
          closingFxRate: 1,
        },
        true
      )
    ).toBe(true);
  });
});