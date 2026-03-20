"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { updateYahooSymbol } from "@/app/actions/holding-settings";

export function YahooSymbolInput({
  portfolioId,
  ticker,
  currentSymbol,
}: {
  portfolioId: string;
  ticker: string;
  currentSymbol: string | null;
}) {
  const [value, setValue] = useState(currentSymbol ?? "");
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function handleBlur() {
    const trimmed = value.trim();
    if (trimmed === (currentSymbol ?? "")) return;
    setSaved(false);
    startTransition(async () => {
      await updateYahooSymbol(portfolioId, ticker, trimmed);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder="e.g. CSPX.L"
        className="h-8 w-36 text-sm"
        disabled={isPending}
      />
      {saved && <span className="text-xs text-green-600">Saved</span>}
    </div>
  );
}
