# KiwiFolio

A self-hosted web application for New Zealand residents to track foreign stock portfolios and calculate Foreign Investment Fund (FIF) tax liabilities.

## Features

- **Portfolio Management** — Create multiple portfolios, record trades and dividends with full currency and FX rate tracking
- **CSV Import** — Import transaction history from Sharesies, Hatch, Stake, or Fidelity International
- **FIF Tax Calculations** — Computes both Fair Dividend Rate (FDR) and Comparative Value (CV) methods per IRD guidelines, including Quick Sale Adjustments
- **De Minimis Threshold** — Tracks the $50,000 NZD cost-basis threshold to determine FIF exemption eligibility
- **Foreign Tax Credits** — Aggregates withholding tax on dividends for FTC claims
- **Market Data** — Fetches historical prices and FX rates from Yahoo Finance with local caching
- **Manual Overrides** — Edit snapshot prices and FX rates when API data is missing or incorrect
- **CSV Export** — Download FIF tax reports as CSV files
- **Database Backup/Restore** — Download and upload the raw SQLite database file through the UI

## Quick Start

### Docker Run

```bash
docker run -d \
  --name kiwifolio \
  -p 3000:3000 \
  -v ./data:/app/data \
  ghcr.io/calumochkas/kiwifolio:latest
```

### Docker Compose

```bash
curl -O https://raw.githubusercontent.com/calumochkas/kiwifolio/main/docker-compose.yml
docker compose up -d
```

Open [http://localhost:3000](http://localhost:3000). On first run, a clean database is created automatically.

## Data Persistence

Your database is stored at `./data/kiwifolio.db` on the host. This file is bind-mounted into the container, so your data survives container restarts and upgrades.

**Backup:** Go to Settings > Database > Download Backup, or copy `./data/kiwifolio.db` directly.

**Restore:** Go to Settings > Database > Restore from Backup, or stop the container, replace `./data/kiwifolio.db`, and restart.

See [docs/deployment.md](docs/deployment.md) for the full deployment guide.

## Security

KiwiFolio has **no authentication**. It is designed for trusted local networks and should not be exposed directly to the public internet. If remote access is needed, place it behind a reverse proxy with authentication (e.g., Tailscale, Cloudflare Tunnel with Access). See [SECURITY.md](SECURITY.md) for details.

## Usage

1. **Create a portfolio** from the Dashboard
2. **Add trades and dividends** manually, or **import a CSV** from Sharesies, Hatch, Stake, or Fidelity International under Settings > Import
3. **Configure Yahoo symbols** in the Settings tab for holdings imported with fund names instead of ticker symbols
4. **View the Dashboard** for global and per-portfolio market values, gains, and returns
5. **View Holdings** — the Overview tab shows a configurable table with column visibility toggles and sorting
6. **Mark FIF-exempt tickers** (e.g., certain ASX stocks) in the Settings tab
7. **Go to the Tax Report**, select a portfolio and tax year, then click **Sync Market Data** to fetch opening/closing prices and FX rates
8. **Review the FDR vs CV comparison** — the optimal (lower) method is highlighted
9. **Export to CSV** or **backup the database** from the Settings pages

See [docs/usage.md](docs/usage.md) for detailed usage documentation.

## Local Development

### Prerequisites

- Node.js 22+
- npm

### Setup

```bash
git clone https://github.com/calumochkas/kiwifolio.git
cd kiwifolio

npm install
npx prisma generate
npx prisma db push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Tests

```bash
npm test          # Single run
npx vitest        # Watch mode
```

## Tech Stack

- **Framework:** Next.js 16 (App Router, Server Components, Server Actions)
- **Database:** SQLite via Prisma ORM v7 with `@prisma/adapter-libsql`
- **UI:** shadcn/ui v4, Tailwind CSS v4
- **Market Data:** yahoo-finance2
- **Testing:** Vitest

## Limitations

- No authentication — single-user, trusted network only.
- Market data depends on Yahoo Finance, which may be unreliable or rate-limited.
- SQLite only — not designed for multi-user or concurrent access.
- FIF tax calculations are provided as a tool, not as tax advice. Always verify with a tax professional.

## License

[MIT](LICENSE)
