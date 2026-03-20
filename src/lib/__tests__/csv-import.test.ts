import { describe, it, expect } from "vitest";
import {
  parseCSVRows,
  detectBrokerFormat,
  parseCSV,
  type ParseResult,
} from "../csv-import";

// ── CSV Tokenizer ────────────────────────────────────────────────────────────

describe("parseCSVRows", () => {
  it("parses simple comma-separated rows", () => {
    const rows = parseCSVRows("a,b,c\n1,2,3");
    expect(rows).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });

  it("handles quoted fields with commas", () => {
    const rows = parseCSVRows('a,"b,c",d\n1,"2,3",4');
    expect(rows).toEqual([["a", "b,c", "d"], ["1", "2,3", "4"]]);
  });

  it("handles escaped quotes inside quoted fields", () => {
    const rows = parseCSVRows('a,"say ""hello""",c');
    expect(rows).toEqual([["a", 'say "hello"', "c"]]);
  });

  it("handles empty fields", () => {
    const rows = parseCSVRows("a,,c\n,2,");
    expect(rows).toEqual([["a", "", "c"], ["", "2", ""]]);
  });

  it("strips BOM", () => {
    const rows = parseCSVRows("\uFEFFa,b\n1,2");
    expect(rows).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("strips trailing empty rows", () => {
    const rows = parseCSVRows("a,b\n1,2\n\n\n");
    expect(rows).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("handles CRLF line endings", () => {
    const rows = parseCSVRows("a,b\r\n1,2\r\n");
    expect(rows).toEqual([["a", "b"], ["1", "2"]]);
  });
});

// ── Format Detection ─────────────────────────────────────────────────────────

describe("detectBrokerFormat", () => {
  it("detects Sharesies", () => {
    const headers = [
      "Order ID", "Trade date", "Instrument code", "Market code",
      "Quantity", "Price", "Transaction type", "Exchange rate",
      "Transaction fee", "Currency", "Amount", "Transaction method",
    ];
    expect(detectBrokerFormat(headers)).toBe("sharesies");
  });

  it("detects Hatch", () => {
    const headers = [
      "Trade Date", "Instrument Code", "Quantity", "Price",
      "Transaction Type", "Comments",
    ];
    expect(detectBrokerFormat(headers)).toBe("hatch");
  });

  it("detects Stake", () => {
    const headers = [
      "SETTLEMENT DATE (US)", "SIDE", "UNITS",
      "EFFECTIVE PRICE (USD)", "BROKERAGE FEE (USD)", "SYMBOL",
    ];
    expect(detectBrokerFormat(headers)).toBe("stake");
  });

  it("detects Fidelity International", () => {
    const headers = [
      "Order date", "Completion date", "Transaction type", "Investments",
      "Product Wrapper", "Account Number", "Source investment", "Amount",
      "Quantity", "Price per unit", "Reference Number", "Status",
    ];
    expect(detectBrokerFormat(headers)).toBe("fidelity");
  });

  it("detects KiwiFolio generic", () => {
    const headers = ["Ticker", "Type", "Date", "Quantity", "Price", "Brokerage", "Currency", "FxRate"];
    expect(detectBrokerFormat(headers)).toBe("kiwifolio");
  });

  it("returns null for unknown headers", () => {
    expect(detectBrokerFormat(["foo", "bar", "baz"])).toBeNull();
  });
});

// ── Sharesies Parser ─────────────────────────────────────────────────────────

describe("parseCSV — Sharesies", () => {
  const csv = [
    "Order ID,Trade date,Instrument code,Market code,Quantity,Price,Transaction type,Exchange rate,Transaction fee,Currency,Amount,Transaction method",
    "abc-123,2024-06-15,AAPL,NASDAQ,10,150.50,BUY,1.62,1.00,USD,1506.00,MARKET_TRADE",
    "abc-456,2024-09-01,AAPL,NASDAQ,5,180.00,SELL,1.65,1.00,USD,899.00,MARKET_TRADE",
    "abc-789,2024-07-01,FNZ,NZX,100,2.50,BUY,1.00,0.00,NZD,250.00,MARKET_TRADE",
  ].join("\n");

  it("detects format as sharesies", () => {
    const result = parseCSV(csv);
    expect(result.format).toBe("sharesies");
  });

  it("parses all trade rows", () => {
    const result = parseCSV(csv);
    expect(result.trades).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
  });

  it("maps fields correctly", () => {
    const result = parseCSV(csv);
    const trade = result.trades[0];
    expect(trade.ticker).toBe("AAPL");
    expect(trade.tradeType).toBe("BUY");
    expect(trade.tradeDate.toISOString()).toBe("2024-06-15T00:00:00.000Z");
    expect(trade.quantity).toBe(10);
    expect(trade.price).toBe(150.50);
    expect(trade.brokerage).toBe(1.00);
    expect(trade.currency).toBe("USD");
    expect(trade.fxRateToNzd).toBe(1.62);
  });

  it("maps SELL correctly", () => {
    const result = parseCSV(csv);
    expect(result.trades[1].tradeType).toBe("SELL");
  });

  it("skips non-BUY/SELL rows with warning", () => {
    const csvWithTransfer = csv + "\nabc-999,2024-08-01,AAPL,NASDAQ,5,160.00,TRANSFER,1.60,0.00,USD,800.00,TRANSFER";
    const result = parseCSV(csvWithTransfer);
    expect(result.trades).toHaveLength(3);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("TRANSFER");
  });
});

// ── Hatch Parser ─────────────────────────────────────────────────────────────

describe("parseCSV — Hatch", () => {
  const csv = [
    "Trade Date,Instrument Code,Quantity,Price,Transaction Type,Comments",
    "2024-06-15,TSLA,5,250.00,BUY,orderNo: HDJ123",
    "2024-09-01,TSLA,2,300.00,SELL,orderNo: HDJ456",
  ].join("\n");

  it("detects format as hatch", () => {
    expect(parseCSV(csv).format).toBe("hatch");
  });

  it("parses trades with USD currency and no brokerage", () => {
    const result = parseCSV(csv);
    expect(result.trades).toHaveLength(2);

    const buy = result.trades[0];
    expect(buy.ticker).toBe("TSLA");
    expect(buy.tradeType).toBe("BUY");
    expect(buy.quantity).toBe(5);
    expect(buy.price).toBe(250);
    expect(buy.brokerage).toBe(0);
    expect(buy.currency).toBe("USD");
    expect(buy.fxRateToNzd).toBeUndefined();
  });
});

// ── Stake Parser ─────────────────────────────────────────────────────────────

describe("parseCSV — Stake", () => {
  const csv = [
    "SETTLEMENT DATE (US),SIDE,UNITS,EFFECTIVE PRICE (USD),BROKERAGE FEE (USD),SYMBOL",
    "01/15/2024,BUY,10,150.00,3.00,AAPL",
    "06/20/2024,SELL,5,180.00,3.00,AAPL",
  ].join("\n");

  it("detects format as stake", () => {
    expect(parseCSV(csv).format).toBe("stake");
  });

  it("parses MM/DD/YYYY dates correctly", () => {
    const result = parseCSV(csv);
    expect(result.trades[0].tradeDate.toISOString()).toBe("2024-01-15T00:00:00.000Z");
    expect(result.trades[1].tradeDate.toISOString()).toBe("2024-06-20T00:00:00.000Z");
  });

  it("includes brokerage and defaults to USD", () => {
    const result = parseCSV(csv);
    expect(result.trades[0].brokerage).toBe(3);
    expect(result.trades[0].currency).toBe("USD");
    expect(result.trades[0].fxRateToNzd).toBeUndefined();
  });

  it("maps short side codes", () => {
    const csvShort = [
      "SETTLEMENT DATE (US),SIDE,UNITS,EFFECTIVE PRICE (USD),BROKERAGE FEE (USD),SYMBOL",
      "01/15/2024,B,10,150.00,0,AAPL",
      "06/20/2024,S,5,180.00,0,AAPL",
    ].join("\n");
    const result = parseCSV(csvShort);
    expect(result.trades[0].tradeType).toBe("BUY");
    expect(result.trades[1].tradeType).toBe("SELL");
  });
});

// ── Fidelity International Parser ─────────────────────────────────────────────

describe("parseCSV — Fidelity International", () => {
  // Includes metadata preamble like the real export
  const csv = [
    'Account ,All Accounts',
    'Timeframe,01/03/2014-18/03/2026',
    'Transaction type,Custom',
    'Investment name,All Investments',
    'Valuations,"£152,733.84"',
    '',
    'Order date,Completion date,Transaction type,Investments,Product Wrapper,Account Number,Source investment,Amount,Quantity,Price per unit,Reference Number,Status,',
    '18 Jun 2020,23 Jun 2020,Buy,"ISHARES VII PLC, ISHARES CORE S&P 500 UCITS ETF USD (ACC) (CSP1)",Investment ISA,OCHX000017,,3031.74,12,251.81,346637752,Completed,',
    '18 Aug 2025,22 Aug 2025,Sell,"Fidelity Index Japan Fund P-Accumulation",Investment ISA,OCHX000017,,-7956.41,3092.03,2.57,1155856001,Completed,',
    '29 May 2018,Pending,Buy,"ISHARES VII PLC, ISHARES CORE S&P 500 UCITS ETF USD (ACC) (CSP1)",Investment ISA,OCHX000017,,0.00,0,196,149130741,Cancelled,',
    '04 Mar 2026,04 Mar 2026,Transfer To Cash Management Account For Fees,"Cash",Investment ISA,OCHX000017,,-22.98,22.98,1,1251934949,Completed,',
  ].join("\n");

  it("detects format as fidelity despite metadata preamble", () => {
    expect(parseCSV(csv).format).toBe("fidelity");
  });

  it("parses Buy and Sell trades with DD Mon YYYY dates", () => {
    const result = parseCSV(csv);
    expect(result.trades).toHaveLength(2);

    const buy = result.trades[0];
    expect(buy.tradeType).toBe("BUY");
    expect(buy.quantity).toBe(12);
    expect(buy.price).toBe(251.81);
    expect(buy.currency).toBe("GBP");
    expect(buy.tradeDate.toISOString()).toBe("2020-06-23T00:00:00.000Z"); // uses completion date

    const sell = result.trades[1];
    expect(sell.tradeType).toBe("SELL");
    expect(sell.ticker).toBe("FIDELITY INDEX JAPAN FUND P-ACCUMULATION");
    expect(sell.quantity).toBe(3092.03);
    expect(sell.price).toBe(2.57);
  });

  it("skips cancelled rows with warning", () => {
    const result = parseCSV(csv);
    expect(result.warnings.some((w) => w.includes("cancelled"))).toBe(true);
  });

  it("skips Cash transactions with warning", () => {
    const result = parseCSV(csv);
    expect(result.warnings.some((w) => w.toLowerCase().includes("cash"))).toBe(true);
  });

  it("uses Completion date instead of Order date", () => {
    const result = parseCSV(csv);
    // Buy: Order date 18 Jun 2020, Completion date 23 Jun 2020 — should use completion
    expect(result.trades[0].tradeDate.toISOString()).toBe("2020-06-23T00:00:00.000Z");
  });

  it("handles the real Fidelity export file structure", () => {
    const result = parseCSV(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.trades.length).toBeGreaterThan(0);
  });
});

// ── KiwiFolio Generic Format ─────────────────────────────────────────────────

describe("parseCSV — KiwiFolio generic", () => {
  const csv = [
    "Ticker,Type,Date,Quantity,Price,Brokerage,Currency,FxRate,GrossAmount,TaxWithheld",
    "AAPL,BUY,2024-06-01,10,150.00,1.00,USD,1.65,,,",
    "AAPL,SELL,2024-09-01,5,180.00,1.00,USD,1.60,,,",
    "AAPL,DIVIDEND,2024-08-15,,,,,1.62,50.00,7.50",
  ].join("\n");

  it("detects format as kiwifolio", () => {
    expect(parseCSV(csv).format).toBe("kiwifolio");
  });

  it("parses trades and dividends", () => {
    const result = parseCSV(csv);
    expect(result.trades).toHaveLength(2);
    expect(result.dividends).toHaveLength(1);
  });

  it("maps trade fields correctly", () => {
    const result = parseCSV(csv);
    const t = result.trades[0];
    expect(t.ticker).toBe("AAPL");
    expect(t.tradeType).toBe("BUY");
    expect(t.quantity).toBe(10);
    expect(t.price).toBe(150);
    expect(t.brokerage).toBe(1);
    expect(t.currency).toBe("USD");
    expect(t.fxRateToNzd).toBe(1.65);
  });

  it("maps dividend fields correctly", () => {
    const result = parseCSV(csv);
    const d = result.dividends[0];
    expect(d.ticker).toBe("AAPL");
    expect(d.grossAmount).toBe(50);
    expect(d.taxWithheld).toBe(7.5);
    expect(d.fxRateToNzd).toBe(1.62);
  });
});

// ── Edge Cases ───────────────────────────────────────────────────────────────

describe("parseCSV — edge cases", () => {
  it("returns error for empty CSV", () => {
    const result = parseCSV("");
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.trades).toHaveLength(0);
  });

  it("returns error for header-only CSV", () => {
    const result = parseCSV("a,b,c");
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns error for unknown format", () => {
    const result = parseCSV("foo,bar,baz\n1,2,3");
    expect(result.format).toBeNull();
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("Could not detect");
  });

  it("handles rows with invalid data gracefully", () => {
    const csv = [
      "Trade Date,Instrument Code,Quantity,Price,Transaction Type,Comments",
      "2024-06-15,AAPL,abc,150.00,BUY,test",  // invalid quantity
      "bad-date,TSLA,10,200.00,BUY,test",       // invalid date
      "2024-08-01,MSFT,5,300.00,BUY,test",      // valid
    ].join("\n");

    const result = parseCSV(csv);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].ticker).toBe("MSFT");
    expect(result.errors).toHaveLength(2);
  });
});
