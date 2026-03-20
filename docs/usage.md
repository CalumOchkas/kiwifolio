# Usage Guide

## Getting Started

1. Open KiwiFolio at [http://localhost:3000](http://localhost:3000).
2. Create your first portfolio from the Dashboard.
3. Add trades and dividends — either manually or via CSV import.

## CSV Import

Import transaction history from your broker under **Settings > Import**.

### Supported Brokers

| Broker | Format | Notes |
|--------|--------|-------|
| Sharesies | CSV export from transaction history | Auto-detected |
| Hatch | CSV export from transaction history | Auto-detected |
| Stake | CSV export from transaction history | Auto-detected |
| Fidelity International | CSV export from transaction history | Auto-detected |
| Generic | KiwiFolio template format | Download the template from the import page |

### How It Works

1. Go to **Settings > Import**.
2. Select the target portfolio.
3. Upload your CSV file — the broker format is auto-detected, or you can select it manually.
4. Review the import summary (new trades, dividends, duplicates skipped).
5. Missing FX rates are fetched automatically from Yahoo Finance during import.

### Generic CSV Format

Download the template from the import page. The expected columns are:

| Column | Description | Example |
|--------|-------------|---------|
| `Ticker` | Stock symbol | `AAPL` |
| `Type` | `BUY`, `SELL`, or `DIVIDEND` | `BUY` |
| `Date` | Transaction date | `2024-06-15` |
| `Quantity` | Number of shares | `10` |
| `Price` | Price per share in native currency | `150.00` |
| `Brokerage` | Brokerage fee in native currency | `0.50` |
| `Currency` | Currency code | `USD` |
| `FxRate` | FX rate to NZD (optional — fetched if blank) | `1.65` |
| `GrossAmount` | Dividend gross amount (dividends only) | `12.50` |
| `TaxWithheld` | Tax withheld (dividends only) | `1.88` |

## Yahoo Symbol Mapping

When importing from brokers that use fund names instead of ticker symbols, KiwiFolio may not automatically resolve the correct Yahoo Finance symbol.

To configure this:

1. Go to **Holdings** and select a portfolio.
2. Open the **Settings** tab.
3. For any holding showing the wrong name or missing market data, enter the correct Yahoo Finance symbol (e.g., `AAPL`, `SPY`, `FNZ.NZ`).

### Finding the Right Symbol

Search for the stock on [Yahoo Finance](https://finance.yahoo.com/) and use the symbol shown in the URL or search results. Common patterns:

- US stocks: `AAPL`, `MSFT`, `TSLA`
- NZX stocks: `SPK.NZ`, `FPH.NZ`
- ASX stocks: `CSL.AX`, `BHP.AX`
- LSE stocks: `SHEL.L`, `BP.L`

## FIF Tax Report

The NZ FIF tax year runs from **1 April to 31 March**. Tax years are displayed as `"2024-2025"` (April 2024 through March 2025).

### Workflow

1. Go to **Tax Report**.
2. Select one or more portfolios and a tax year.
3. Click **Sync Market Data** to fetch opening/closing prices and FX rates from Yahoo Finance.
4. Review the results:
   - **FDR method** — Fair Dividend Rate (5% of opening value + Quick Sale Adjustments)
   - **CV method** — Comparative Value (closing - opening + sales + dividends - purchases)
   - The optimal (lower tax) method is highlighted.
5. Check the **De Minimis** indicator — if your total foreign cost basis is below $50,000 NZD, you may be exempt from FIF tax.
6. Review **Foreign Tax Credits** — total withholding tax on dividends that can be claimed.

### Manual Overrides

If Yahoo Finance data is missing or incorrect (e.g., for delisted stocks), you can manually edit:

- Opening and closing prices
- FX rates

Click the edit icon next to any value in the tax report table to override it. Overridden values are preserved across re-syncs.

### CSV Export

Click **Export CSV** on the tax report page to download a detailed FIF report with FDR, CV, and summary sections.

## Known Limitations

- **Yahoo Finance dependency** — Market data and FX rates come from Yahoo Finance, which may be unreliable, rate-limited, or missing data for certain instruments.
- **No authentication** — The app trusts all requests. Run on a trusted network only.
- **Single-user** — SQLite does not support concurrent access from multiple users.
- **Not tax advice** — FIF calculations are provided as a tool. Always verify with a tax professional.
- **Stock splits** — Detected automatically via Yahoo Finance, but may not cover all cases. Check quantities after splits.

## Troubleshooting

### Market data not loading

- Check **Settings > Data Issues** for sync errors.
- Verify that the Yahoo Finance symbol is correct in the Holdings Settings tab.
- The background sync runs automatically on a schedule (configurable under Settings > Sync Schedule).
- Click **Sync Market Data** on the Tax Report page to force a manual sync for that tax year.

### Wrong prices or FX rates

- Use the manual override feature on the Tax Report page to correct specific values.
- Check if a stock split was missed under Settings > Data Issues.

### Database issues after restore

- The app requires a restart after restoring a database. Stop and start the container.
- A pre-restore backup is saved automatically in the `data/` directory.

### Background sync not running

- Check that sync is enabled under **Settings > Sync Schedule**.
- The sync interval is configurable (default: every 4 hours).
- The sidebar footer shows the current sync status and last sync time.
