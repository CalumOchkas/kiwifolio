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

function TradeForm({
  portfolioId,
  trade,
  onDone,
}: {
  portfolioId: string;
  trade?: Trade;
  onDone: () => void;
}) {
  const [tradeType, setTradeType] = useState(trade?.tradeType ?? "BUY");

  return (
    <form
      action={async (formData) => {
        formData.set("tradeType", tradeType);
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
            defaultValue={trade?.ticker}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="tradeType">Type</Label>
          <Select value={tradeType} onValueChange={(v) => v && setTradeType(v)}>
            <SelectTrigger id="tradeType">
              <SelectValue>{tradeType === "BUY" ? "Buy" : "Sell"}</SelectValue>
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
            defaultValue={
              trade ? trade.tradeDate.toISOString().split("T")[0] : undefined
            }
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
            defaultValue={trade?.quantity}
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
            defaultValue={trade?.price}
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
            defaultValue={trade?.brokerage ?? 0}
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
            defaultValue={trade?.currency}
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
            defaultValue={trade?.fxRateToNzd}
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
          trade={trade}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
