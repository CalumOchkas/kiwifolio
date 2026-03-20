"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { renamePortfolio } from "@/app/actions/portfolio";

export function RenamePortfolioInput({
  portfolioId,
  currentName,
}: {
  portfolioId: string;
  currentName: string;
}) {
  const [value, setValue] = useState(currentName);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const isDirty = value.trim() !== currentName && value.trim().length > 0;

  function handleSave() {
    if (!isDirty) return;
    setSaved(false);
    startTransition(async () => {
      await renamePortfolio(portfolioId, value.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSave();
        }}
        className="h-9 max-w-xs text-sm"
        disabled={isPending}
      />
      <Button
        size="sm"
        onClick={handleSave}
        disabled={!isDirty || isPending}
      >
        {isPending ? "Saving…" : "Rename"}
      </Button>
      {saved && <span className="text-xs text-green-600">Saved</span>}
    </div>
  );
}
