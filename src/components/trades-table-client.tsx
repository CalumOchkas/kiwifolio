"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EditTradeDialog } from "@/components/trade-dialogs";
import { DeleteButton } from "@/components/delete-button";
import { deleteTrade } from "@/app/actions/trade";
import { GitBranch, Search } from "lucide-react";

export type SerializedTrade = {
  id: string;
  ticker: string;
  tradeType: string;
  tradeDate: string;
  quantity: number;
  price: number;
  brokerage: number;
  currency: string;
  fxRateToNzd: number;
};

export type SerializedSplit = {
  id: string;
  ticker: string;
  splitDate: string;
  splitRatio: string;
  tradesAdjusted: number;
};

type TimelineItem =
  | { type: "trade"; date: string; data: SerializedTrade }
  | { type: "split"; date: string; data: SerializedSplit };

export function TradesTableClient({
  trades,
  splits,
  portfolioId,
  tickers,
  tickerMeta,
}: {
  trades: SerializedTrade[];
  splits: SerializedSplit[];
  portfolioId: string;
  tickers: string[];
  tickerMeta?: Record<string, { name?: string; exchange?: string }>;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [tickerFilter, setTickerFilter] = useState<string>("ALL");

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [
      ...trades.map((t) => ({ type: "trade" as const, date: t.tradeDate, data: t })),
      ...splits.map((s) => ({ type: "split" as const, date: s.splitDate, data: s })),
    ];
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [trades, splits]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return timeline.filter((item) => {
      const ticker = item.type === "trade" ? item.data.ticker : item.data.ticker;

      // Ticker dropdown filter
      if (tickerFilter !== "ALL" && ticker !== tickerFilter) return false;

      // Type filter (only applies to trades; splits always show if ticker matches)
      if (typeFilter !== "ALL") {
        if (item.type === "split") return true;
        if (item.data.tradeType !== typeFilter) return false;
      }

      // Text search across ticker, name, date, type, currency
      if (q) {
        const meta = tickerMeta?.[ticker];
        const searchable = [
          ticker.toLowerCase(),
          meta?.name?.toLowerCase() ?? "",
          meta?.exchange?.toLowerCase() ?? "",
          item.date,
          item.type === "trade" ? item.data.tradeType.toLowerCase() : "split",
          item.type === "trade" ? item.data.currency.toLowerCase() : "",
        ].join(" ");
        if (!searchable.includes(q)) return false;
      }

      return true;
    });
  }, [timeline, search, typeFilter, tickerFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search trades..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={tickerFilter} onValueChange={(v) => v && setTickerFilter(v)}>
          <SelectTrigger className="w-[140px]">
            <SelectValue>{tickerFilter === "ALL" ? "All Tickers" : tickerFilter}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Tickers</SelectItem>
            {tickers.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={(v) => v && setTypeFilter(v)}>
          <SelectTrigger className="w-[120px]">
            <SelectValue>
              {typeFilter === "ALL" ? "All Types" : typeFilter === "BUY" ? "Buy" : "Sell"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Types</SelectItem>
            <SelectItem value="BUY">Buy</SelectItem>
            <SelectItem value="SELL">Sell</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">
          No trades match your filters.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Ticker</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Brokerage</TableHead>
              <TableHead>CCY</TableHead>
              <TableHead className="text-right">FX Rate</TableHead>
              <TableHead className="text-right">NZD Total</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((item) => {
              if (item.type === "split") {
                const split = item.data;
                return (
                  <TableRow
                    key={`split-${split.id}`}
                    className="bg-muted/50"
                  >
                    <TableCell>{split.splitDate}</TableCell>
                    <TableCell className="font-medium">
                      {split.ticker}
                    </TableCell>
                    <TableCell colSpan={7}>
                      <div className="flex items-center gap-2">
                        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                        <Badge variant="outline">
                          {split.splitRatio} Stock Split
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {split.tradesAdjusted} trade{split.tradesAdjusted !== 1 ? "s" : ""} adjusted
                        </span>
                      </div>
                    </TableCell>
                    <TableCell />
                  </TableRow>
                );
              }

              const trade = item.data;
              const nzdTotal = trade.quantity * trade.price * trade.fxRateToNzd;
              const meta = tickerMeta?.[trade.ticker];
              // Reconstruct Date for EditTradeDialog
              const tradeWithDate = { ...trade, tradeDate: new Date(trade.tradeDate) };
              return (
                <TableRow key={trade.id}>
                  <TableCell>{trade.tradeDate}</TableCell>
                  <TableCell>
                    <div>
                      <span className="font-medium">{trade.ticker}</span>
                      {meta?.name && (
                        <span className="block text-xs text-muted-foreground truncate max-w-32" title={meta.name}>
                          {meta.name}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        trade.tradeType === "BUY"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {trade.tradeType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {trade.quantity.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {trade.price.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {trade.brokerage.toFixed(2)}
                  </TableCell>
                  <TableCell>{trade.currency}</TableCell>
                  <TableCell className="text-right">
                    {trade.fxRateToNzd.toFixed(4)}
                  </TableCell>
                  <TableCell className="text-right">
                    ${nzdTotal.toFixed(2)}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <EditTradeDialog
                        portfolioId={portfolioId}
                        trade={tradeWithDate}
                      />
                      <DeleteButton
                        label="trade"
                        onConfirm={async () => {
                          await deleteTrade(trade.id, portfolioId);
                        }}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
