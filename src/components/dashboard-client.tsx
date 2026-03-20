"use client";

import { useEffect, useTransition, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAllPortfoliosSummary } from "@/app/actions/portfolio-holdings";
import type { PortfolioSummary } from "@/lib/portfolio-holdings";
import { CreatePortfolioDialog } from "@/components/portfolio-dialogs";
import { TrendingUp, TrendingDown, DollarSign, BarChart3, ArrowRight, Upload, Check, Circle } from "lucide-react";

function formatCurrency(value: number | null, fallback = "—"): string {
  if (value === null) return fallback;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  return `${sign}$${abs.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(value: number | null, fallback = "—"): string {
  if (value === null) return fallback;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function gainColor(value: number | null): string {
  if (value === null) return "";
  return value >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400";
}

function SummaryCard({
  title,
  icon: Icon,
  value,
  subValue,
  loading,
  valueColor,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  subValue?: string;
  loading: boolean;
  valueColor?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-32" />
        ) : (
          <>
            <div className={`text-2xl font-bold ${valueColor ?? ""}`}>{value}</div>
            {subValue && (
              <p className={`text-xs ${valueColor ?? "text-muted-foreground"}`}>{subValue}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface PortfolioInfo {
  id: string;
  name: string;
  tradeCount: number;
  dividendCount: number;
}

function ChecklistItem({
  done,
  label,
  action,
}: {
  done: boolean;
  label: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      {done ? (
        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-600 dark:text-green-400">
          <Check className="h-3.5 w-3.5" />
        </div>
      ) : (
        <Circle className="h-5 w-5 shrink-0 text-muted-foreground/40" />
      )}
      <span className={`text-sm flex-1 ${done ? "text-muted-foreground line-through" : ""}`}>
        {label}
      </span>
      {!done && action}
    </div>
  );
}

export function DashboardClient({ portfolios }: { portfolios: PortfolioInfo[] }) {
  const [isPending, startTransition] = useTransition();
  const [globalSummary, setGlobalSummary] = useState<PortfolioSummary | null>(null);
  const [portfolioSummaries, setPortfolioSummaries] = useState<
    Map<string, { summary: PortfolioSummary; holdingCount: number }>
  >(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (portfolios.length === 0) {
      setLoaded(true);
      return;
    }
    startTransition(async () => {
      const result = await getAllPortfoliosSummary();
      setGlobalSummary(result.globalSummary);
      const map = new Map<string, { summary: PortfolioSummary; holdingCount: number }>();
      for (const p of result.portfolios) {
        map.set(p.id, { summary: p.summary, holdingCount: p.holdingCount });
      }
      setPortfolioSummaries(map);
      setLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolios.length]);

  const loading = isPending || !loaded;

  const hasPortfolio = portfolios.length > 0;
  const totalTrades = portfolios.reduce((s, p) => s + p.tradeCount, 0);
  const hasTrades = totalTrades > 0;
  const allSetupDone = hasPortfolio && hasTrades;

  return (
    <div className="space-y-6">
      {/* Welcome / Getting Started card */}
      {!allSetupDone && (
        <Card>
          <CardHeader>
            <CardTitle>Welcome to KiwiFolio</CardTitle>
            <CardDescription>
              Get started by completing the steps below to set up your portfolio tracking.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ChecklistItem
              done={hasPortfolio}
              label="Create a portfolio"
              action={<CreatePortfolioDialog />}
            />
            <ChecklistItem
              done={hasTrades}
              label="Add trades to your portfolio"
              action={
                hasPortfolio ? (
                  <div className="flex gap-2">
                    <Link href={`/holdings/${portfolios[0]?.id}/import`}>
                      <Button variant="outline" size="sm">
                        <Upload className="mr-1.5 h-3.5 w-3.5" />
                        Import CSV
                      </Button>
                    </Link>
                    <Link href={`/holdings/${portfolios[0]?.id}`}>
                      <Button variant="outline" size="sm">
                        Add Manually
                      </Button>
                    </Link>
                  </div>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      )}
      {/* Global summary cards */}
      {portfolios.length > 0 && (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            title="Total Market Value"
            icon={DollarSign}
            value={formatCurrency(globalSummary?.totalMarketValueNzd ?? null)}
            loading={loading}
          />
          <SummaryCard
            title="Capital Gain/Loss"
            icon={globalSummary?.totalCapitalGainNzd !== null && (globalSummary?.totalCapitalGainNzd ?? 0) >= 0 ? TrendingUp : TrendingDown}
            value={formatCurrency(globalSummary?.totalCapitalGainNzd ?? null)}
            subValue={formatPct(globalSummary?.totalCapitalGainPct ?? null)}
            loading={loading}
            valueColor={gainColor(globalSummary?.totalCapitalGainNzd ?? null)}
          />
          <SummaryCard
            title="Dividends"
            icon={DollarSign}
            value={formatCurrency(globalSummary?.totalDividendsNzd ?? null)}
            loading={loading}
          />
          <SummaryCard
            title="Total Return"
            icon={BarChart3}
            value={formatCurrency(globalSummary?.totalReturnNzd ?? null)}
            subValue={formatPct(globalSummary?.totalReturnPct ?? null)}
            loading={loading}
            valueColor={gainColor(globalSummary?.totalReturnNzd ?? null)}
          />
        </div>
      )}

      {/* Portfolio cards */}
      {portfolios.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {portfolios.map((portfolio) => {
            const data = portfolioSummaries.get(portfolio.id);
            const s = data?.summary;
            return (
              <Card key={portfolio.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{portfolio.name}</CardTitle>
                      <CardDescription>
                        {portfolio.tradeCount} trades &middot; {portfolio.dividendCount} dividends
                        {data && ` · ${data.holdingCount} holdings`}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-24" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                  ) : s ? (
                    <div className="space-y-1">
                      <div className="text-lg font-semibold">
                        {formatCurrency(s.totalMarketValueNzd)}
                      </div>
                      <div className={`text-sm ${gainColor(s.totalReturnNzd)}`}>
                        {formatCurrency(s.totalReturnNzd)} ({formatPct(s.totalReturnPct)})
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No holdings</p>
                  )}
                  <Link
                    href={`/holdings/${portfolio.id}`}
                    className="inline-flex items-center text-sm text-primary hover:underline"
                  >
                    View Holdings
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
