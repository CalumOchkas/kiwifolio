import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  prismaMock,
  fetchSplitEventsMock,
  recordSplitIssueMock,
  revalidatePathMock,
} = vi.hoisted(() => ({
  prismaMock: {
    trade: {
      findMany: vi.fn(),
    },
    holdingSettings: {
      findMany: vi.fn(),
    },
    appliedSplit: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  fetchSplitEventsMock: vi.fn(),
  recordSplitIssueMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("@/lib/market-data", () => ({
  fetchSplitEvents: fetchSplitEventsMock,
}));

vi.mock("@/lib/sync-issues", () => ({
  recordSplitIssue: recordSplitIssueMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

import { applyStockSplits } from "./stock-splits";

describe("applyStockSplits", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prismaMock.trade.findMany.mockResolvedValue([
      {
        ticker: "NVDA",
        tradeDate: new Date("2024-01-05T00:00:00.000Z"),
      },
    ]);
    prismaMock.holdingSettings.findMany.mockResolvedValue([]);
    prismaMock.$transaction.mockResolvedValue(undefined);
    fetchSplitEventsMock.mockResolvedValue([
      {
        date: new Date("2024-06-10T13:30:00.000Z"),
        numerator: 10,
        denominator: 1,
        splitRatio: "10:1",
      },
    ]);
  });

  it("does not reapply a split when a legacy row was stored on the next local day", async () => {
    prismaMock.appliedSplit.findMany.mockResolvedValue([
      {
        ticker: "NVDA",
        splitDate: new Date("2024-06-11T00:00:00.000Z"),
        numerator: 10,
        denominator: 1,
      },
    ]);

    const result = await applyStockSplits(true);

    expect(fetchSplitEventsMock).toHaveBeenCalledWith(
      "NVDA",
      new Date("2024-01-05T00:00:00.000Z")
    );
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(recordSplitIssueMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });
});