"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createDividend, updateDividend } from "@/app/actions/dividend";
import { Plus, Pencil } from "lucide-react";

type Dividend = {
  id: string;
  ticker: string;
  date: Date;
  grossAmount: number;
  taxWithheld: number;
  currency: string;
  fxRateToNzd: number;
};

function DividendForm({
  portfolioId,
  dividend,
  onDone,
}: {
  portfolioId: string;
  dividend?: Dividend;
  onDone: () => void;
}) {
  return (
    <form
      action={async (formData) => {
        if (dividend) {
          await updateDividend(dividend.id, portfolioId, formData);
        } else {
          await createDividend(portfolioId, formData);
        }
        onDone();
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="ticker">Ticker</Label>
          <Input
            id="ticker"
            name="ticker"
            placeholder="e.g. AAPL"
            defaultValue={dividend?.ticker}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            name="date"
            type="date"
            defaultValue={
              dividend ? dividend.date.toISOString().split("T")[0] : undefined
            }
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="grossAmount">Gross Amount (native currency)</Label>
          <Input
            id="grossAmount"
            name="grossAmount"
            type="number"
            step="any"
            min="0"
            defaultValue={dividend?.grossAmount}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="taxWithheld">Tax Withheld</Label>
          <Input
            id="taxWithheld"
            name="taxWithheld"
            type="number"
            step="any"
            min="0"
            defaultValue={dividend?.taxWithheld ?? 0}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <Input
            id="currency"
            name="currency"
            placeholder="e.g. USD"
            defaultValue={dividend?.currency}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fxRateToNzd">FX Rate to NZD</Label>
          <Input
            id="fxRateToNzd"
            name="fxRateToNzd"
            type="number"
            step="any"
            min="0"
            placeholder="e.g. 1.62"
            defaultValue={dividend?.fxRateToNzd}
            required
          />
        </div>
      </div>
      <Button type="submit" className="w-full">
        {dividend ? "Save Changes" : "Add Dividend"}
      </Button>
    </form>
  );
}

export function CreateDividendDialog({
  portfolioId,
}: {
  portfolioId: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="mr-2 h-4 w-4" />
        Add Dividend
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Dividend</DialogTitle>
        </DialogHeader>
        <DividendForm
          portfolioId={portfolioId}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export function EditDividendDialog({
  portfolioId,
  dividend,
}: {
  portfolioId: string;
  dividend: Dividend;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <Pencil className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Dividend</DialogTitle>
        </DialogHeader>
        <DividendForm
          portfolioId={portfolioId}
          dividend={dividend}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
