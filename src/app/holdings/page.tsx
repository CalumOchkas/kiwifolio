import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import { CreatePortfolioDialog } from "@/components/portfolio-dialogs";

export default async function HoldingsIndexPage() {
  const portfolios = await prisma.portfolio.findMany({
    include: { _count: { select: { trades: true, dividends: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Holdings & Transactions
          </h2>
          <p className="text-muted-foreground mt-1">
            Select a portfolio to manage its trades and dividends.
          </p>
        </div>
        <CreatePortfolioDialog />
      </div>

      {portfolios.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No portfolios yet. Create one using the button above.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {portfolios.map((portfolio) => (
            <Link key={portfolio.id} href={`/holdings/${portfolio.id}`}>
              <Card className="hover:bg-accent/50 transition-colors cursor-pointer">
                <CardHeader>
                  <CardTitle className="text-lg">{portfolio.name}</CardTitle>
                  <CardDescription>
                    {portfolio._count.trades} trades &middot;{" "}
                    {portfolio._count.dividends} dividends
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <span className="inline-flex items-center text-sm text-primary">
                    Manage
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
