import { prisma } from "@/lib/prisma";
import { getAvailableTaxYears } from "@/app/actions/sync-market-data";
import { TaxReportClient } from "@/components/tax-report-client";

export default async function TaxReportPage() {
  const portfolios = await prisma.portfolio.findMany({
    orderBy: { name: "asc" },
  });

  // Fetch available tax years for each portfolio
  const portfoliosWithYears = await Promise.all(
    portfolios.map(async (p) => ({
      id: p.id,
      name: p.name,
      taxYears: await getAvailableTaxYears([p.id]),
    }))
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">FIF Tax Report</h2>
        <p className="text-muted-foreground mt-1">
          Calculate and compare FDR vs CV tax methods for your portfolios.
        </p>
      </div>

      {portfolios.length === 0 ? (
        <p className="text-muted-foreground">
          No portfolios yet. Create one from the Dashboard to get started.
        </p>
      ) : (
        <TaxReportClient portfolios={portfoliosWithYears} />
      )}
    </div>
  );
}
