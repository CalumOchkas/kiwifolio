/**
 * FIF Tax Math Engine
 *
 * Implements FDR, CV, Quick Sale Adjustment, De Minimis, and FTC calculations
 * strictly per the KiwiFolio SPEC.md Section 3.
 */

// ── Input types ──────────────────────────────────────────────────────────────

export interface SnapshotData {
  ticker: string;
  openingQty: number;
  openingPrice: number; // native currency
  openingFxRate: number; // to NZD
  closingQty: number;
  closingPrice: number; // native currency
  closingFxRate: number; // to NZD
}

export interface TradeData {
  ticker: string;
  tradeType: "BUY" | "SELL";
  tradeDate: Date;
  quantity: number;
  price: number; // native currency
  brokerage: number; // native currency
  currency: string;
  fxRateToNzd: number;
}

export interface DividendData {
  ticker: string;
  date: Date;
  grossAmount: number; // native currency
  taxWithheld: number; // native currency
  fxRateToNzd: number;
}

// ── Output types ─────────────────────────────────────────────────────────────

export interface TickerFdrResult {
  ticker: string;
  openingValueNzd: number;
  baseCalculation: number;
  quickSaleAdjustment: number;
  totalFdrIncome: number;
}

export interface TickerCvResult {
  ticker: string;
  openingValueNzd: number;
  closingValueNzd: number;
  salesProceedsNzd: number;
  purchaseCostsNzd: number;
  dividendsNzd: number;
  cvIncome: number; // per-ticker (can be negative before portfolio sum)
}

export interface PortfolioTaxResult {
  fdrResults: TickerFdrResult[];
  cvResults: TickerCvResult[];
  totalFdrIncome: number; // sum, floored at 0
  totalCvIncome: number; // sum, floored at 0
  totalFtcNzd: number;
  deMinimisEligible: boolean;
  deMinimisMaxCostBasis: number;
}

// ── Tax year helpers ─────────────────────────────────────────────────────────

export function parseTaxYearRange(taxYear: string): { start: Date; end: Date } {
  const [startYear, endYear] = taxYear.split("-").map(Number);
  if (!startYear || !endYear || endYear !== startYear + 1) {
    throw new Error(`Invalid tax year: ${taxYear}`);
  }
  return {
    start: new Date(Date.UTC(startYear, 3, 1)), // April 1
    end: new Date(Date.UTC(endYear, 2, 31)),     // March 31
  };
}

function isInTaxYear(date: Date, start: Date, end: Date): boolean {
  return date >= start && date <= end;
}

// ── FDR calculation (Section 3.3) ────────────────────────────────────────────

/**
 * Calculate FDR income for a single ticker.
 *
 * Opening Value = openingQty * openingPrice * openingFxRate
 * Base = Opening Value * 0.05
 * Quick Sale Adjustment added if ticker was both bought AND sold in the year.
 */
