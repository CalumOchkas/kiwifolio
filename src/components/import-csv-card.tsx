"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Upload,
  Loader2,
  FileUp,
  ChevronDown,
  ChevronUp,
  Download,
  Plus,
  X,
  FileCheck,
  FileWarning,
} from "lucide-react";
import { parseCSV } from "@/lib/csv-import";
import type { BrokerFormat } from "@/lib/csv-import";

interface ImportCsvCardProps {
  portfolios: { id: string; name: string }[];
  defaultPortfolioId?: string;
}

interface FilePreview {
  file: File;
  fileName: string;
  format: string | null;
  tradeCount: number;
  dividendCount: number;
  warnings: string[];
  errors: string[];
  text: string;
}

interface FileImportResult {
  fileName: string;
  success: boolean;
  format: string | null;
  tradesImported: number;
  dividendsImported: number;
  warnings: string[];
  errors: string[];
}

interface ImportResult {
  success: boolean;
  totalTrades: number;
  totalDividends: number;
  files: FileImportResult[];
}

type FormatOption =
  | "auto"
  | "sharesies"
  | "hatch"
  | "stake"
  | "fidelity"
  | "kiwifolio";

const FORMAT_LABELS: Record<string, string> = {
  auto: "Auto-detect",
  sharesies: "Sharesies",
  hatch: "Hatch",
  stake: "Stake",
  fidelity: "Fidelity International",
  kiwifolio: "Custom (KiwiFolio)",
};

const FORMAT_INSTRUCTIONS: Record<FormatOption, React.ReactNode> = {
  auto: null,
  sharesies: (
    <ol className="list-decimal list-inside space-y-1">
      <li>
        Log in to Sharesies and go to your profile
      </li>
      <li>
        Navigate to <strong>Reports</strong> and select{" "}
        <strong>Transaction report</strong>
      </li>
      <li>
        Select the date range and click <strong>Download</strong>
      </li>
      <li>Upload the downloaded CSV file below</li>
    </ol>
  ),
  hatch: (
    <ol className="list-decimal list-inside space-y-1">
      <li>
        Log in to Hatch and go to <strong>Portfolio</strong>
      </li>
      <li>
        Navigate to <strong>Activity</strong> and click <strong>Export</strong>
      </li>
      <li>Select the date range and download the CSV</li>
      <li>Upload the downloaded CSV file below</li>
    </ol>
  ),
  stake: (
    <ol className="list-decimal list-inside space-y-1">
      <li>
        Log in to Stake and go to <strong>Profile &gt; Activity</strong>
      </li>
      <li>
        Under <strong>Reports</strong>, download the{" "}
        <strong>Investment Activity Report</strong> (XLSX)
      </li>
      <li>Open the XLSX file in Excel or Google Sheets</li>
      <li>
        Select the <strong>Trades</strong> tab containing your transaction data
      </li>
      <li>Save/export that sheet as a CSV file</li>
      <li>Upload the CSV file below</li>
    </ol>
  ),
  fidelity: (
    <ol className="list-decimal list-inside space-y-1">
      <li>
        Log in to Fidelity International and go to{" "}
        <strong>Transaction history</strong>
      </li>
      <li>
        Select the date range and click <strong>Download</strong> (CSV format)
      </li>
      <li>Upload the downloaded CSV file below</li>
    </ol>
  ),
  kiwifolio: null, // handled separately below with template download
};

const NEW_PORTFOLIO_VALUE = "__new__";

