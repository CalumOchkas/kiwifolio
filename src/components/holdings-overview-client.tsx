"use client";

import { useEffect, useTransition, useState, useMemo, useRef } from "react";
import Link from "next/link";
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { getPortfolioHoldings } from "@/app/actions/portfolio-holdings";
import type { HoldingRow, PortfolioSummary } from "@/lib/portfolio-holdings";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  BarChart3,
  AlertTriangle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Settings2,
  ExternalLink,
  Upload,
  Plus,
} from "lucide-react";

// ── Formatting helpers ──────────────────────────────────────────────────────

function formatNzd(value: number | null, fallback = "—"): string {
  if (value === null) return fallback;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  return `${sign}$${abs.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatLocal(value: number | null, currency: string, fallback = "—"): string {
  if (value === null) return fallback;
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const sym = currency === "GBP" ? "£" : currency === "EUR" ? "€" : currency === "USD" ? "$" : "";
  return `${sign}${sym}${abs.toLocaleString("en-NZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

// ── Summary card ────────────────────────────────────────────────────────────

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

// ── Column definitions ──────────────────────────────────────────────────────

type ColumnId =
  | "ticker"
  | "exchange"
  | "name"
  | "qty"
  | "avgCost"
  | "price"
  | "ccy"
  | "costLocal"
  | "mvLocal"
  | "costNzd"
  | "mvNzd"
  | "gainLoss"
  | "dividends"
  | "totalReturn";

interface ColumnDef {
  id: ColumnId;
  label: string;
  shortLabel: string;
  align: "left" | "right";
  defaultVisible: boolean;
  sortable: boolean;
  excludeFromTotal?: boolean;
  getValue: (h: HoldingRow) => number | string | null;
  render: (h: HoldingRow) => React.ReactNode;
}

const COLUMNS: ColumnDef[] = [
  {
    id: "ticker",
    label: "Ticker",
    shortLabel: "Ticker",
    align: "left",
    defaultVisible: true,
    sortable: true,

    getValue: (h) => h.ticker,
    render: (h) => <span className="font-medium">{h.ticker}</span>,
  },
  {
    id: "exchange",
    label: "Exchange",
    shortLabel: "Exch",
    align: "left",
    defaultVisible: false,
    sortable: true,
    excludeFromTotal: true,
    getValue: (h) => h.exchange,
    render: (h) => (
      <span className="text-muted-foreground text-sm">{h.exchange ?? "—"}</span>
    ),
  },
  {
    id: "name",
    label: "Name",
    shortLabel: "Name",
    align: "left",
    defaultVisible: false,
    sortable: true,
    excludeFromTotal: true,
    getValue: (h) => h.instrumentName,
    render: (h) => (
      <span className="max-w-48 truncate block text-sm" title={h.instrumentName ?? ""}>
        {h.instrumentName ?? "—"}
      </span>
    ),
  },
  {
    id: "qty",
    label: "Quantity",
    shortLabel: "Qty",
    align: "right",
    defaultVisible: true,
    sortable: true,
    excludeFromTotal: true,

    getValue: (h) => h.quantity,
    render: (h) => h.quantity.toLocaleString(),
  },
  {
    id: "avgCost",
    label: "Avg Cost",
    shortLabel: "Avg Cost",
    align: "right",
    defaultVisible: true,
    sortable: true,
    excludeFromTotal: true,

    getValue: (h) => h.avgCostPerShare,
    render: (h) => formatLocal(h.avgCostPerShare, h.currency),
  },
  {
    id: "price",
    label: "Price",
    shortLabel: "Price",
    align: "right",
    defaultVisible: true,
    sortable: true,
    excludeFromTotal: true,

    getValue: (h) => h.currentPrice,
    render: (h) => h.currentPrice !== null ? formatLocal(h.currentPrice, h.currency) : "—",
  },
  {
    id: "ccy",
    label: "Currency",
    shortLabel: "CCY",
    align: "left",
    defaultVisible: true,
    sortable: true,

    getValue: (h) => h.currency,
    render: (h) => h.currency,
  },
  {
    id: "costLocal",
    label: "Cost Base (Local)",
    shortLabel: "Cost (Local)",
    align: "right",
    defaultVisible: false,
    sortable: true,

    getValue: (h) => h.quantity * h.avgCostPerShare,
    render: (h) => formatLocal(h.quantity * h.avgCostPerShare, h.currency),
  },
  {
    id: "mvLocal",
    label: "Market Value (Local)",
    shortLabel: "MV (Local)",
    align: "right",
    defaultVisible: false,
    sortable: true,

    getValue: (h) => h.currentPrice !== null ? h.quantity * h.currentPrice : null,
    render: (h) =>
      h.currentPrice !== null
        ? formatLocal(h.quantity * h.currentPrice, h.currency)
        : "—",
  },
  {
    id: "costNzd",
    label: "Cost Base (NZD)",
    shortLabel: "Cost (NZD)",
    align: "right",
    defaultVisible: true,
    sortable: true,

    getValue: (h) => h.costBaseNzd,
    render: (h) => formatNzd(h.costBaseNzd),
  },
  {
    id: "mvNzd",
    label: "Market Value (NZD)",
    shortLabel: "MV (NZD)",
    align: "right",
    defaultVisible: true,
    sortable: true,

    getValue: (h) => h.marketValueNzd,
    render: (h) => formatNzd(h.marketValueNzd),
  },
  {
    id: "gainLoss",
    label: "Gain/Loss",
    shortLabel: "Gain/Loss",
    align: "right",
    defaultVisible: true,
    sortable: true,

    getValue: (h) => h.capitalGainNzd,
    render: (h) => (
      <span className={gainColor(h.capitalGainNzd)}>
        {formatNzd(h.capitalGainNzd)}
        {h.capitalGainPct !== null && (
          <span className="text-xs ml-1">({formatPct(h.capitalGainPct)})</span>
        )}
      </span>
    ),
  },
  {
    id: "dividends",
    label: "Dividends (NZD)",
    shortLabel: "Dividends",
    align: "right",
    defaultVisible: true,
    sortable: true,

    getValue: (h) => h.totalDividendsNzd,
    render: (h) => formatNzd(h.totalDividendsNzd),
  },
  {
    id: "totalReturn",
    label: "Total Return",
    shortLabel: "Total Return",
    align: "right",
    defaultVisible: false,
    sortable: true,

    getValue: (h) => h.totalReturnNzd,
    render: (h) => (
      <span className={gainColor(h.totalReturnNzd)}>
        {formatNzd(h.totalReturnNzd)}
        {h.totalReturnPct !== null && (
          <span className="text-xs ml-1">({formatPct(h.totalReturnPct)})</span>
        )}
      </span>
    ),
  },
];

const DEFAULT_VISIBLE = new Set(
  COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id)
);

// ── Column picker dropdown (fixed position, not clipped by overflow) ────────

function ColumnPickerDropdown({
  btnRef,
  columns,
  visibleCols,
  toggleCol,
}: {
  btnRef: React.RefObject<HTMLButtonElement | null>;
  columns: ColumnDef[];
  visibleCols: Set<ColumnId>;
  toggleCol: (id: ColumnId) => void;
}) {
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    const el = btnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      top: rect.bottom + 4,
      right: window.innerWidth - rect.right,
    });
  }, [btnRef]);

  return (
    <div
      className="fixed z-50 w-52 rounded-md border bg-popover p-2 shadow-md max-h-80 overflow-y-auto"
      style={{ top: pos.top, right: pos.right }}
    >
      {columns.map((col) => (
        <label
          key={col.id}
          className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent cursor-pointer"
        >
          <input
            type="checkbox"
            checked={visibleCols.has(col.id)}
            onChange={() => toggleCol(col.id)}
            className="rounded"
          />
          {col.label}
        </label>
      ))}
    </div>
  );
}

