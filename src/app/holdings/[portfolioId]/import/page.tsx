import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ImportCsvCard } from "@/components/import-csv-card";
import { ArrowLeft } from "lucide-react";

export default async function PortfolioImportPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;

  const [portfolio, portfolios] = await Promise.all([
    prisma.portfolio.findUnique({
      where: { id: portfolioId },
      select: { id: true, name: true },
    }),
    prisma.portfolio.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!portfolio) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/holdings/${portfolioId}`}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft className="mr-1 h-3 w-3" />
          Back to {portfolio.name}
        </Link>
        <h2 className="text-2xl font-bold tracking-tight">Import Trades</h2>
        <p className="text-muted-foreground mt-1">
          Import trades and dividends from your broker&apos;s CSV export.
        </p>
      </div>

      <div className="max-w-lg">
        <ImportCsvCard
          portfolios={portfolios}
          defaultPortfolioId={portfolioId}
        />
      </div>
    </div>
  );
}
