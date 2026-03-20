import { NextResponse } from "next/server";

const TEMPLATE = `Ticker,Type,Date,Quantity,Price,Brokerage,Currency,FxRate,GrossAmount,TaxWithheld
AAPL,BUY,2024-06-15,10,185.50,3.00,USD,,,
AAPL,SELL,2024-12-01,5,230.00,3.00,USD,,,
AAPL,DIVIDEND,2024-08-15,,,,,4.50,0.68,USD
`;

export function GET() {
  return new NextResponse(TEMPLATE, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="kiwifolio-import-template.csv"',
    },
  });
}
