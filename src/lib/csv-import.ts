/**
 * CSV Import Parser
 *
 * Auto-detects broker format from column headers and normalizes rows
 * to KiwiFolio trade/dividend records. Pure logic — no DB or network calls.
 *
 * Supported formats: Sharesies, Hatch, Stake, Fidelity, KiwiFolio generic.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export type BrokerFormat =
  | "sharesies"
  | "hatch"
  | "stake"
  | "fidelity"
  | "kiwifolio";

/** Expected headers per broker format (used for error messages) */
export const EXPECTED_HEADERS: Record<BrokerFormat, string[]> = {
  sharesies: ["Trade ID", "Trade date", "Instrument code", "Instrument name", "Market code", "Quantity", "Price", "Transaction type", "Currency", "Amount", "Transaction fee"],
  hatch: ["Date", "Transaction type", "Symbol", "Investment name", "Description", "Amount (USD)", "Order fill price", "Order share quantity", "Order fee"],
  stake: ["Trade Date", "Settlement Date", "Symbol", "Side", "Units", "Avg. Price", "Currency"],
  fidelity: ["Order date", "Completion date", "Transaction type", "Status", "Investments", "Price per unit", "Quantity", "Amount"],
  kiwifolio: ["Ticker", "Type", "Date", "Quantity", "Price", "Brokerage", "Currency", "FxRate", "GrossAmount", "TaxWithheld"],
};

export interface ParsedTrade {
  ticker: string;
  tradeType: "BUY" | "SELL";
  tradeDate: Date;
  quantity: number;
  price: number;
  brokerage: number;
  currency: string;
  fxRateToNzd?: number;
  instrumentName?: string;
  exchange?: string;
}

export interface ParsedDividend {
  ticker: string;
  date: Date;
  grossAmount: number;
  taxWithheld: number;
  currency: string;
  fxRateToNzd?: number;
  instrumentName?: string;
  exchange?: string;
}

export interface ParseResult {
  format: BrokerFormat | null;
  trades: ParsedTrade[];
  dividends: ParsedDividend[];
  warnings: string[];
  errors: string[];
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function parseYMD(str: string): Date | null {
  // Strip time portion if present (e.g. "2025-10-30 01:39:46.380791 (UTC)")
  const dateOnly = str.trim().split(/[\sT]/)[0];
  const m = dateOnly.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (isNaN(d.getTime())) return null;
  return d;
}

function parseMDY(str: string): Date | null {
  const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[1] - 1, +m[2]));
  if (isNaN(d.getTime())) return null;
  return d;
}

