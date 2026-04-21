"use client";

import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createTrade, updateTrade } from "@/app/actions/trade";
import { Plus, Pencil } from "lucide-react";

type Trade = {
  id: string;
  ticker: string;
  tradeType: string;
  tradeDate: Date;
  quantity: number;
  price: number;
  brokerage: number;
  currency: string;
  fxRateToNzd: number;
};

type TradeFormState = {
  ticker: string;
  tradeType: string;
  tradeDate: string;
  quantity: string;
  price: string;
  brokerage: string;
  currency: string;
  fxRateToNzd: string;
};

function toTradeFormState(trade?: Trade): TradeFormState {
  return {
    ticker: trade?.ticker ?? "",
    tradeType: trade?.tradeType ?? "BUY",
    tradeDate: trade ? trade.tradeDate.toISOString().split("T")[0] : "",
    quantity: trade ? String(trade.quantity) : "",
    price: trade ? String(trade.price) : "",
    brokerage: trade ? String(trade.brokerage) : "0",
    currency: trade?.currency ?? "",
    fxRateToNzd: trade ? String(trade.fxRateToNzd) : "",
  };
}

function TradeForm({
  portfolioId,
  trade,
  onDone,
}: {
  portfolioId: string;
  trade?: Trade;
  onDone: () => void;
}) {
  const [formState, setFormState] = useState<TradeFormState>(() =>
    toTradeFormState(trade)
  );

  useEffect(() => {
    setFormState(toTradeFormState(trade));
  }, [trade]);

  function updateField<K extends keyof TradeFormState>(
    field: K,
    value: TradeFormState[K]
  ) {
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));
  }

  return (
    <form
      action={async (formData) => {
        formData.set("ticker", formState.ticker);
        formData.set("tradeType", formState.tradeType);
        formData.set("tradeDate", formState.tradeDate);
        formData.set("quantity", formState.quantity);
        formData.set("price", formState.price);
        formData.set("brokerage", formState.brokerage);
        formData.set("currency", formState.currency);
        formData.set("fxRateToNzd", formState.fxRateToNzd);
        if (trade) {
          await updateTrade(trade.id, portfolioId, formData);
        } else {
          await createTrade(portfolioId, formData);
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
            value={formState.ticker}
            onChange={(e) => updateField("ticker", e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tradeType">Type</Label>
          <Select
            value={formState.tradeType}
            onValueChange={(value) => value && updateField("tradeType", value)}
          >
            <SelectTrigger id="tradeType">
              <SelectValue>
                {formState.tradeType === "BUY" ? "Buy" : "Sell"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="BUY">Buy</SelectItem>
              <SelectItem value="SELL">Sell</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="tradeDate">Date</Label>
          <Input
            id="tradeDate"
            name="tradeDate"
            type="date"
            value={formState.tradeDate}
            onChange={(e) => updateField("tradeDate", e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="quantity">Quantity</Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            step="any"
            min="0"
            value={formState.quantity}
            onChange={(e) => updateField("quantity", e.target.value)}
            required
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price">Price (native currency)</Label>
          <Input
            id="price"
            name="price"
            type="number"
            step="any"
            min="0"
            value={formState.price}
            onChange={(e) => updateField("price", e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="brokerage">Brokerage</Label>
          <Input
            id="brokerage"
            name="brokerage"
            type="number"
            step="any"
            min="0"
            value={formState.brokerage}
            onChange={(e) => updateField("brokerage", e.target.value)}
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
            value={formState.currency}
            onChange={(e) => updateField("currency", e.target.value)}
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
            value={formState.fxRateToNzd}
            onChange={(e) => updateField("fxRateToNzd", e.target.value)}
            required
          />
        </div>
      </div>
      <Button type="submit" className="w-full">
        {trade ? "Save Changes" : "Add Trade"}
      </Button>
    </form>
  );
}

export function CreateTradeDialog({ portfolioId }: { portfolioId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus className="mr-2 h-4 w-4" />
        Add Trade
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Trade</DialogTitle>
        </DialogHeader>
        <TradeForm portfolioId={portfolioId} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function EditTradeDialog({
  portfolioId,
  trade,
}: {
  portfolioId: string;
  trade: Trade;
}) {
  const [open, setOpen] = useState(false);
  const [formTrade, setFormTrade] = useState(trade);

  useEffect(() => {
    if (!open) {
      setFormTrade(trade);
    }
  }, [open, trade]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" />}>
        <Pencil className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Trade</DialogTitle>
        </DialogHeader>
        <TradeForm
          portfolioId={portfolioId}
          trade={formTrade}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
