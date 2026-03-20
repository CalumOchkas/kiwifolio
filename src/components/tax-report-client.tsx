"use client";

import { useState, useMemo, useTransition } from "react";
import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { syncMarketData } from "@/app/actions/sync-market-data";
import { type SplitResult } from "@/app/actions/stock-splits";
import { computeTaxReport, type TaxReportData } from "@/app/actions/tax-report";
import { updateSnapshot, resetSnapshotOverride } from "@/app/actions/snapshot";
import { Loader2, RefreshCw, Pencil, RotateCcw, Check, X, Download, GitBranch } from "lucide-react";

interface Portfolio {
  id: string;
  name: string;
  taxYears: string[];
}

export function TaxReportClient({
  portfolios,
}: {
  portfolios: Portfolio[];
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(portfolios.map((p) => p.id))
  );
  const [selectedTaxYear, setSelectedTaxYear] = useState<string>("");
  const [report, setReport] = useState<TaxReportData | null>(null);
  const [syncResults, setSyncResults] = useState<
    { ticker: string; portfolioId: string; status: string; message?: string }[] | null
  >(null);
  const [splitResults, setSplitResults] = useState<SplitResult[] | null>(null);
  const [isSyncing, startSyncTransition] = useTransition();
  const [isComputing, startComputeTransition] = useTransition();

  // Union of tax years across all selected portfolios
  const taxYears = useMemo(() => {
    const years = new Set<string>();
    for (const p of portfolios) {
      if (selectedIds.has(p.id)) {
        for (const y of p.taxYears) years.add(y);
      }
    }
    return [...years].sort();
  }, [portfolios, selectedIds]);

  const selectedPortfolioIds = useMemo(() => Array.from(selectedIds), [selectedIds]);

  function togglePortfolio(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setSelectedTaxYear("");
    setReport(null);
    setSyncResults(null);
    setSplitResults(null);
  }

  function selectAll() {
    setSelectedIds(new Set(portfolios.map((p) => p.id)));
    setSelectedTaxYear("");
    setReport(null);
    setSyncResults(null);
    setSplitResults(null);
  }

  function selectNone() {
    setSelectedIds(new Set());
    setSelectedTaxYear("");
    setReport(null);
    setSyncResults(null);
    setSplitResults(null);
  }

  function handleTaxYearChange(taxYear: string) {
    setSelectedTaxYear(taxYear);
    setReport(null);
    setSyncResults(null);
    setSplitResults(null);
    startComputeTransition(async () => {
      const data = await computeTaxReport(selectedPortfolioIds, taxYear);
      setReport(data);
    });
  }

  function handleSync() {
    if (selectedIds.size === 0 || !selectedTaxYear) return;
    startSyncTransition(async () => {
      const { syncResults: sr, splitResults: spr } = await syncMarketData(selectedPortfolioIds, selectedTaxYear);
      setSyncResults(sr);
      setSplitResults(spr.length > 0 ? spr : null);
      const data = await computeTaxReport(selectedPortfolioIds, selectedTaxYear);
      setReport(data);
    });
  }

  function handleRefreshReport() {
    if (selectedIds.size === 0 || !selectedTaxYear) return;
    startComputeTransition(async () => {
      const data = await computeTaxReport(selectedPortfolioIds, selectedTaxYear);
      setReport(data);
    });
  }

  function handleExportCsv() {
    if (selectedIds.size === 0 || !selectedTaxYear) return;
    window.open(
      `/api/export-csv?portfolioIds=${selectedPortfolioIds.join(",")}&taxYear=${selectedTaxYear}`,
      "_blank"
    );
  }

  const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="space-y-6">
      {/* Portfolio Selection + Tax Year */}
      <div className="flex flex-wrap items-start gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Portfolios</label>
            <button
              className="text-xs text-muted-foreground hover:text-foreground underline"
              onClick={selectAll}
            >
              All
            </button>
            <button
              className="text-xs text-muted-foreground hover:text-foreground underline"
              onClick={selectNone}
            >
              None
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {portfolios.map((p) => (
              <button
                key={p.id}
                onClick={() => togglePortfolio(p.id)}
                className={`inline-flex items-center rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  selectedIds.has(p.id)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-primary/50"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Tax Year</label>
          <Select
            value={selectedTaxYear}
            onValueChange={(v) => v && handleTaxYearChange(v)}
            disabled={taxYears.length === 0 || selectedIds.size === 0}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder={selectedIds.size === 0 ? "Select portfolios" : taxYears.length === 0 ? "No trades" : "Select year"}>
                {selectedTaxYear || undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {taxYears.map((ty) => (
                <SelectItem key={ty} value={ty}>
                  {ty}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-end gap-2 pt-5">
          <Button
            onClick={handleSync}
            disabled={selectedIds.size === 0 || !selectedTaxYear || isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="mr-2 h-4 w-4" />
            )}
            {isSyncing ? "Syncing..." : "Sync Market Data"}
          </Button>

          {report && (
            <Button
              variant="outline"
              onClick={handleExportCsv}
              disabled={selectedIds.size === 0 || !selectedTaxYear}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          )}
        </div>
      </div>

      {/* Split Results */}
      {splitResults && splitResults.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <GitBranch className="h-4 w-4" />
              Stock Splits Applied
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {splitResults.map((r, i) => (
                <Badge
                  key={`${r.ticker}-${r.splitDate}-${i}`}
                  variant="default"
                >
                  {r.ticker}: {r.splitRatio} split ({r.tradesAdjusted} trade{r.tradesAdjusted !== 1 ? "s" : ""} adjusted)
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sync Results */}
      {syncResults && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Sync Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {syncResults.map((r, i) => (
                <Badge
                  key={`${r.ticker}-${r.portfolioId}-${i}`}
                  variant={r.status === "synced" ? "default" : r.status === "skipped" ? "secondary" : "destructive"}
                >
                  {r.ticker}: {r.status}
                  {r.message && ` (${r.message})`}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading state */}
      {isComputing && !report && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Loader2 className="mx-auto h-6 w-6 animate-spin mb-2" />
            Computing tax report...
          </CardContent>
        </Card>
      )}

      {/* Report Results */}
      {report && (
        <>
          {/* Partial year banner */}
          {report.isPartialYear && (
            <Card>
              <CardContent className="py-3">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Partial year estimate</span> — closing values are based on the latest available market prices, not end-of-year (March 31). Final figures may differ.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Results Panel: FDR vs CV side-by-side */}
          <div className="grid gap-4 md:grid-cols-2">
            <ResultCard
              title="FDR Method (Fair Dividend Rate)"
              total={report.result.totalFdrIncome}
              isOptimal={report.result.totalFdrIncome <= report.result.totalCvIncome}
              isPartialYear={report.isPartialYear}
              fmt={fmt}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticker</TableHead>
                    <TableHead className="text-right">Opening Value</TableHead>
                    <TableHead className="text-right">Base (5%)</TableHead>
                    <TableHead className="text-right">Quick Sale</TableHead>
                    <TableHead className="text-right">FDR Income</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.result.fdrResults.map((r) => (
                    <TableRow key={r.ticker}>
                      <TableCell className="font-medium">{r.ticker}</TableCell>
                      <TableCell className="text-right">{fmt(r.openingValueNzd)}</TableCell>
                      <TableCell className="text-right">{fmt(r.baseCalculation)}</TableCell>
                      <TableCell className="text-right">{fmt(r.quickSaleAdjustment)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(r.totalFdrIncome)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ResultCard>

            <ResultCard
              title="CV Method (Comparative Value)"
              total={report.result.totalCvIncome}
              isOptimal={report.result.totalCvIncome <= report.result.totalFdrIncome}
              isPartialYear={report.isPartialYear}
              fmt={fmt}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticker</TableHead>
                    <TableHead className="text-right">Opening</TableHead>
                    <TableHead className="text-right">Closing</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Purchases</TableHead>
                    <TableHead className="text-right">Dividends</TableHead>
                    <TableHead className="text-right">CV Income</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.result.cvResults.map((r) => (
                    <TableRow key={r.ticker}>
                      <TableCell className="font-medium">{r.ticker}</TableCell>
                      <TableCell className="text-right">{fmt(r.openingValueNzd)}</TableCell>
                      <TableCell className="text-right">{fmt(r.closingValueNzd)}</TableCell>
                      <TableCell className="text-right">{fmt(r.salesProceedsNzd)}</TableCell>
                      <TableCell className="text-right">{fmt(r.purchaseCostsNzd)}</TableCell>
                      <TableCell className="text-right">{fmt(r.dividendsNzd)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(r.cvIncome)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ResultCard>
          </div>

          {/* FTC Panel */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Total Claimable Foreign Tax Credits</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{fmt(report.result.totalFtcNzd)}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Sum of all foreign tax withheld on dividends, converted to NZD.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">De Minimis Threshold</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <p className="text-2xl font-bold">{fmt(report.result.deMinimisMaxCostBasis)}</p>
                  <Badge variant={report.result.deMinimisEligible ? "default" : "secondary"}>
                    {report.result.deMinimisEligible ? "Eligible" : "Not Eligible"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Peak cost basis across all portfolios during tax year.
                  {report.result.deMinimisEligible
                    ? " Under $50,000 NZD \u2013 you may be exempt from FIF tax."
                    : " Exceeds $50,000 NZD \u2013 FIF tax applies."}
                </p>
                {report.result.deMinimisEligible && (
                  <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${Math.min(100, (report.result.deMinimisMaxCostBasis / 50000) * 100)}%` }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Snapshot Overrides */}
          {report.snapshots.length > 0 && (
            <SnapshotOverrides
              snapshots={report.snapshots}
              showPortfolio={selectedIds.size > 1}
              onRefresh={handleRefreshReport}
            />
          )}
        </>
      )}

      {/* Empty state */}
      {!report && !isComputing && selectedTaxYear && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No snapshot data for this tax year yet. Click &quot;Sync Market Data&quot; to fetch prices and FX rates.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ResultCard({
  title,
  total,
  isOptimal,
  isPartialYear,
  fmt,
  children,
}: {
  title: string;
  total: number;
  isOptimal: boolean;
  isPartialYear: boolean;
  fmt: (n: number) => string;
  children: React.ReactNode;
}) {
  return (
    <Card className={!isPartialYear && isOptimal ? "ring-2 ring-primary" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">{title}</CardTitle>
          {isPartialYear ? (
            <Badge variant="secondary">Estimate</Badge>
          ) : (
            isOptimal && <Badge>Optimal</Badge>
          )}
        </div>
        <p className="text-2xl font-bold">{fmt(total)}</p>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">{children}</CardContent>
    </Card>
  );
}

function SnapshotOverrides({
  snapshots,
  showPortfolio,
  onRefresh,
}: {
  snapshots: TaxReportData["snapshots"];
  showPortfolio: boolean;
  onRefresh: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({
    openingPrice: 0,
    openingFxRate: 0,
    closingPrice: 0,
    closingFxRate: 0,
  });
  const [isSaving, startSaveTransition] = useTransition();

  // Sort by ticker, then portfolio name
  const sorted = [...snapshots].sort((a, b) => {
    const cmp = a.ticker.localeCompare(b.ticker);
    return cmp !== 0 ? cmp : a.portfolioName.localeCompare(b.portfolioName);
  });

  function startEdit(snapshot: TaxReportData["snapshots"][number]) {
    setEditingId(snapshot.id);
    setEditValues({
      openingPrice: snapshot.openingPrice,
      openingFxRate: snapshot.openingFxRate,
      closingPrice: snapshot.closingPrice,
      closingFxRate: snapshot.closingFxRate,
    });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function handleSave(snapshotId: string) {
    startSaveTransition(async () => {
      await updateSnapshot(snapshotId, editValues);
      setEditingId(null);
      onRefresh();
    });
  }

  function handleReset(snapshotId: string) {
    startSaveTransition(async () => {
      await resetSnapshotOverride(snapshotId);
      onRefresh();
    });
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Market Data Snapshots</CardTitle>
        <p className="text-xs text-muted-foreground">
          Manually override prices and FX rates if the API data is incorrect or missing.
        </p>
      </CardHeader>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticker</TableHead>
              {showPortfolio && <TableHead>Portfolio</TableHead>}
              <TableHead className="text-right">Open Qty</TableHead>
              <TableHead className="text-right">Open Price</TableHead>
              <TableHead className="text-right">Open FX</TableHead>
              <TableHead className="text-right">Close Qty</TableHead>
              <TableHead className="text-right">Close Price</TableHead>
              <TableHead className="text-right">Close FX</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((snap) => {
              const isEditing = editingId === snap.id;
              return (
                <TableRow key={snap.id}>
                  <TableCell className="font-medium">{snap.ticker}</TableCell>
                  {showPortfolio && (
                    <TableCell className="text-muted-foreground">{snap.portfolioName}</TableCell>
                  )}
                  <TableCell className="text-right">{snap.openingQty}</TableCell>
                  <TableCell className="text-right">
                    {isEditing ? (
                      <Input
                        type="number"
                        step="0.01"
                        value={editValues.openingPrice}
                        onChange={(e) =>
                          setEditValues((v) => ({ ...v, openingPrice: parseFloat(e.target.value) || 0 }))
                        }
                        className="w-24 text-right"
                      />
                    ) : (
                      snap.openingPrice.toFixed(2)
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {isEditing ? (
                      <Input
                        type="number"
                        step="0.0001"
                        value={editValues.openingFxRate}
                        onChange={(e) =>
                          setEditValues((v) => ({ ...v, openingFxRate: parseFloat(e.target.value) || 0 }))
                        }
                        className="w-24 text-right"
                      />
                    ) : (
                      snap.openingFxRate.toFixed(4)
                    )}
                  </TableCell>
                  <TableCell className="text-right">{snap.closingQty}</TableCell>
                  <TableCell className="text-right">
                    {isEditing ? (
                      <Input
                        type="number"
                        step="0.01"
                        value={editValues.closingPrice}
                        onChange={(e) =>
                          setEditValues((v) => ({ ...v, closingPrice: parseFloat(e.target.value) || 0 }))
                        }
                        className="w-24 text-right"
                      />
                    ) : (
                      snap.closingPrice.toFixed(2)
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {isEditing ? (
                      <Input
                        type="number"
                        step="0.0001"
                        value={editValues.closingFxRate}
                        onChange={(e) =>
                          setEditValues((v) => ({ ...v, closingFxRate: parseFloat(e.target.value) || 0 }))
                        }
                        className="w-24 text-right"
                      />
                    ) : (
                      snap.closingFxRate.toFixed(4)
                    )}
                  </TableCell>
                  <TableCell>
                    {snap.isManuallyEdited && (
                      <Badge variant="secondary">Manual</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditing ? (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleSave(snap.id)}
                          disabled={isSaving}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={cancelEdit}
                          disabled={isSaving}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => startEdit(snap)}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        {snap.isManuallyEdited && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleReset(snap.id)}
                            disabled={isSaving}
                            title="Reset to allow syncing"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