/** Parses "DD/MM/YYYY" e.g. "09/12/2020" → 9 Dec 2020 */
function parseDMYSlash(str: string): Date | null {
  const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  if (isNaN(d.getTime())) return null;
  return d;
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Parses "DD Mon YYYY" e.g. "04 Mar 2026" */
function parseDMY(str: string): Date | null {
  const m = str.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTH_MAP[m[2].toLowerCase()];
  if (month === undefined) return null;
  const d = new Date(Date.UTC(+m[3], month, +m[1]));
  if (isNaN(d.getTime())) return null;
  return d;
}

// ── CSV tokenizer (RFC 4180) ─────────────────────────────────────────────────

export function parseCSVRows(text: string): string[][] {
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let i = 0;

  while (i < text.length) {
    const row: string[] = [];

    while (i < text.length) {
      let field = "";

      if (text[i] === '"') {
        // Quoted field
        i++; // skip opening quote
        while (i < text.length) {
          if (text[i] === '"') {
            if (i + 1 < text.length && text[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              i++; // skip closing quote
              break;
            }
          } else {
            field += text[i++];
          }
        }
      } else {
        // Unquoted field
        while (i < text.length && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          field += text[i++];
        }
      }

      row.push(field.trim());

      if (i < text.length && text[i] === ',') {
        i++; // skip comma, continue to next field
        // If comma was last character or next is newline, add trailing empty field
        if (i >= text.length || text[i] === '\n' || text[i] === '\r') {
          row.push("");
          break;
        }
      } else {
        break; // end of row
      }
    }

    // Skip line endings
    if (i < text.length && text[i] === '\r') i++;
    if (i < text.length && text[i] === '\n') i++;

    rows.push(row);
  }

  // Strip trailing empty rows
  while (rows.length > 0 && rows[rows.length - 1].every((f) => f === "")) {
    rows.pop();
  }

  return rows;
}

// ── Format detection ─────────────────────────────────────────────────────────

function normalizeHeaders(headers: string[]): string[] {
  return headers.map((h) => h.toLowerCase().trim());
}

function hasAll(headers: string[], required: string[]): boolean {
  return required.every((r) => headers.includes(r));
}

export function detectBrokerFormat(headers: string[]): BrokerFormat | null {
  const h = normalizeHeaders(headers);

  // Sharesies: old format has "order id" + "exchange rate"; new format has "trade id" + "market code"
  if (hasAll(h, ["order id", "instrument code", "exchange rate"])) return "sharesies";
  if (hasAll(h, ["trade id", "instrument code", "market code"])) return "sharesies";
  // Hatch: old format has "trade date" + "instrument code" + "comments"; new format has "symbol" + "order fill price"
  if (hasAll(h, ["trade date", "instrument code", "comments"]) && !h.includes("exchange rate")) return "hatch";
  if (hasAll(h, ["symbol", "order fill price", "order share quantity"])) return "hatch";
  // Stake: new format has "trade date" + "avg. price" + "nzd/usd rate"; old format has "settlement date (us)" + "effective price (usd)"
  if (hasAll(h, ["trade date", "symbol", "side", "avg. price"])) return "stake";
  if (hasAll(h, ["settlement date (us)", "side", "symbol"])) return "stake";
  if (hasAll(h, ["order date", "transaction type", "investments", "price per unit"])) return "fidelity";
  if (hasAll(h, ["ticker", "type", "date"])) return "kiwifolio";

  return null;
}

// ── Column index helper ──────────────────────────────────────────────────────

function colIndex(headers: string[], name: string): number {
  const n = name.toLowerCase();
  return normalizeHeaders(headers).indexOf(n);
}

function getField(row: string[], headers: string[], name: string): string {
  const idx = colIndex(headers, name);
  return idx >= 0 && idx < row.length ? row[idx] : "";
}

function getFloat(row: string[], headers: string[], name: string): number {
  const v = getField(row, headers, name).replace(/[,$£€]/g, "");
  return parseFloat(v) || 0;
}

// ── Sharesies parser ─────────────────────────────────────────────────────────

function parseSharesies(rows: string[][], headers: string[]): ParseResult {
  const trades: ParsedTrade[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +1 for 0-index, +1 for header row
    const txType = getField(row, headers, "transaction type").toUpperCase();

    if (txType !== "BUY" && txType !== "SELL") {
      if (txType) warnings.push(`Row ${rowNum}: skipped transaction type "${txType}"`);
      continue;
    }

    const dateStr = getField(row, headers, "trade date");
    const tradeDate = parseYMD(dateStr);
    if (!tradeDate) {
      errors.push(`Row ${rowNum}: invalid date "${dateStr}"`);
      continue;
    }

    const ticker = getField(row, headers, "instrument code").toUpperCase();
    const instrumentName = getField(row, headers, "instrument name") || undefined;
    const exchange = getField(row, headers, "market code").toUpperCase() || undefined;
    const quantity = getFloat(row, headers, "quantity");
    const price = getFloat(row, headers, "price");
    const brokerage = getFloat(row, headers, "transaction fee");
    const currency = getField(row, headers, "currency").toUpperCase() || "NZD";
    const exchangeRate = getFloat(row, headers, "exchange rate");

    if (!ticker) { errors.push(`Row ${rowNum}: missing ticker`); continue; }
    if (quantity <= 0) { errors.push(`Row ${rowNum}: invalid quantity`); continue; }
    if (price <= 0) { errors.push(`Row ${rowNum}: invalid price`); continue; }

    trades.push({
      ticker,
      tradeType: txType as "BUY" | "SELL",
      tradeDate,
      quantity,
      price,
      brokerage,
      currency,
      // Sharesies provides exchange rate — if 0 or missing, leave undefined for fetch
      fxRateToNzd: exchangeRate > 0 ? exchangeRate : undefined,
      instrumentName,
      exchange,
    });
  }

  return { format: "sharesies", trades, dividends: [], warnings, errors };
}

// ── Hatch parser ─────────────────────────────────────────────────────────────

// Money market fund tickers to skip (not real holdings)
const HATCH_SKIP_SYMBOLS = new Set(["DAGXX", "DARXX"]);

function parseHatch(rows: string[][], headers: string[]): ParseResult {
  const h = normalizeHeaders(headers);

  // Detect which format: new format has "symbol" + "order fill price"
  if (h.includes("symbol") && h.includes("order fill price")) {
    return parseHatchNew(rows, headers);
  }
  return parseHatchOld(rows, headers);
}

function parseHatchOld(rows: string[][], headers: string[]): ParseResult {
  const trades: ParsedTrade[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const txType = getField(row, headers, "transaction type").toUpperCase();

    if (txType !== "BUY" && txType !== "SELL") {
      if (txType) warnings.push(`Row ${rowNum}: skipped transaction type "${txType}"`);
      continue;
    }

    const dateStr = getField(row, headers, "trade date");
    const tradeDate = parseYMD(dateStr);
    if (!tradeDate) {
      errors.push(`Row ${rowNum}: invalid date "${dateStr}"`);
      continue;
    }

    const ticker = getField(row, headers, "instrument code").toUpperCase();
    const quantity = getFloat(row, headers, "quantity");
    const price = getFloat(row, headers, "price");

    if (!ticker) { errors.push(`Row ${rowNum}: missing ticker`); continue; }
    if (quantity <= 0) { errors.push(`Row ${rowNum}: invalid quantity`); continue; }
    if (price <= 0) { errors.push(`Row ${rowNum}: invalid price`); continue; }

    trades.push({
      ticker,
      tradeType: txType as "BUY" | "SELL",
      tradeDate,
      quantity,
      price,
      brokerage: 0,
      currency: "USD",
    });
  }

  return { format: "hatch", trades, dividends: [], warnings, errors };
}

function parseHatchNew(rows: string[][], headers: string[]): ParseResult {
  const trades: ParsedTrade[] = [];
  const dividends: ParsedDividend[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  // First pass: collect dividend tax rows keyed by ticker+date for matching
  const taxByTickerDate = new Map<string, number>();
  for (const row of rows) {
    const txType = getField(row, headers, "transaction type").toLowerCase();
    if (txType === "dividend tax") {
      const symbol = getField(row, headers, "symbol").toUpperCase();
      const dateStr = getField(row, headers, "date");
      const amount = Math.abs(getFloat(row, headers, "amount (usd)"));
      if (symbol && dateStr && amount > 0) {
        const key = `${symbol}|${dateStr}`;
        taxByTickerDate.set(key, (taxByTickerDate.get(key) ?? 0) + amount);
      }
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const txType = getField(row, headers, "transaction type").toLowerCase();
    const symbol = getField(row, headers, "symbol").toUpperCase();
    const instrumentName = getField(row, headers, "investment name") || undefined;
    const dateStr = getField(row, headers, "date");

    if (txType === "order - buy" || txType === "order - sell") {
      const tradeDate = parseDMYSlash(dateStr);
      if (!tradeDate) {
        errors.push(`Row ${rowNum}: invalid date "${dateStr}"`);
        continue;
      }

      const quantity = Math.abs(getFloat(row, headers, "order share quantity"));
      const price = Math.abs(getFloat(row, headers, "order fill price"));
      const brokerage = Math.abs(getFloat(row, headers, "order fee"));

      if (!symbol) { errors.push(`Row ${rowNum}: missing symbol`); continue; }
      if (quantity <= 0) { errors.push(`Row ${rowNum}: invalid quantity`); continue; }
      if (price <= 0) { errors.push(`Row ${rowNum}: invalid price`); continue; }

      trades.push({
        ticker: symbol,
        tradeType: txType === "order - buy" ? "BUY" : "SELL",
        tradeDate,
        quantity,
        price,
        brokerage,
        currency: "USD",
        instrumentName,
      });
    } else if (txType === "dividend") {
      // Skip money market funds and dividends with no symbol
      if (!symbol || HATCH_SKIP_SYMBOLS.has(symbol)) continue;

      const tradeDate = parseDMYSlash(dateStr);
      if (!tradeDate) {
        errors.push(`Row ${rowNum}: invalid date "${dateStr}"`);
        continue;
      }

      const grossAmount = Math.abs(getFloat(row, headers, "amount (usd)"));
      if (grossAmount <= 0) continue;

      // Look up matching withholding tax
      const taxKey = `${symbol}|${dateStr}`;
      const taxWithheld = taxByTickerDate.get(taxKey) ?? 0;

      dividends.push({
        ticker: symbol,
        date: tradeDate,
        grossAmount,
        taxWithheld,
        currency: "USD",
        instrumentName,
      });
    } else if (txType === "dividend tax" || txType === "deposit" || txType === "interest adjustment" || txType === "one-off us tax fee") {
      // Handled above or skippable — no warning
    } else {
      if (txType) warnings.push(`Row ${rowNum}: skipped transaction type "${txType}"`);
    }
  }

  return { format: "hatch", trades, dividends, warnings, errors };
}

// ── Stake parser ─────────────────────────────────────────────────────────────

function parseStake(rows: string[][], headers: string[]): ParseResult {
  const h = normalizeHeaders(headers);

  // Detect which format: new format has "avg. price"; old format has "effective price (usd)"
  if (h.includes("avg. price")) {
    return parseStakeNew(rows, headers);
  }
  return parseStakeOld(rows, headers);
}

function parseStakeNew(rows: string[][], headers: string[]): ParseResult {
  const trades: ParsedTrade[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    let side = getField(row, headers, "side").toUpperCase();
    if (side === "B") side = "BUY";
    if (side === "S") side = "SELL";

    if (side !== "BUY" && side !== "SELL") {
      if (side) warnings.push(`Row ${rowNum}: skipped side "${side}"`);
      continue;
    }

    const dateStr = getField(row, headers, "trade date");
    const tradeDate = parseYMD(dateStr);
    if (!tradeDate) {
      errors.push(`Row ${rowNum}: invalid date "${dateStr}"`);
      continue;
    }

    const ticker = getField(row, headers, "symbol").toUpperCase().trim();
    const quantity = Math.abs(getFloat(row, headers, "units"));
    const price = Math.abs(getFloat(row, headers, "avg. price"));
    const fees = Math.abs(getFloat(row, headers, "fees")) + Math.abs(getFloat(row, headers, "gst"));

    // Parse NZD/USD rate — may have "$" prefix e.g. "$1.744"
    const fxRateRaw = getField(row, headers, "nzd/usd rate").replace(/[$\s]/g, "");
    const fxRate = parseFloat(fxRateRaw) || 0;

    if (!ticker) { errors.push(`Row ${rowNum}: missing ticker`); continue; }
    if (quantity <= 0) { errors.push(`Row ${rowNum}: invalid quantity`); continue; }
    if (price <= 0) { errors.push(`Row ${rowNum}: invalid price`); continue; }

    trades.push({
      ticker,
      tradeType: side as "BUY" | "SELL",
      tradeDate,
      quantity,
      price,
      brokerage: fees,
      currency: getField(row, headers, "currency").toUpperCase() || "USD",
      fxRateToNzd: fxRate > 0 ? fxRate : undefined,
    });
  }

  return { format: "stake", trades, dividends: [], warnings, errors };
}

function parseStakeOld(rows: string[][], headers: string[]): ParseResult {
  const trades: ParsedTrade[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    let side = getField(row, headers, "side").toUpperCase();
    if (side === "B") side = "BUY";
    if (side === "S") side = "SELL";

    if (side !== "BUY" && side !== "SELL") {
      if (side) warnings.push(`Row ${rowNum}: skipped side "${side}"`);
      continue;
    }

    const dateStr = getField(row, headers, "settlement date (us)");
    const tradeDate = parseMDY(dateStr);
    if (!tradeDate) {
      errors.push(`Row ${rowNum}: invalid date "${dateStr}"`);
      continue;
    }

    const ticker = getField(row, headers, "symbol").toUpperCase();
    const quantity = getFloat(row, headers, "units");
    const price = getFloat(row, headers, "effective price (usd)");
    const brokerage = getFloat(row, headers, "brokerage fee (usd)");

    if (!ticker) { errors.push(`Row ${rowNum}: missing ticker`); continue; }
    if (quantity <= 0) { errors.push(`Row ${rowNum}: invalid quantity`); continue; }
    if (price <= 0) { errors.push(`Row ${rowNum}: invalid price`); continue; }

    trades.push({
      ticker,
      tradeType: side as "BUY" | "SELL",
      tradeDate,
      quantity,
      price,
      brokerage,
      currency: "USD",
    });
  }

  return { format: "stake", trades, dividends: [], warnings, errors };
}

// ── Fidelity International parser ─────────────────────────────────────────────

// Buy-type transaction types in Fidelity International exports
const FIDELITY_BUY_TYPES = new Set([
  "buy", "lump sum investment",
]);
const FIDELITY_SELL_TYPES = new Set([
  "sell", "sale of partial shares",
]);

function parseFidelity(rows: string[][], headers: string[]): ParseResult {
  const trades: ParsedTrade[] = [];
  const dividends: ParsedDividend[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const status = getField(row, headers, "status").toLowerCase();
    const txType = getField(row, headers, "transaction type").toLowerCase();

    // Skip cancelled/pending
    if (status === "cancelled" || status === "pending") {
      warnings.push(`Row ${rowNum}: skipped ${status} transaction`);
      continue;
    }

    // Use completion date if available, fall back to order date
    let dateStr = getField(row, headers, "completion date");
    if (!dateStr || dateStr.toLowerCase() === "pending") {
      dateStr = getField(row, headers, "order date");
    }
    const date = parseDMY(dateStr);
    if (!date) {
      if (txType) errors.push(`Row ${rowNum}: invalid date "${dateStr}"`);
      continue;
    }

    // Investment name as ticker — strip quotes, use short form
    const investmentRaw = getField(row, headers, "investments");
    if (!investmentRaw || investmentRaw.toLowerCase() === "cash") {
      if (txType) warnings.push(`Row ${rowNum}: skipped "${txType}" for Cash`);
      continue;
    }

    // Use the investment name as-is (users will see the full name as the ticker)
    const ticker = investmentRaw.toUpperCase();
    const instrumentName = investmentRaw || undefined;

    const isBuy = FIDELITY_BUY_TYPES.has(txType);
    const isSell = FIDELITY_SELL_TYPES.has(txType);

    if (isBuy || isSell) {
      const quantity = Math.abs(getFloat(row, headers, "quantity"));
      const price = Math.abs(getFloat(row, headers, "price per unit"));
      if (quantity <= 0 || price <= 0) {
        errors.push(`Row ${rowNum}: invalid quantity or price`);
        continue;
      }
      trades.push({
        ticker,
        tradeType: isBuy ? "BUY" : "SELL",
        tradeDate: date,
        quantity,
        price,
        brokerage: 0,
        currency: "GBP",
        instrumentName,
      });
    } else if (txType.includes("dividend")) {
      const amount = Math.abs(getFloat(row, headers, "amount"));
      if (amount <= 0) {
        errors.push(`Row ${rowNum}: invalid dividend amount`);
        continue;
      }
      dividends.push({
        ticker,
        date,
        grossAmount: amount,
        taxWithheld: 0,
        currency: "GBP",
        instrumentName,
      });
      if (dividends.length === 1) {
        warnings.push(
          "Fidelity dividends imported with taxWithheld=0. " +
          "Please update tax withheld amounts manually if applicable."
        );
      }
    } else {
      if (txType) warnings.push(`Row ${rowNum}: skipped transaction type "${txType}"`);
    }
  }

  return { format: "fidelity", trades, dividends, warnings, errors };
}

// ── KiwiFolio generic parser ─────────────────────────────────────────────────

function parseKiwiFolioFormat(rows: string[][], headers: string[]): ParseResult {
  const trades: ParsedTrade[] = [];
  const dividends: ParsedDividend[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const type = getField(row, headers, "type").toUpperCase();
    const dateStr = getField(row, headers, "date");
    const date = parseYMD(dateStr);
    if (!date) {
      errors.push(`Row ${rowNum}: invalid date "${dateStr}"`);
      continue;
    }

    const ticker = getField(row, headers, "ticker").toUpperCase();
    const currency = getField(row, headers, "currency").toUpperCase() || "NZD";
    const fxRate = getFloat(row, headers, "fxrate");

    if (!ticker) { errors.push(`Row ${rowNum}: missing ticker`); continue; }

    if (type === "BUY" || type === "SELL") {
      const quantity = getFloat(row, headers, "quantity");
      const price = getFloat(row, headers, "price");
      const brokerage = getFloat(row, headers, "brokerage");
      if (quantity <= 0) { errors.push(`Row ${rowNum}: invalid quantity`); continue; }
      if (price <= 0) { errors.push(`Row ${rowNum}: invalid price`); continue; }

      trades.push({
        ticker,
        tradeType: type,
        tradeDate: date,
        quantity,
        price,
        brokerage,
        currency,
        fxRateToNzd: fxRate > 0 ? fxRate : undefined,
      });
    } else if (type === "DIVIDEND") {
      const grossAmount = getFloat(row, headers, "grossamount");
      const taxWithheld = getFloat(row, headers, "taxwithheld");
      if (grossAmount <= 0) { errors.push(`Row ${rowNum}: invalid gross amount`); continue; }

      dividends.push({
        ticker,
        date,
        grossAmount,
        taxWithheld,
        currency,
        fxRateToNzd: fxRate > 0 ? fxRate : undefined,
      });
    } else {
      if (type) warnings.push(`Row ${rowNum}: skipped type "${type}"`);
    }
  }

  return { format: "kiwifolio", trades, dividends, warnings, errors };
}

// ── Main entry point ─────────────────────────────────────────────────────────

export function parseCSV(text: string, formatHint?: BrokerFormat): ParseResult {
  const allRows = parseCSVRows(text);
  if (allRows.length < 2) {
    return { format: null, trades: [], dividends: [], warnings: [], errors: ["CSV file contains no data rows"] };
  }

  // Try to detect format from each row (handles metadata preambles like Fidelity)
  let headerRowIndex = -1;
  let format: BrokerFormat | null = null;

  for (let i = 0; i < Math.min(allRows.length, 20); i++) {
    const detected = detectBrokerFormat(allRows[i]);
    if (detected) {
      headerRowIndex = i;
      format = detected;
      break;
    }
  }

  if (headerRowIndex === -1 || !format) {
    const foundHeaders = allRows[0].join(", ");
    const errorMessages: string[] = [];

    if (formatHint && EXPECTED_HEADERS[formatHint]) {
      const FORMAT_LABELS: Record<BrokerFormat, string> = {
        sharesies: "Sharesies", hatch: "Hatch", stake: "Stake",
        fidelity: "Fidelity International", kiwifolio: "KiwiFolio",
      };
      errorMessages.push(
        `Could not detect ${FORMAT_LABELS[formatHint]} format from the uploaded file.`,
        `Expected headers: ${EXPECTED_HEADERS[formatHint].join(", ")}`,
        `Received headers: ${foundHeaders}`,
      );
    } else {
      errorMessages.push(
        "Could not detect CSV format. Supported formats: Sharesies, Hatch, Stake, Fidelity, KiwiFolio.",
        `Headers found: ${foundHeaders}`,
      );
    }

    return {
      format: null,
      trades: [],
      dividends: [],
      warnings: [],
      errors: errorMessages,
    };
  }

  const headers = allRows[headerRowIndex];
  const dataRows = allRows.slice(headerRowIndex + 1);

  if (dataRows.length === 0) {
    return { format, trades: [], dividends: [], warnings: [], errors: ["CSV file contains no data rows"] };
  }

  const parsers: Record<BrokerFormat, (rows: string[][], headers: string[]) => ParseResult> = {
    sharesies: parseSharesies,
    hatch: parseHatch,
    stake: parseStake,
    fidelity: parseFidelity,
    kiwifolio: parseKiwiFolioFormat,
  };

  return parsers[format](dataRows, headers);
}
