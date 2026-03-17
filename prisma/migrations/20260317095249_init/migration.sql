-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Trade" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portfolioId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "tradeType" TEXT NOT NULL,
    "tradeDate" DATETIME NOT NULL,
    "quantity" REAL NOT NULL,
    "price" REAL NOT NULL,
    "brokerage" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "fxRateToNzd" REAL NOT NULL,
    CONSTRAINT "Trade_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Dividend" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portfolioId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "grossAmount" REAL NOT NULL,
    "taxWithheld" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "fxRateToNzd" REAL NOT NULL,
    CONSTRAINT "Dividend_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HoldingSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portfolioId" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "isFifExempt" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "HoldingSettings_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaxYearSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portfolioId" TEXT NOT NULL,
    "taxYear" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "openingQty" REAL NOT NULL,
    "openingPrice" REAL NOT NULL,
    "openingFxRate" REAL NOT NULL,
    "closingQty" REAL NOT NULL,
    "closingPrice" REAL NOT NULL,
    "closingFxRate" REAL NOT NULL,
    "isManuallyEdited" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "TaxYearSnapshot_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FxRateCache" (
    "date" DATETIME NOT NULL,
    "currency" TEXT NOT NULL,
    "rateNzd" REAL NOT NULL,

    PRIMARY KEY ("date", "currency")
);

-- CreateTable
CREATE TABLE "EodPriceCache" (
    "date" DATETIME NOT NULL,
    "ticker" TEXT NOT NULL,
    "price" REAL NOT NULL,

    PRIMARY KEY ("date", "ticker")
);

-- CreateIndex
CREATE UNIQUE INDEX "HoldingSettings_portfolioId_ticker_key" ON "HoldingSettings"("portfolioId", "ticker");

-- CreateIndex
CREATE UNIQUE INDEX "TaxYearSnapshot_portfolioId_taxYear_ticker_key" ON "TaxYearSnapshot"("portfolioId", "taxYear", "ticker");
