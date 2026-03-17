# **KiwiFolio: NZ FIF Portfolio Tracker \- Agent Implementation Spec**

## **1\. Project Context & Agent Directives**

**Project:** KiwiFolio is a local, Dockerized web application for New Zealand residents to track foreign stock portfolios and calculate Foreign Investment Fund (FIF) tax liabilities (FDR vs. CV methods).

**Target Environment:** Local machine via Docker Compose. Single-user.

**Agent Directives (CRITICAL INSTRUCTIONS FOR AI):**

* **No Authentication:** Do not install NextAuth, Clerk, or any auth libraries.  
* **Component Architecture:** Use Next.js App Router. Default to Server Components. Use Client Components only when interactivity (hooks, state) is required. Use Next.js Server Actions for database mutations instead of traditional API routes where possible.  
* **UI Library:** Use shadcn/ui and Tailwind CSS.  
* **Database:** SQLite via Prisma ORM. Store the .db file in a local directory that can be mounted as a Docker volume.  
* **API Constraints:** Rely entirely on yahoo-finance2 for market data and FX rates. Implement aggressive local database caching to prevent rate-limiting. NEVER fetch market data on page load; only fetch on explicit user action or via background sync.

## **2\. Complete Prisma Schema**

Initialize the database with this exact schema.

generator client {  
  provider \= "prisma-client-js"  
}

datasource db {  
  provider \= "sqlite"  
  url      \= env("DATABASE\_URL") // e.g., "file:./data/Kiwifolio.db"  
}

model Portfolio {  
  id              String            @id @default(uuid())  
  name            String  
  trades          Trade\[\]  
  dividends       Dividend\[\]  
  snapshots       TaxYearSnapshot\[\]  
  holdingSettings HoldingSettings\[\]  
}

model Trade {  
  id            String    @id @default(uuid())  
  portfolioId   String  
  ticker        String    // e.g., AAPL  
  tradeType     String    // "BUY" or "SELL"  
  tradeDate     DateTime  
  quantity      Float  
  price         Float     // In native currency  
  brokerage     Float     // In native currency  
  currency      String    // e.g., USD, AUD  
  fxRateToNzd   Float     // Cached Exchange rate on tradeDate  
  portfolio     Portfolio @relation(fields: \[portfolioId\], references: \[id\], onDelete: Cascade)  
}

model Dividend {  
  id            String    @id @default(uuid())  
  portfolioId   String  
  ticker        String  
  date          DateTime  
  grossAmount   Float     // In native currency  
  taxWithheld   Float     // In native currency  
  currency      String  
  fxRateToNzd   Float     // Cached Exchange rate on dividend date  
  portfolio     Portfolio @relation(fields: \[portfolioId\], references: \[id\], onDelete: Cascade)  
}

model HoldingSettings {  
  id            String    @id @default(uuid())  
  portfolioId   String  
  ticker        String  
  isFifExempt   Boolean   @default(false) // e.g., True for most ASX stocks  
  portfolio     Portfolio @relation(fields: \[portfolioId\], references: \[id\], onDelete: Cascade)

  @@unique(\[portfolioId, ticker\])  
}

model TaxYearSnapshot {  
  id                 String    @id @default(uuid())  
  portfolioId        String  
  taxYear            String    // Format: "2023-2024" (April 1 to March 31\)  
  ticker             String  
  openingQty         Float  
  openingPrice       Float     // April 1 native price  
  openingFxRate      Float     // April 1 FX rate to NZD  
  closingQty         Float  
  closingPrice       Float     // March 31 native price  
  closingFxRate      Float     // March 31 FX rate to NZD  
  isManuallyEdited   Boolean   @default(false) // True if user overrides API data  
  portfolio          Portfolio @relation(fields: \[portfolioId\], references: \[id\], onDelete: Cascade)

  @@unique(\[portfolioId, taxYear, ticker\])  
}

model FxRateCache {  
  date      DateTime  
  currency  String    // e.g., USD  
  rateNzd   Float     // Value of 1 unit of currency in NZD  
    
  @@id(\[date, currency\])  
}

model EodPriceCache {  
  date      DateTime  
  ticker    String      
  price     Float     // In native currency  
    
  @@id(\[date, ticker\])  
}

## **3\. Core Tax Logic & Algorithms (The FIF Engine)**

The FIF Tax year runs from **April 1 to March 31**. The engine must calculate both FDR and CV for all holdings where isFifExempt \== false.

### **3.1. Market Data & FX Definitions**

* **NZD Value:** All native currency amounts must be multiplied by the fxRateToNzd for the specific date of the transaction. Use Yahoo Finance pairs like USDNZD=X to fetch this.  
* **Opening Value:** Quantity held on April 1 \* EOD Price on March 31 \* FX Rate on March 31\.  
* **Closing Value:** Quantity held on March 31 \* EOD Price on March 31 \* FX Rate on March 31\.

