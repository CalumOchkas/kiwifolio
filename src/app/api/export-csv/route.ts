import { NextRequest, NextResponse } from "next/server";
import { computeTaxReport } from "@/app/actions/tax-report";

/**
 * GET /api/export-csv?portfolioIds=id1,id2,...&taxYear=2024-2025
 * Returns a CSV file of the FIF tax report across selected portfolios.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const portfolioIdsParam = searchParams.get("portfolioIds");
  const taxYear = searchParams.get("taxYear");

  if (!portfolioIdsParam || !taxYear) {
    return NextResponse.json(
      { error: "portfolioIds and taxYear are required" },
      { status: 400 }
    );
  }

  const portfolioIds = portfolioIdsParam.split(",").filter(Boolean);
  if (portfolioIds.length === 0) {
    return NextResponse.json(
      { error: "At least one portfolioId is required" },
      { status: 400 }
    );
  }

  const report = await computeTaxReport(portfolioIds, taxYear);
  if (!report) {
    return NextResponse.json({ error: "No data found" }, { status: 404 });
  }

  const { result, portfolioNames, isPartialYear } = report;

  // Build CSV
  const lines: string[] = [];

  lines.push(`KiwiFolio FIF Tax Report`);
  lines.push(`Portfolios,${portfolioNames.map(csvEscape).join("; ")}`);
  lines.push(`Tax Year,${taxYear}`);
  if (isPartialYear) {
    lines.push(`Status,Partial year estimate — closing values based on latest market prices`);
  }
  lines.push(``);

  // FDR section
  lines.push(`FDR Method (Fair Dividend Rate)`);
  lines.push(`Ticker,Opening Value NZD,Base (5%),Quick Sale Adj,FDR Income`);
  for (const r of result.fdrResults) {
    lines.push(
      [csvEscape(r.ticker), r.openingValueNzd, r.baseCalculation, r.quickSaleAdjustment, r.totalFdrIncome]
        .join(",")
    );
  }
  lines.push(`Total FDR Income,${result.totalFdrIncome}`);
  lines.push(``);

  // CV section
  lines.push(`CV Method (Comparative Value)`);
  lines.push(`Ticker,Opening NZD,Closing NZD,Sales NZD,Purchases NZD,Dividends NZD,CV Income`);
  for (const r of result.cvResults) {
    lines.push(
      [csvEscape(r.ticker), r.openingValueNzd, r.closingValueNzd, r.salesProceedsNzd, r.purchaseCostsNzd, r.dividendsNzd, r.cvIncome]
        .join(",")
    );
  }
  lines.push(`Total CV Income,${result.totalCvIncome}`);
  lines.push(``);

  // Summary
  const optimal = result.totalFdrIncome <= result.totalCvIncome ? "FDR" : "CV";
  lines.push(`Summary`);
  if (isPartialYear) {
    lines.push(`Status,Estimate (partial year)`);
    lines.push(`Lower Method (so far),${optimal}`);
    lines.push(`Estimated Taxable Income,${Math.min(result.totalFdrIncome, result.totalCvIncome)}`);
  } else {
    lines.push(`Optimal Method,${optimal}`);
    lines.push(`Taxable Income,${Math.min(result.totalFdrIncome, result.totalCvIncome)}`);
  }  lines.push(`Foreign Tax Credits,${result.totalFtcNzd}`);
  lines.push(`De Minimis Eligible,${result.deMinimisEligible ? "Yes" : "No"}`);
  lines.push(`De Minimis Peak Cost Basis,${result.deMinimisMaxCostBasis}`);

  const csv = lines.join("\n");
  const filename = `kiwifolio-fif-report-${taxYear}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
