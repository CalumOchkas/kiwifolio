"use client";

import { Switch } from "@/components/ui/switch";
import { toggleFifExempt } from "@/app/actions/holding-settings";

export function FifExemptToggle({
  portfolioId,
  ticker,
  isFifExempt,
}: {
  portfolioId: string;
  ticker: string;
  isFifExempt: boolean;
}) {
  return (
    <Switch
      checked={isFifExempt}
      onCheckedChange={async (checked) => {
        await toggleFifExempt(portfolioId, ticker, checked);
      }}
    />
  );
}
