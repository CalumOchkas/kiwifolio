"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, Database, Download } from "lucide-react";

export function DatabaseClient() {
  const [restoreStatus, setRestoreStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleBackupDb() {
    window.open("/api/backup-db", "_blank");
  }

  async function handleRestoreDb(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsRestoring(true);
    setRestoreStatus(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/restore-db", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (res.ok) {
        setRestoreStatus({ type: "success", message: data.message });
      } else {
        setRestoreStatus({
          type: "error",
          message: data.error || "Failed to restore database",
        });
      }
    } catch {
      setRestoreStatus({
        type: "error",
        message: "Network error. Please try again.",
      });
    } finally {
      setIsRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          <CardTitle className="text-lg">Database Backup & Restore</CardTitle>
        </div>
        <CardDescription>
          Download or upload the raw SQLite database file for backup and restore.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={handleBackupDb} className="w-full">
          <Download className="mr-2 h-4 w-4" />
          Download Database Backup
        </Button>

        <div className="relative">
          <input
            ref={fileInputRef}
            type="file"
            accept=".db,.sqlite,.sqlite3"
            onChange={handleRestoreDb}
            className="hidden"
            id="restore-input"
          />
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {isRestoring ? "Restoring..." : "Restore from Backup"}
          </Button>
        </div>

        {restoreStatus && (
          <div className="flex items-start gap-2">
            <Badge
              variant={
                restoreStatus.type === "success" ? "default" : "destructive"
              }
            >
              {restoreStatus.type === "success" ? "Success" : "Error"}
            </Badge>
            <p className="text-sm text-muted-foreground">
              {restoreStatus.message}
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Restoring will replace your current database. A backup of the current
          DB is saved automatically before overwriting.
        </p>
      </CardContent>
    </Card>
  );
}
