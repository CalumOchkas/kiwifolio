import { prisma } from "@/lib/prisma";
import { DashboardClient } from "@/components/dashboard-client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const portfolios = await prisma.portfolio.findMany({
    include: {
      _count: { select: { trades: true, dividends: true } },
    },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground mt-1">
          Overview of your portfolios and investment performance.
        </p>
      </div>

      <DashboardClient
        portfolios={portfolios.map((p) => ({
          id: p.id,
          name: p.name,
          tradeCount: p._count.trades,
          dividendCount: p._count.dividends,
        }))}
      />
    </div>
  );
}