export function ImportCsvCard({ portfolios, defaultPortfolioId }: ImportCsvCardProps) {
  const router = useRouter();
  const [allPortfolios, setAllPortfolios] = useState(portfolios);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>(
    defaultPortfolioId ?? portfolios[0]?.id ?? ""
  );
  const [isCreatingPortfolio, setIsCreatingPortfolio] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [selectedFormat, setSelectedFormat] = useState<FormatOption>("auto");
  const [isImporting, setIsImporting] = useState(false);
  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [showWarnings, setShowWarnings] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handlePortfolioChange(value: string | null) {
    if (!value) return;
    if (value === NEW_PORTFOLIO_VALUE) {
      setIsCreatingPortfolio(true);
      setNewPortfolioName("");
    } else {
      setIsCreatingPortfolio(false);
      setSelectedPortfolioId(value);
    }
  }

  async function handleCreatePortfolio() {
    const name = newPortfolioName.trim();
    if (!name) return;

    try {
      const formData = new FormData();
      formData.append("name", name);

      const { createPortfolio } = await import("@/app/actions/portfolio");
      await createPortfolio(formData);

      const { getPortfolios } = await import("@/app/actions/portfolio");
      const updated = await getPortfolios();
      setAllPortfolios(updated);

      const created = updated.find((p) => p.name === name);
      if (created) {
        setSelectedPortfolioId(created.id);
      }

      setIsCreatingPortfolio(false);
      setNewPortfolioName("");
      router.refresh();
    } catch {
      // If creation fails, just stay in the create mode
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setResult(null);

    const newPreviews: FilePreview[] = [];
    const hint = selectedFormat !== "auto" ? (selectedFormat as BrokerFormat) : undefined;

    for (const file of Array.from(files)) {
      const text = await file.text();
      const parsed = parseCSV(text, hint);

      newPreviews.push({
        file,
        fileName: file.name,
        format: parsed.format,
        tradeCount: parsed.trades.length,
        dividendCount: parsed.dividends.length,
        warnings: parsed.warnings,
        errors: parsed.errors,
        text,
      });
    }

    setPreviews(newPreviews);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePreview(index: number) {
    setPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  function clearPreviews() {
    setPreviews([]);
    setResult(null);
  }

  async function handleImport() {
    if (previews.length === 0 || !selectedPortfolioId) return;

    setIsImporting(true);
    setResult(null);
    setShowWarnings(false);
    setShowErrors(false);

    const fileResults: FileImportResult[] = [];

    for (const preview of previews) {
      try {
        const formData = new FormData();
        formData.append("file", preview.file);
        formData.append("portfolioId", selectedPortfolioId);
        if (selectedFormat !== "auto") {
          formData.append("formatHint", selectedFormat);
        }

        const res = await fetch("/api/import-csv", {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        fileResults.push({
          fileName: preview.fileName,
          success: data.success ?? false,
          format: data.format ?? null,
          tradesImported: data.tradesImported ?? 0,
          dividendsImported: data.dividendsImported ?? 0,
          warnings: data.warnings ?? [],
          errors: data.errors ?? (data.error ? [data.error] : []),
        });
      } catch {
        fileResults.push({
          fileName: preview.fileName,
          success: false,
          format: null,
          tradesImported: 0,
          dividendsImported: 0,
          warnings: [],
          errors: ["Network error. Please try again."],
        });
      }
    }

    const anySuccess = fileResults.some((r) => r.success);

    setResult({
      success: anySuccess,
      totalTrades: fileResults.reduce((s, r) => s + r.tradesImported, 0),
      totalDividends: fileResults.reduce((s, r) => s + r.dividendsImported, 0),
      files: fileResults,
    });

    setPreviews([]);
    setIsImporting(false);
  }

  const instructions = FORMAT_INSTRUCTIONS[selectedFormat];
  const selectedPortfolioName =
    allPortfolios.find((p) => p.id === selectedPortfolioId)?.name ?? "";

  const validPreviews = previews.filter(
    (p) => p.format !== null && p.errors.length === 0
  );
  const totalPreviewTrades = previews.reduce((s, p) => s + p.tradeCount, 0);
  const totalPreviewDividends = previews.reduce((s, p) => s + p.dividendCount, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileUp className="h-5 w-5" />
          <CardTitle className="text-lg">Import Trades from CSV</CardTitle>
        </div>
        <CardDescription>
          Import trades and dividends from your broker&apos;s CSV export.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <label className="text-sm font-medium">Portfolio</label>
          {isCreatingPortfolio ? (
            <div className="flex gap-2">
              <Input
                placeholder="Portfolio name"
                value={newPortfolioName}
                onChange={(e) => setNewPortfolioName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreatePortfolio();
                  if (e.key === "Escape") setIsCreatingPortfolio(false);
                }}
                autoFocus
              />
              <Button
                size="sm"
                onClick={handleCreatePortfolio}
                disabled={!newPortfolioName.trim()}
              >
                Create
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setIsCreatingPortfolio(false)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Select
              value={selectedPortfolioId}
              onValueChange={handlePortfolioChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {selectedPortfolioName || "Select portfolio"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {allPortfolios.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value={NEW_PORTFOLIO_VALUE}>
                  <Plus className="h-3.5 w-3.5" />
                  Create New Portfolio
                </SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Broker Format</label>
          <Select
            value={selectedFormat}
            onValueChange={(v) => v && setSelectedFormat(v as FormatOption)}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                {FORMAT_LABELS[selectedFormat]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(FORMAT_LABELS) as FormatOption[]).map((key) => (
                <SelectItem key={key} value={key}>
                  {FORMAT_LABELS[key]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Broker-specific instructions */}
        {instructions && (
          <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">
              How to export from {FORMAT_LABELS[selectedFormat]}:
            </p>
            {instructions}
          </div>
        )}

        {/* Custom format instructions + template download */}
        {selectedFormat === "kiwifolio" && (
          <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">Custom CSV Format</p>
            <p>
              Use the KiwiFolio template to import trades from any broker.
              Download the template, fill in your transactions, and upload it.
            </p>
            <p>
              Each row should be a trade (<code>BUY</code>/<code>SELL</code>) or
              a <code>DIVIDEND</code>. Currency defaults to NZD if not
              specified. FX rates are fetched automatically if omitted.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open("/api/csv-template", "_blank")}
            >
              <Download className="mr-2 h-3 w-3" />
              Download Template CSV
            </Button>
          </div>
        )}

        {/* File picker */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          id="import-csv-input"
        />
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => fileInputRef.current?.click()}
          disabled={isImporting || !selectedPortfolioId}
        >
          <Upload className="mr-2 h-4 w-4" />
          Choose CSV Files
        </Button>

        {/* Validation Preview */}
        {previews.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {previews.length} file{previews.length !== 1 ? "s" : ""} selected
              </p>
              <button
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={clearPreviews}
              >
                Clear all
              </button>
            </div>

            <div className="space-y-2">
              {previews.map((p, i) => {
                const hasErrors = p.errors.length > 0 || !p.format;
                return (
                  <div
                    key={i}
                    className={`rounded-md border p-2.5 text-sm space-y-1 ${hasErrors ? "border-destructive/50 bg-destructive/5" : "border-green-500/30 bg-green-500/5"}`}
                  >
                    <div className="flex items-center gap-2">
                      {hasErrors ? (
                        <FileWarning className="h-4 w-4 shrink-0 text-destructive" />
                      ) : (
                        <FileCheck className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                      )}
                      <span className="font-medium truncate flex-1">{p.fileName}</span>
                      <button
                        className="text-muted-foreground hover:text-foreground p-0.5"
                        onClick={() => removePreview(i)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {p.format ? (
                      <p className="text-xs text-muted-foreground ml-6">
                        {FORMAT_LABELS[p.format] ?? p.format}
                        {" — "}
                        {p.tradeCount} trade{p.tradeCount !== 1 ? "s" : ""}
                        {p.dividendCount > 0 && (
                          <>, {p.dividendCount} dividend{p.dividendCount !== 1 ? "s" : ""}</>
                        )}
                        {p.warnings.length > 0 && (
                          <>, {p.warnings.length} warning{p.warnings.length !== 1 ? "s" : ""}</>
                        )}
                      </p>
                    ) : (
                      <ul className="text-xs text-destructive ml-6">
                        {p.errors.map((e, j) => (
                          <li key={j}>{e}</li>
                        ))}
                      </ul>
                    )}
                    {p.format && p.errors.length > 0 && (
                      <ul className="text-xs text-destructive ml-6">
                        {p.errors.map((e, j) => (
                          <li key={j}>{e}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Summary + Import button */}
            {validPreviews.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Ready to import {totalPreviewTrades} trade{totalPreviewTrades !== 1 ? "s" : ""}
                  {totalPreviewDividends > 0 && (
                    <> and {totalPreviewDividends} dividend{totalPreviewDividends !== 1 ? "s" : ""}</>
                  )}
                  {" "}from {validPreviews.length} file{validPreviews.length !== 1 ? "s" : ""}.
                  {validPreviews.length < previews.length && (
                    <> {previews.length - validPreviews.length} file{previews.length - validPreviews.length !== 1 ? "s" : ""} with errors will be skipped.</>
                  )}
                </p>
                <Button
                  className="w-full"
                  onClick={handleImport}
                  disabled={isImporting}
                >
                  {isImporting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {isImporting ? "Importing..." : "Import"}
                </Button>
              </div>
            )}

            {validPreviews.length === 0 && (
              <p className="text-xs text-destructive">
                No valid files to import. Please fix the errors above or select different files.
              </p>
            )}
          </div>
        )}

        {/* Import Result display */}
        {result && (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Badge variant={result.success ? "default" : "destructive"}>
                {result.success ? "Success" : "Error"}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {result.files.length} file{result.files.length !== 1 ? "s" : ""} processed
              </span>
            </div>

            {result.success && (
              <div className="text-sm space-y-1">
                {result.totalTrades > 0 && (
                  <p>
                    {result.totalTrades} trade
                    {result.totalTrades !== 1 ? "s" : ""} imported
                  </p>
                )}
                {result.totalDividends > 0 && (
                  <p>
                    {result.totalDividends} dividend
                    {result.totalDividends !== 1 ? "s" : ""} imported
                  </p>
                )}
              </div>
            )}

            {/* Per-file details */}
            {result.files.length > 1 && (
              <div className="space-y-2">
                {result.files.map((f, i) => (
                  <div key={i} className="rounded-md border p-2 text-sm space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={f.success ? "default" : "destructive"} className="text-xs">
                        {f.success ? "OK" : "Fail"}
                      </Badge>
                      <span className="font-medium truncate">{f.fileName}</span>
                      {f.format && (
                        <span className="text-xs text-muted-foreground">
                          ({FORMAT_LABELS[f.format] ?? f.format})
                        </span>
                      )}
                    </div>
                    {f.success && (f.tradesImported > 0 || f.dividendsImported > 0) && (
                      <p className="text-xs text-muted-foreground">
                        {f.tradesImported} trade{f.tradesImported !== 1 ? "s" : ""},{" "}
                        {f.dividendsImported} dividend{f.dividendsImported !== 1 ? "s" : ""}
                      </p>
                    )}
                    {f.errors.length > 0 && (
                      <ul className="text-xs text-destructive">
                        {f.errors.map((e, j) => <li key={j}>{e}</li>)}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Single-file: show format inline */}
            {result.files.length === 1 && result.files[0].format && (
              <span className="text-sm text-muted-foreground">
                Detected: {FORMAT_LABELS[result.files[0].format] ?? result.files[0].format}
              </span>
            )}

            {(() => {
              const allWarnings = result.files.flatMap((f) => f.warnings);
              const allErrors = result.files.flatMap((f) => f.errors);
              return (
                <>
                  {allWarnings.length > 0 && (
                    <div>
                      <button
                        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                        onClick={() => setShowWarnings((v) => !v)}
                      >
                        {showWarnings ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                        {allWarnings.length} warning
                        {allWarnings.length !== 1 ? "s" : ""}
                      </button>
                      {showWarnings && (
                        <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground max-h-40 overflow-y-auto">
                          {allWarnings.map((w, i) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {allErrors.length > 0 && (
                    <div>
                      <button
                        className="flex items-center gap-1 text-sm text-destructive hover:text-destructive/80"
                        onClick={() => setShowErrors((v) => !v)}
                      >
                        {showErrors ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                        {allErrors.length} error
                        {allErrors.length !== 1 ? "s" : ""}
                      </button>
                      {showErrors && (
                        <ul className="mt-1 space-y-0.5 text-xs text-destructive max-h-40 overflow-y-auto font-mono">
                          {allErrors.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Duplicate trades are skipped automatically.
        </p>
      </CardContent>
    </Card>
  );
}
