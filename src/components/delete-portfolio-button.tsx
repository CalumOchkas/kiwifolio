"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deletePortfolio } from "@/app/actions/portfolio";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";

export function DeletePortfolioButton({
  portfolioId,
  portfolioName,
}: {
  portfolioId: string;
  portfolioName: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const canDelete = confirmText === portfolioName;

  async function handleDelete() {
    if (!canDelete) return;
    setDeleting(true);
    await deletePortfolio(portfolioId);
    setOpen(false);
    router.push("/");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setConfirmText("");
          setDeleting(false);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button variant="destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Portfolio
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Portfolio</DialogTitle>
          <DialogDescription>
            This will permanently delete <strong>{portfolioName}</strong> and all
            its trades, dividends, and settings. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <Label htmlFor="confirm-name">
            Type <strong>{portfolioName}</strong> to confirm
          </Label>
          <Input
            id="confirm-name"
            placeholder={portfolioName}
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            autoComplete="off"
          />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={!canDelete || deleting}
              onClick={handleDelete}
            >
              {deleting ? "Deleting..." : "Permanently Delete"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