### **3.2. De Minimis Exemption ($50,000 Cost Threshold)**

* **Rule:** If the total *cost basis* (Total Purchase Cost in NZD \- Cost of Shares Sold) of ALL foreign holdings across ALL portfolios combined never exceeds $50,000 NZD at any point in the tax year, the user is exempt from FIF.  
* **Output:** Flag the tax year as "De Minimis Eligible". If eligible, FIF tax is $0, and the user only pays tax on actual dividends received.

### **3.3. Fair Dividend Rate (FDR) Method**

* **Base Calculation:** Opening Value (in NZD) \* 0.05  
* **Quick Sale Adjustment:** Applies ONLY if the same ticker is bought AND sold within the same tax year.  
  * *Peak Holding Differential:* The maximum number of shares held during the year MINUS the opening quantity on April 1\.  
  * *Quick Sale Quantity:* The lesser of (Total Shares Bought in year) OR (Total Shares Sold in year).  
  * *Adjustment is the LESSER of:*  
    1. 0.05 \* Peak Holding Differential \* Average Cost per share of buys in year  
    2. (Sales Proceeds in NZD for Quick Sale Qty \+ Pro-rata Dividends for Quick Sale Qty) \- (Average Cost \* Quick Sale Qty)  
* **Total FDR Income:** Base Calculation \+ Quick Sale Adjustment. (Cannot be less than 0).

### **3.4. Comparative Value (CV) Method**

* **Formula:** (Closing Value \+ Sales Proceeds \+ Dividends) \- (Opening Value \+ Purchase Costs)  
  * All values MUST be in NZD.  
  * *Sales Proceeds:* Total NZD from sales during the year (net of brokerage).  
  * *Dividends:* Gross dividends in NZD.  
  * *Purchase Costs:* Total NZD spent on purchases during the year (including brokerage).  
* **Total CV Income:** If the sum across the *entire* portfolio is negative, it equals $0. (Losses cannot be claimed).

### **3.5. FIF Tax Exemptions & Foreign Tax Credits (FTC)**

* **ASX Exemption:** If a holding has isFifExempt \== true, it is excluded from FDR and CV calculations.  
* **FTC Aggregation:** Sum all taxWithheld from the Dividend table (converted to NZD on the dividend date) for the tax year. Display this prominently on the report as "Total Claimable Foreign Tax Credits".

## **4\. UI/UX & Application Features**

1. **Dashboard:** \* Total portfolio value (NZD).  
   * De Minimis $50k cost-basis progress bar.  
   * List of portfolios with quick links to their Tax Reports.  
2. **Holdings & Transactions View:**  
   * Tables to list, add, edit, and delete Trades and Dividends.  
   * Toggle to mark a ticker as isFifExempt.  
3. **FIF Tax Report View:**  
   * Dropdown to select Tax Year (e.g., "2023-2024").  
   * **Action Button:** "Sync Market Data" \- Triggers yahoo-finance2 to populate TaxYearSnapshot for April 1 and March 31 values, and fetch missing FX rates. Provide visual loading state.  
   * **Overrides:** UI inputs to manually edit the Opening/Closing price and FX rates in the TaxYearSnapshot if the API fails or a stock is delisted.  
   * **Results Panel:** Side-by-side comparison of Total Portfolio FDR vs Total Portfolio CV. Highlight the lower (optimal) number.  
   * **FTC Panel:** Show total Foreign Tax Credits.  
4. **Data Management:**  
   * Export FIF Report to CSV.  
   * Export/Import raw Kiwifolio.db SQLite file (for local backup/restore).

## **5\. Implementation Roadmap for Agent (Execute in order)**

* **Phase 1: Foundation.** Initialize Next.js App Router, install Prisma, Tailwind, Shadcn. Setup SQLite database with the exact schema provided. Create basic App layout with a sidebar navigation.  
* **Phase 2: Core CRUD.** Implement Server Actions and UI for creating Portfolios, adding Trades, adding Dividends, and toggling isFifExempt settings. Ignore Market Data fetching for now; allow manual entry of fxRateToNzd in the forms as a fallback, but wire up the UI.  
* **Phase 3: The Data Engine.** Implement the yahoo-finance2 integration. Create a service utility that, when a trade is saved, automatically fetches the historical EOD price and FX rate and saves them to FxRateCache and EodPriceCache. Create the "Sync Market Data" Server Action to populate TaxYearSnapshot.  
* **Phase 4: The Tax Math.** Create the TypeScript utility functions to calculate FDR, CV, Quick Sales, and the De Minimis threshold based strictly on the formulas in Section 3\. Write unit tests for these math functions if possible.  
* **Phase 5: The FIF Report UI.** Build the Tax Report page. Wire the math functions to the frontend. Implement the manual overrides for TaxYearSnapshot and the FTC aggregation display.  
* **Phase 6: Polish.** Implement the CSV export functionality and the SQLite database backup/restore buttons. Create a docker-compose.yml and Dockerfile.