export function calculateTickerFdr(
  snapshot: SnapshotData,
  trades: TradeData[],
  dividends: DividendData[],
  taxYearStart: Date,
  taxYearEnd: Date
): TickerFdrResult {
  const openingValueNzd =
    snapshot.openingQty * snapshot.openingPrice * snapshot.openingFxRate;
  const baseCalculation = openingValueNzd * 0.05;

  // Filter trades in the tax year for this ticker
  const yearTrades = trades.filter(
    (t) =>
      t.ticker === snapshot.ticker &&
      isInTaxYear(t.tradeDate, taxYearStart, taxYearEnd)
  );

  const buysInYear = yearTrades.filter((t) => t.tradeType === "BUY");
  const sellsInYear = yearTrades.filter((t) => t.tradeType === "SELL");

  let quickSaleAdjustment = 0;

  // Quick sale applies ONLY if bought AND sold in same year
  if (buysInYear.length > 0 && sellsInYear.length > 0) {
    const totalBought = buysInYear.reduce((s, t) => s + t.quantity, 0);
    const totalSold = sellsInYear.reduce((s, t) => s + t.quantity, 0);

    // Peak Holding Differential: walk through trades chronologically
    // to find max qty held during year, then subtract opening qty
    let runningQty = snapshot.openingQty;
    let peakQty = runningQty;
    const chronological = [...yearTrades].sort(
      (a, b) => a.tradeDate.getTime() - b.tradeDate.getTime()
    );
    for (const t of chronological) {
      runningQty += t.tradeType === "BUY" ? t.quantity : -t.quantity;
      peakQty = Math.max(peakQty, runningQty);
    }
    const peakHoldingDifferential = peakQty - snapshot.openingQty;

    // Quick Sale Quantity
    const quickSaleQty = Math.min(totalBought, totalSold);

    // Average cost per share of buys in year (in NZD, including brokerage)
    const totalBuyCostNzd = buysInYear.reduce(
      (s, t) => s + (t.quantity * t.price + t.brokerage) * t.fxRateToNzd,
      0
    );
    const avgCostNzd = totalBought > 0 ? totalBuyCostNzd / totalBought : 0;

    // Option 1: 0.05 * Peak Holding Differential * Average Cost
    const option1 = 0.05 * peakHoldingDifferential * avgCostNzd;

    // Option 2: (Sales Proceeds for Quick Sale Qty + Pro-rata Dividends) - (Avg Cost * Quick Sale Qty)
    // Sales proceeds: use the actual sell trades (chronological), take first quickSaleQty shares
    const totalSalesProceedsNzd = sellsInYear.reduce(
      (s, t) => s + (t.quantity * t.price - t.brokerage) * t.fxRateToNzd,
      0
    );
    const proRataSalesNzd =
      totalSold > 0 ? (totalSalesProceedsNzd * quickSaleQty) / totalSold : 0;

    // Pro-rata dividends for quick sale qty
    const tickerDividends = dividends.filter(
      (d) =>
        d.ticker === snapshot.ticker &&
        isInTaxYear(d.date, taxYearStart, taxYearEnd)
    );
    const totalDivsNzd = tickerDividends.reduce(
      (s, d) => s + d.grossAmount * d.fxRateToNzd,
      0
    );
    const closingQty = snapshot.closingQty;
    const totalSharesHeld = snapshot.openingQty + totalBought;
    const proRataDivsNzd =
      totalSharesHeld > 0
        ? (totalDivsNzd * quickSaleQty) / totalSharesHeld
        : 0;

    const option2 = proRataSalesNzd + proRataDivsNzd - avgCostNzd * quickSaleQty;

    quickSaleAdjustment = Math.min(option1, option2);
    // Quick sale adjustment cannot be negative
    quickSaleAdjustment = Math.max(0, quickSaleAdjustment);
  }

  const totalFdrIncome = Math.max(0, baseCalculation + quickSaleAdjustment);

  return {
    ticker: snapshot.ticker,
    openingValueNzd,
    baseCalculation,
    quickSaleAdjustment,
    totalFdrIncome,
  };
}

// ── CV calculation (Section 3.4) ─────────────────────────────────────────────

/**
 * Calculate CV income for a single ticker.
 *
 * CV = (Closing Value + Sales Proceeds + Dividends) - (Opening Value + Purchase Costs)
 * All in NZD. Per-ticker result can be negative; portfolio-level floor is 0.
 */
export function calculateTickerCv(
  snapshot: SnapshotData,
  trades: TradeData[],
  dividends: DividendData[],
  taxYearStart: Date,
  taxYearEnd: Date
): TickerCvResult {
  const openingValueNzd =
    snapshot.openingQty * snapshot.openingPrice * snapshot.openingFxRate;
  const closingValueNzd =
    snapshot.closingQty * snapshot.closingPrice * snapshot.closingFxRate;

  const yearTrades = trades.filter(
    (t) =>
      t.ticker === snapshot.ticker &&
      isInTaxYear(t.tradeDate, taxYearStart, taxYearEnd)
  );

  // Sales Proceeds: total NZD from sells (net of brokerage)
  const salesProceedsNzd = yearTrades
    .filter((t) => t.tradeType === "SELL")
    .reduce(
      (s, t) => s + (t.quantity * t.price - t.brokerage) * t.fxRateToNzd,
      0
    );

  // Purchase Costs: total NZD spent on buys (including brokerage)
  const purchaseCostsNzd = yearTrades
    .filter((t) => t.tradeType === "BUY")
    .reduce(
      (s, t) => s + (t.quantity * t.price + t.brokerage) * t.fxRateToNzd,
      0
    );

  // Dividends: gross in NZD
  const tickerDivs = dividends.filter(
    (d) =>
      d.ticker === snapshot.ticker &&
      isInTaxYear(d.date, taxYearStart, taxYearEnd)
  );
  const dividendsNzd = tickerDivs.reduce(
    (s, d) => s + d.grossAmount * d.fxRateToNzd,
    0
  );

  const cvIncome =
    closingValueNzd + salesProceedsNzd + dividendsNzd - openingValueNzd - purchaseCostsNzd;

  return {
    ticker: snapshot.ticker,
    openingValueNzd,
    closingValueNzd,
    salesProceedsNzd,
    purchaseCostsNzd,
    dividendsNzd,
    cvIncome,
  };
}

