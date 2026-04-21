interface PositionTrade {
  id?: string;
  portfolioId: string;
  ticker: string;
  tradeType: "BUY" | "SELL";
  tradeDate: Date;
  quantity: number;
}

export interface NegativePositionIssue {
  id: string;
  ticker: string;
  portfolioId: string;
  portfolioName: string;
  issueType: "NEGATIVE_POSITION";
  message: string;
  resolution: string;
  occurredAt: Date;
}

const POSITION_EPSILON = 0.0000001;

function compareTrades(a: PositionTrade, b: PositionTrade): number {
  const dateDiff = a.tradeDate.getTime() - b.tradeDate.getTime();
  if (dateDiff !== 0) return dateDiff;

  if (a.tradeType !== b.tradeType) {
    return a.tradeType === "BUY" ? -1 : 1;
  }

  return a.ticker.localeCompare(b.ticker);
}

export function detectNegativePositionIssues(
  trades: PositionTrade[],
  portfolioNames: Map<string, string>
): NegativePositionIssue[] {
  const tradesByHolding = new Map<string, PositionTrade[]>();

  for (const trade of trades) {
    const key = `${trade.portfolioId}|${trade.ticker}`;
    const existing = tradesByHolding.get(key);
    if (existing) {
      existing.push(trade);
    } else {
      tradesByHolding.set(key, [trade]);
    }
  }

  const issues: NegativePositionIssue[] = [];

  for (const [key, holdingTrades] of tradesByHolding) {
    const [portfolioId, ticker] = key.split("|");
    const orderedTrades = [...holdingTrades].sort(compareTrades);
    let runningQuantity = 0;

    for (const trade of orderedTrades) {
      const nextQuantity =
        trade.tradeType === "BUY"
          ? runningQuantity + trade.quantity
          : runningQuantity - trade.quantity;

      if (trade.tradeType === "SELL" && nextQuantity < -POSITION_EPSILON) {
        const availableQuantity = Math.max(0, runningQuantity);
        const deficitQuantity = Math.abs(nextQuantity);
        const portfolioName = portfolioNames.get(portfolioId) ?? "Unknown portfolio";

        issues.push({
          id: `negative-position:${portfolioId}:${ticker}:${trade.tradeDate.toISOString()}`,
          ticker,
          portfolioId,
          portfolioName,
          issueType: "NEGATIVE_POSITION",
          message:
            `Portfolio \"${portfolioName}\" sold ${trade.quantity.toLocaleString(undefined, {
              maximumFractionDigits: 6,
            })} shares on ${trade.tradeDate.toLocaleDateString("en-NZ")}` +
            ` with only ${availableQuantity.toLocaleString(undefined, {
              maximumFractionDigits: 6,
            })} available, leaving ${deficitQuantity.toLocaleString(undefined, {
              maximumFractionDigits: 6,
            })} shares short.`,
          resolution:
            `Review ${ticker} trades in ${portfolioName}. Fix the sell quantity/date, add the missing buy trade, or confirm any required stock split has been applied.`,
          occurredAt: trade.tradeDate,
        });
        break;
      }

      runningQuantity = nextQuantity;
    }
  }

  return issues.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}