// ── Sort helpers ────────────────────────────────────────────────────────────

type SortDir = "asc" | "desc";

function compareValues(a: number | string | null, b: number | string | null, dir: SortDir): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "string" && typeof b === "string") {
    return dir === "asc" ? a.localeCompare(b) : b.localeCompare(a);
  }
  const diff = (a as number) - (b as number);
  return dir === "asc" ? diff : -diff;
}

// ── Main component ──────────────────────────────────────────────────────────

export function HoldingsOverviewClient({ portfolioId }: { portfolioId: string }) {
  const [isPending, startTransition] = useTransition();
  const [holdings, setHoldings] = useState<HoldingRow[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [priceErrors, setPriceErrors] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Column visibility
  const [visibleCols, setVisibleCols] = useState<Set<ColumnId>>(() => new Set(DEFAULT_VISIBLE));
  const [showColPicker, setShowColPicker] = useState(false);
  const colBtnRef = useRef<HTMLButtonElement>(null);

  // Sorting
  const [sortCol, setSortCol] = useState<ColumnId>("mvNzd");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    startTransition(async () => {
      const result = await getPortfolioHoldings(portfolioId);
      setHoldings(result.holdings);
      setSummary(result.summary);
      setPriceErrors(result.priceErrors);
      setLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioId]);

  const loading = isPending || !loaded;

  const activeColumns = useMemo(
    () => COLUMNS.filter((c) => visibleCols.has(c.id)),
    [visibleCols]
  );

  const sortedHoldings = useMemo(() => {
    const col = COLUMNS.find((c) => c.id === sortCol);
    if (!col) return holdings;
    return [...holdings].sort((a, b) =>
      compareValues(col.getValue(a), col.getValue(b), sortDir)
    );
  }, [holdings, sortCol, sortDir]);

  // Auto-compute column totals: sums any column where getValue returns numbers
  const columnTotals = useMemo(() => {
    const totals: Record<string, { sum: number | null; isNumeric: boolean }> = {};
    for (const col of COLUMNS) {
      let sum: number | null = 0;
      let hasNumber = false;
      let hasString = false;
      for (const h of holdings) {
        const v = col.getValue(h);
        if (typeof v === "number") {
          sum = (sum ?? 0) + v;
          hasNumber = true;
        } else if (typeof v === "string") {
          hasString = true;
        } else if (v === null) {
          // null in a numeric column means we can't compute a reliable total
          if (hasNumber) sum = null;
        }
      }
      totals[col.id] = { sum, isNumeric: hasNumber && !hasString };
    }
    return totals;
  }, [holdings]);

  function toggleCol(id: ColumnId) {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleSort(id: ColumnId) {
    if (sortCol === id) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(id);
      setSortDir("desc");
    }
  }

  function SortIcon({ id }: { id: ColumnId }) {
    if (sortCol !== id) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1" />
    );
  }

  return (
    <div className="space-y-6">
      {/* Price error warning */}
      {priceErrors.length > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-950">
          <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Could not fetch current prices for: {priceErrors.join(", ")}. Market values may be incomplete.
            </p>
            <Link
              href="/settings/issues"
              className="inline-flex items-center gap-1 text-xs text-yellow-700 dark:text-yellow-300 underline hover:text-yellow-900 dark:hover:text-yellow-100 mt-1"
            >
              View all data issues
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Market Value"
          icon={DollarSign}
          value={formatNzd(summary?.totalMarketValueNzd ?? null)}
          loading={loading}
        />
        <SummaryCard
          title="Capital Gain/Loss"
          icon={summary?.totalCapitalGainNzd !== null && (summary?.totalCapitalGainNzd ?? 0) >= 0 ? TrendingUp : TrendingDown}
          value={formatNzd(summary?.totalCapitalGainNzd ?? null)}
          subValue={formatPct(summary?.totalCapitalGainPct ?? null)}
          loading={loading}
          valueColor={gainColor(summary?.totalCapitalGainNzd ?? null)}
        />
        <SummaryCard
          title="Dividends"
          icon={DollarSign}
          value={formatNzd(summary?.totalDividendsNzd ?? null)}
          loading={loading}
        />
        <SummaryCard
          title="Total Return"
          icon={BarChart3}
          value={formatNzd(summary?.totalReturnNzd ?? null)}
          subValue={formatPct(summary?.totalReturnPct ?? null)}
          loading={loading}
          valueColor={gainColor(summary?.totalReturnNzd ?? null)}
        />
      </div>

      {/* Holdings table */}
      {loading ? (
        <Card>
          <CardContent className="p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : holdings.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center space-y-4">
            <p className="text-muted-foreground">
              No current holdings. Add trades to get started.
            </p>
            <div className="flex justify-center gap-2">
              <Link href={`/holdings/${portfolioId}/import`}>
                <Button variant="outline" size="sm">
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Import CSV
                </Button>
              </Link>
              <Link href={`/holdings/${portfolioId}`}>
                <Button variant="outline" size="sm">
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Add Trade
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Current Holdings</CardTitle>
            <div>
              <button
                ref={colBtnRef}
                onClick={() => setShowColPicker((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Columns
              </button>
              {showColPicker && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowColPicker(false)}
                  />
                  <ColumnPickerDropdown
                    btnRef={colBtnRef}
                    columns={COLUMNS}
                    visibleCols={visibleCols}
                    toggleCol={toggleCol}
                  />
                </>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {activeColumns.map((col) => (
                      <TableHead
                        key={col.id}
                        className={col.align === "right" ? "text-right" : ""}
                      >
                        {col.sortable ? (
                          <button
                            onClick={() => handleSort(col.id)}
                            className="inline-flex items-center hover:text-foreground transition-colors font-medium"
                          >
                            {col.shortLabel}
                            <SortIcon id={col.id} />
                          </button>
                        ) : (
                          col.shortLabel
                        )}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedHoldings.map((h) => (
                    <TableRow key={h.ticker}>
                      {activeColumns.map((col) => (
                        <TableCell
                          key={col.id}
                          className={col.align === "right" ? "text-right" : ""}
                        >
                          {col.render(h)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow className="font-semibold">
                    {activeColumns.map((col, i) => {
                      const total = columnTotals[col.id];
                      const v = total?.sum ?? null;
                      return (
                        <TableCell
                          key={col.id}
                          className={col.align === "right" ? "text-right" : ""}
                        >
                          {i === 0
                            ? "Total"
                            : !col.excludeFromTotal && total?.isNumeric
                              ? <span className={gainColor(v)}>{formatNzd(v)}</span>
                              : ""}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