// ── De Minimis (Section 3.2) ─────────────────────────────────────────────────

/**
 * Check de minimis eligibility.
 *
 * Rule: If total cost basis of ALL foreign (non-exempt) holdings across ALL
 * portfolios never exceeds $50,000 NZD during the tax year, the user is exempt.
 *
 * Cost basis = cumulative (BUY cost NZD - SELL cost NZD) at each trade.
 * We walk trades chronologically and track the peak.
 */
export function calculateDeMinimis(
  allTrades: TradeData[],
  exemptTickers: Set<string>,
  taxYearStart: Date,
  taxYearEnd: Date
): { eligible: boolean; maxCostBasis: number } {
  // Include all trades up to end of tax year (cost basis is cumulative)
  const relevantTrades = allTrades
    .filter((t) => !exemptTickers.has(t.ticker) && t.tradeDate <= taxYearEnd)
    .sort((a, b) => a.tradeDate.getTime() - b.tradeDate.getTime());

  let costBasis = 0;
  let maxCostBasis = 0;

  for (const t of relevantTrades) {
    const nzdCost = (t.quantity * t.price + t.brokerage) * t.fxRateToNzd;
    if (t.tradeType === "BUY") {
      costBasis += nzdCost;
    } else {
      costBasis -= nzdCost;
    }
    // Only track peak during the tax year itself
    if (isInTaxYear(t.tradeDate, taxYearStart, taxYearEnd)) {
      maxCostBasis = Math.max(maxCostBasis, costBasis);
    }
  }

  // Also check cost basis at start of year (from pre-year trades)
  const preYearCostBasis = relevantTrades
    .filter((t) => t.tradeDate < taxYearStart)
    .reduce((s, t) => {
      const nzdCost = (t.quantity * t.price + t.brokerage) * t.fxRateToNzd;
      return t.tradeType === "BUY" ? s + nzdCost : s - nzdCost;
    }, 0);
  maxCostBasis = Math.max(maxCostBasis, preYearCostBasis);

  return {
    eligible: maxCostBasis <= 50000,
    maxCostBasis,
  };
}

// ── FTC (Section 3.5) ────────────────────────────────────────────────────────

/**
 * Aggregate Foreign Tax Credits for a tax year.
 * Sum of all taxWithheld * fxRateToNzd for dividends in the tax year.
 */
export function calculateFtc(
  dividends: DividendData[],
  taxYearStart: Date,
  taxYearEnd: Date
): number {
  return dividends
    .filter((d) => isInTaxYear(d.date, taxYearStart, taxYearEnd))
    .reduce((s, d) => s + d.taxWithheld * d.fxRateToNzd, 0);
}

// ── Full portfolio calculation ───────────────────────────────────────────────

/**
 * Calculate complete FIF tax results for a portfolio in a given tax year.
 */
export function calculatePortfolioTax(
  snapshots: SnapshotData[],
  trades: TradeData[],
  dividends: DividendData[],
  exemptTickers: Set<string>,
  taxYear: string,
  allTradesAllPortfolios?: TradeData[]
): PortfolioTaxResult {
  const { start, end } = parseTaxYearRange(taxYear);

  // Filter out exempt tickers
  const activeSnapshots = snapshots.filter(
    (s) => !exemptTickers.has(s.ticker)
  );

  // Per-ticker FDR
  const fdrResults = activeSnapshots.map((s) =>
    calculateTickerFdr(s, trades, dividends, start, end)
  );

  // Per-ticker CV
  const cvResults = activeSnapshots.map((s) =>
    calculateTickerCv(s, trades, dividends, start, end)
  );

  // Portfolio totals (floored at 0)
  const totalFdrIncome = Math.max(
    0,
    fdrResults.reduce((s, r) => s + r.totalFdrIncome, 0)
  );
  const totalCvIncome = Math.max(
    0,
    cvResults.reduce((s, r) => s + r.cvIncome, 0)
  );

  // FTC: all dividends (including exempt tickers)
  const totalFtcNzd = calculateFtc(dividends, start, end);

  // De Minimis: uses all trades across all portfolios if provided
  const deMinimisTradeSet = allTradesAllPortfolios ?? trades;
  const { eligible: deMinimisEligible, maxCostBasis: deMinimisMaxCostBasis } =
    calculateDeMinimis(deMinimisTradeSet, exemptTickers, start, end);

  return {
    fdrResults,
    cvResults,
    totalFdrIncome,
    totalCvIncome,
    totalFtcNzd,
    deMinimisEligible,
    deMinimisMaxCostBasis,
  };
}
