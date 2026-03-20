"use client";

import { useState, useTransition, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateSyncSchedule } from "@/app/actions/app-settings";
import { Loader2, RefreshCw, Check } from "lucide-react";

const INTERVAL_OPTIONS = [
  { value: "30", label: "Every 30 minutes" },
  { value: "60", label: "Every hour" },
  { value: "120", label: "Every 2 hours" },
  { value: "240", label: "Every 4 hours" },
  { value: "480", label: "Every 8 hours" },
  { value: "720", label: "Every 12 hours" },
  { value: "1440", label: "Daily" },
  { value: "10080", label: "Weekly" },
];

function formatTimeAgo(epochMs: number): string {
  if (epochMs === 0) return "Never";
  const diff = Date.now() - epochMs;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days !== 1 ? "s" : ""} ago`;
}

export function SyncSettingsClient({
  enabled: initialEnabled,
  intervalMinutes: initialInterval,
  lastSyncAt: initialLastSyncAt,
}: {
  enabled: boolean;
  intervalMinutes: number;
  lastSyncAt: number;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [intervalMinutes, setIntervalMinutes] = useState(initialInterval);
  const [lastSyncAt, setLastSyncAt] = useState(initialLastSyncAt);
  const [isSaving, startSaveTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    status: string;
    totalSynced?: number;
    totalErrors?: number;
  } | null>(null);

  const intervalLabel =
    INTERVAL_OPTIONS.find((o) => o.value === String(intervalMinutes))?.label ??
    `Every ${intervalMinutes} minutes`;

  const handleToggle = useCallback(
    (checked: boolean) => {
      setEnabled(checked);
      startSaveTransition(async () => {
        await updateSyncSchedule(intervalMinutes, checked);
      });
    },
    [intervalMinutes]
  );

  const handleIntervalChange = useCallback(
    (value: string | null) => {
      if (!value) return;
      const mins = parseInt(value, 10);
      setIntervalMinutes(mins);
      startSaveTransition(async () => {
        await updateSyncSchedule(mins, enabled);
      });
    },
    [enabled]
  );

  async function handleSyncNow() {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/background-sync?force=true");
      const data = await res.json();
      setSyncResult({
        status: data.status,
        totalSynced: data.result?.totalSynced,
        totalErrors: data.result?.totalErrors,
      });
      if (data.lastSyncAt) setLastSyncAt(data.lastSyncAt);
    } catch {
      setSyncResult({ status: "error" });
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automatic Sync</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="sync-toggle">Enable automatic sync</Label>
              <p className="text-sm text-muted-foreground">
                Periodically fetch market data, FX rates, and stock splits.
              </p>
            </div>
            <Switch
              id="sync-toggle"
              checked={enabled}
              onCheckedChange={handleToggle}
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label>Sync frequency</Label>
            <Select
              value={String(intervalMinutes)}
              onValueChange={handleIntervalChange}
              disabled={!enabled || isSaving}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue>{intervalLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {INTERVAL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Manual Sync</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button onClick={handleSyncNow} disabled={isSyncing}>
              {isSyncing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {isSyncing ? "Syncing..." : "Sync Now"}
            </Button>
            <span className="text-sm text-muted-foreground">
              Last synced: {formatTimeAgo(lastSyncAt)}
            </span>
          </div>

          {syncResult && (
            <div className="flex items-center gap-2">
              {syncResult.status === "completed" ? (
                <>
                  <Badge variant="default">
                    <Check className="mr-1 h-3 w-3" />
                    Complete
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {syncResult.totalSynced} synced
                    {syncResult.totalErrors
                      ? `, ${syncResult.totalErrors} errors`
                      : ""}
                  </span>
                </>
              ) : (
                <Badge variant="destructive">
                  Sync failed
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
