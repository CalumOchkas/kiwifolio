import { describe, expect, it } from "vitest";

import { isSameSplitEvent, toMarketDateKey } from "../stock-split-utils";

describe("toMarketDateKey", () => {
  it("keeps the Yahoo split on its UTC market date", () => {
    const splitAtOpen = new Date("2024-06-10T13:30:00.000Z");

    expect(toMarketDateKey(splitAtOpen).toISOString()).toBe(
      "2024-06-10T00:00:00.000Z"
    );
  });
});

describe("isSameSplitEvent", () => {
  it("matches a legacy row stored on the UTC market date", () => {
    expect(
      isSameSplitEvent(
        {
          splitDate: new Date("2024-06-10T00:00:00.000Z"),
          numerator: 10,
          denominator: 1,
        },
        {
          splitDate: new Date("2024-06-10T13:30:00.000Z"),
          numerator: 10,
          denominator: 1,
        }
      )
    ).toBe(true);
  });

  it("matches a legacy row stored on the next local calendar day", () => {
    expect(
      isSameSplitEvent(
        {
          splitDate: new Date("2024-06-11T00:00:00.000Z"),
          numerator: 10,
          denominator: 1,
        },
        {
          splitDate: new Date("2024-06-10T13:30:00.000Z"),
          numerator: 10,
          denominator: 1,
        }
      )
    ).toBe(true);
  });

  it("does not merge unrelated splits that only share the same ratio", () => {
    expect(
      isSameSplitEvent(
        {
          splitDate: new Date("2021-07-20T13:30:00.000Z"),
          numerator: 10,
          denominator: 1,
        },
        {
          splitDate: new Date("2024-06-10T13:30:00.000Z"),
          numerator: 10,
          denominator: 1,
        }
      )
    ).toBe(false);
  });
});