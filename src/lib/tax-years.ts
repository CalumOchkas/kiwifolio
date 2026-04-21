export interface TaxYearTradeInput {
  portfolioId: string;
  ticker: string;
  tradeType: string;
  quantity: number;
  tradeDate: Date;
}

function calculateQtyAtDate(
  trades: { tradeType: string; quantity: number; tradeDate: Date }[],
  asOfDate: Date
): number {
  return trades
    .filter((trade) => trade.tradeDate <= asOfDate)
    .reduce((qty, trade) => {
      return trade.tradeType === "BUY" ? qty + trade.quantity : qty - trade.quantity;
    }, 0);
}

function getTaxYearStartYear(date: Date): number {
  return date.getUTCMonth() < 3 ? date.getUTCFullYear() - 1 : date.getUTCFullYear();
}

export function deriveAvailableTaxYears(
  trades: TaxYearTradeInput[],
  today = new Date()
): string[] {
  if (trades.length === 0) return [];

  const sortedTrades = [...trades].sort(
    (left, right) => left.tradeDate.getTime() - right.tradeDate.getTime()
  );

  const earliestYear = getTaxYearStartYear(sortedTrades[0].tradeDate);
  const latestTradeYear = getTaxYearStartYear(
    sortedTrades[sortedTrades.length - 1].tradeDate
  );
  const currentTaxYear = getTaxYearStartYear(today);
  const lastYearToCheck = Math.max(latestTradeYear, currentTaxYear);

  const tradesByHolding = new Map<string, TaxYearTradeInput[]>();
  for (const trade of sortedTrades) {
    const key = `${trade.portfolioId}|${trade.ticker}`;
    const existing = tradesByHolding.get(key) ?? [];
    existing.push(trade);
    tradesByHolding.set(key, existing);
  }

  const normalizedToday = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );
  const availableYears: string[] = [];

  for (let startYear = earliestYear; startYear <= lastYearToCheck; startYear++) {
    const start = new Date(Date.UTC(startYear, 3, 1));
    const end = new Date(Date.UTC(startYear + 1, 2, 31));
    const effectiveEnd = startYear === currentTaxYear ? normalizedToday : end;

    const hasHoldingOrTrade = [...tradesByHolding.values()].some((holdingTrades) => {
      const openingQty = calculateQtyAtDate(holdingTrades, new Date(start.getTime() - 1));
      const closingQty = calculateQtyAtDate(holdingTrades, effectiveEnd);
      const hasTradeInYear = holdingTrades.some(
        (trade) => trade.tradeDate >= start && trade.tradeDate <= effectiveEnd
      );

      return openingQty > 0 || closingQty > 0 || hasTradeInYear;
    });

    if (hasHoldingOrTrade) {
      availableYears.push(`${startYear}-${startYear + 1}`);
    }
  }

  return availableYears;
}