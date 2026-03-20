import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreateTradeDialog } from "@/components/trade-dialogs";
import {
  CreateDividendDialog,
  EditDividendDialog,
} from "@/components/dividend-dialogs";
import { DeleteButton } from "@/components/delete-button";
import { FifExemptToggle } from "@/components/fif-exempt-toggle";
import { YahooSymbolInput } from "@/components/yahoo-symbol-input";
import { HoldingsOverviewClient } from "@/components/holdings-overview-client";
import { TradesTableClient } from "@/components/trades-table-client";
import { DeletePortfolioButton } from "@/components/delete-portfolio-button";
import { RenamePortfolioInput } from "@/components/rename-portfolio-input";
import { deleteDividend } from "@/app/actions/dividend";
import { getLatestQuote, getLatestFxRate, getInstrumentMeta } from "@/lib/market-data";
import { ArrowLeft, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function HoldingsPage({
  params,
}: {
  params: Promise<{ portfolioId: string }>;
}) {
  const { portfolioId } = await params;

  const portfolio = await prisma.portfolio.findUnique({
    where: { id: portfolioId },
    include: {
      trades: { orderBy: { tradeDate: "desc" } },
      dividends: { orderBy: { date: "desc" } },
      holdingSettings: true,
    },
  });

  if (!portfolio) notFound();

  // Fetch applied splits for tickers in this portfolio
  const portfolioTickers = [...new Set(portfolio.trades.map((t) => t.ticker))];
  const appliedSplits = portfolioTickers.length > 0
    ? await prisma.appliedSplit.findMany({
        where: { ticker: { in: portfolioTickers } },
        orderBy: { splitDate: "desc" },
      })
    : [];

  // Serialize trades and splits for client component
  const serializedTrades = portfolio.trades.map((t) => ({
    id: t.id,
    ticker: t.ticker,
    tradeType: t.tradeType,
    tradeDate: t.tradeDate.toISOString().split("T")[0],
    quantity: t.quantity,
    price: t.price,
    brokerage: t.brokerage,
    currency: t.currency,
    fxRateToNzd: t.fxRateToNzd,
  }));

  const serializedSplits = appliedSplits.map((s) => ({
    id: s.id,
    ticker: s.ticker,
    splitDate: s.splitDate.toISOString().split("T")[0],
    splitRatio: s.splitRatio,
    tradesAdjusted: s.tradesAdjusted,
  }));

  // Collect unique tickers from trades for the FIF settings section
  const uniqueTickers = [
    ...new Set(portfolio.trades.map((t) => t.ticker)),
  ].sort();

  const settingsMap = new Map(
    portfolio.holdingSettings.map((s) => [s.ticker, {
      isFifExempt: s.isFifExempt,
      yahooSymbol: s.yahooSymbol,
      instrumentName: s.instrumentName,
      exchange: s.exchange,
    }])
  );

  // Compute per-ticker: quantity, currency, and current market value
  const QTY_EPSILON = 0.0001;
  const tickerData = new Map<string, { qty: number; currency: string }>();
  for (const t of portfolio.trades) {
    const existing = tickerData.get(t.ticker) ?? { qty: 0, currency: t.currency };
    existing.qty += t.tradeType === "BUY" ? t.quantity : -t.quantity;
    existing.currency = t.currency;
    tickerData.set(t.ticker, existing);
  }
  // Snap near-zero quantities to zero (floating point dust from matched buys/sells)
  for (const [, data] of tickerData) {
    if (Math.abs(data.qty) < QTY_EPSILON) data.qty = 0;
  }

  // Fetch current prices and FX rates for all tickers in parallel
  const tickerMarketValues = new Map<string, { price: number | null; fxRate: number | null; mvNzd: number | null }>();
  await Promise.all(
    uniqueTickers.map(async (ticker) => {
      const data = tickerData.get(ticker);
      if (!data) {
        tickerMarketValues.set(ticker, { price: null, fxRate: null, mvNzd: null });
        return;
      }
      const yahooSymbol = settingsMap.get(ticker)?.yahooSymbol ?? ticker;
      const [price, fxRate] = await Promise.all([
        getLatestQuote(yahooSymbol),
        getLatestFxRate(data.currency),
      ]);
      const mvNzd = price != null && fxRate != null ? data.qty * price * fxRate : null;
      tickerMarketValues.set(ticker, { price, fxRate, mvNzd });
    })
  );

  // Lazy backfill: populate missing instrument metadata from Yahoo Finance
  const existingSettingsTickers = new Set(portfolio.holdingSettings.map((s) => s.ticker));

  // Backfill existing HoldingSettings rows missing metadata
  const needsMeta = portfolio.holdingSettings.filter(
    (s) => !s.instrumentName || !s.exchange
  );
  // Create HoldingSettings rows for tickers that don't have one yet
  const missingSettingsTickers = uniqueTickers.filter((t) => !existingSettingsTickers.has(t));

  if (needsMeta.length > 0 || missingSettingsTickers.length > 0) {
    await Promise.allSettled([
      ...needsMeta.map(async (s) => {
        const yahooSymbol = s.yahooSymbol ?? s.ticker;
        const meta = await getInstrumentMeta(yahooSymbol);
        if (!meta) return;
        const updates: Record<string, string> = {};
        if (!s.instrumentName && (meta.shortName || meta.longName)) {
          const name = meta.shortName || meta.longName!;
          updates.instrumentName = name;
        }
        if (!s.exchange && (meta.fullExchangeName || meta.exchange)) {
          const exchange = meta.fullExchangeName || meta.exchange!;
          updates.exchange = exchange;
        }
        if (Object.keys(updates).length > 0) {
          await prisma.holdingSettings.update({
            where: { id: s.id },
            data: updates,
          });
          const existing = settingsMap.get(s.ticker);
          if (existing) {
            if (updates.instrumentName) existing.instrumentName = updates.instrumentName;
            if (updates.exchange) existing.exchange = updates.exchange;
          }
        }
      }),
      ...missingSettingsTickers.map(async (ticker) => {
        const meta = await getInstrumentMeta(ticker);
        const data: { instrumentName?: string; exchange?: string } = {};
        if (meta?.shortName || meta?.longName) data.instrumentName = meta.shortName || meta.longName!;
        if (meta?.fullExchangeName || meta?.exchange) data.exchange = meta.fullExchangeName || meta.exchange!;
        await prisma.holdingSettings.upsert({
          where: { portfolioId_ticker: { portfolioId, ticker } },
          update: data,
          create: { portfolioId, ticker, ...data },
        });
        settingsMap.set(ticker, {
          isFifExempt: false,
          yahooSymbol: null,
          instrumentName: data.instrumentName ?? null,
          exchange: data.exchange ?? null,
        });
      }),
    ]);
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft className="mr-1 h-3 w-3" />
          Back to Dashboard
        </Link>
        <h2 className="text-2xl font-bold tracking-tight">{portfolio.name}</h2>
        <p className="text-muted-foreground mt-1">
          Manage trades, dividends, and holding settings.
        </p>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="trades">
            Trades ({portfolio.trades.length})
          </TabsTrigger>
          <TabsTrigger value="dividends">
            Dividends ({portfolio.dividends.length})
          </TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <HoldingsOverviewClient portfolioId={portfolioId} />
        </TabsContent>

        <TabsContent value="trades" className="space-y-4">
          <div className="flex justify-end gap-2">
            <Link href={`/holdings/${portfolioId}/import`}>
              <Button variant="outline">
                <Upload className="mr-2 h-4 w-4" />
                Import Trades
              </Button>
            </Link>
            <CreateTradeDialog portfolioId={portfolioId} />
          </div>
          {portfolio.trades.length === 0 && appliedSplits.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No trades yet. Add your first trade above.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="p-4 pb-0">
                  <TradesTableClient
                    trades={serializedTrades}
                    splits={serializedSplits}
                    portfolioId={portfolioId}
                    tickers={uniqueTickers}
                    tickerMeta={Object.fromEntries(
                      uniqueTickers.map((t) => {
                        const s = settingsMap.get(t);
                        return [t, { name: s?.instrumentName ?? undefined, exchange: s?.exchange ?? undefined }];
                      })
                    )}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="dividends" className="space-y-4">
          <div className="flex justify-end">
            <CreateDividendDialog portfolioId={portfolioId} />
          </div>
          {portfolio.dividends.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No dividends yet. Add your first dividend above.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Ticker</TableHead>
                      <TableHead className="text-right">
                        Gross Amount
                      </TableHead>
                      <TableHead className="text-right">
                        Tax Withheld
                      </TableHead>
                      <TableHead>CCY</TableHead>
                      <TableHead className="text-right">FX Rate</TableHead>
                      <TableHead className="text-right">NZD Gross</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {portfolio.dividends.map((div) => {
                      const nzdGross = div.grossAmount * div.fxRateToNzd;
                      return (
                        <TableRow key={div.id}>
                          <TableCell>
                            {div.date.toISOString().split("T")[0]}
                          </TableCell>
                          <TableCell className="font-medium">
                            {div.ticker}
                          </TableCell>
                          <TableCell className="text-right">
                            {div.grossAmount.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            {div.taxWithheld.toFixed(2)}
                          </TableCell>
                          <TableCell>{div.currency}</TableCell>
                          <TableCell className="text-right">
                            {div.fxRateToNzd.toFixed(4)}
                          </TableCell>
                          <TableCell className="text-right">
                            ${nzdGross.toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <EditDividendDialog
                                portfolioId={portfolioId}
                                dividend={div}
                              />
                              <DeleteButton
                                label="dividend"
                                onConfirm={async () => {
                                  "use server";
                                  await deleteDividend(div.id, portfolioId);
                                }}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Portfolio Name</CardTitle>
            </CardHeader>
            <CardContent>
              <RenamePortfolioInput
                portfolioId={portfolioId}
                currentName={portfolio.name}
              />
            </CardContent>
          </Card>

          {uniqueTickers.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                Add trades to see holding settings for each ticker.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Holding Settings</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ticker</TableHead>
                      <TableHead>Exchange</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">Position</TableHead>
                      <TableHead className="text-right">Market Value (NZD)</TableHead>
                      <TableHead>Yahoo Symbol</TableHead>
                      <TableHead>FIF Exempt</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {uniqueTickers.map((ticker) => {
                      const settings = settingsMap.get(ticker);
                      const mv = tickerMarketValues.get(ticker);
                      const qty = tickerData.get(ticker)?.qty ?? 0;
                      return (
                        <TableRow key={ticker}>
                          <TableCell className="font-medium">
                            {ticker}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {settings?.exchange ?? "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-48 truncate" title={settings?.instrumentName ?? ""}>
                            {settings?.instrumentName ?? "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {qty > 0 ? qty.toLocaleString() : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {mv?.mvNzd != null ? (
                              <span>${mv.mvNzd.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            ) : (
                              <Badge variant="destructive">No data</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <YahooSymbolInput
                              portfolioId={portfolioId}
                              ticker={ticker}
                              currentSymbol={settings?.yahooSymbol ?? null}
                            />
                          </TableCell>
                          <TableCell>
                            <FifExemptToggle
                              portfolioId={portfolioId}
                              ticker={ticker}
                              isFifExempt={settings?.isFifExempt ?? false}
                            />
                          </TableCell>
                          <TableCell>
                            {settings?.isFifExempt && (
                              <Badge variant="secondary">Exempt</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="text-base text-destructive">Danger Zone</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Delete this portfolio</p>
                  <p className="text-sm text-muted-foreground">
                    Permanently remove this portfolio and all its trades, dividends, and settings.
                  </p>
                </div>
                <DeletePortfolioButton
                  portfolioId={portfolioId}
                  portfolioName={portfolio.name}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
