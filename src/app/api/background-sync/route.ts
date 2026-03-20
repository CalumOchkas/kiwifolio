import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncAllData } from "@/app/actions/sync-all";

let isSyncing = false;

export async function GET(request: NextRequest) {
  const force = request.nextUrl.searchParams.get("force") === "true";

  // Read settings
  const settings = await prisma.appSetting.findMany({
    where: {
      key: { in: ["sync_enabled", "sync_interval_minutes", "last_sync_at"] },
    },
  });

  const settingsMap = new Map(settings.map((s) => [s.key, s.value]));
  const enabled = settingsMap.get("sync_enabled") !== "false";
  const intervalMs =
    parseInt(settingsMap.get("sync_interval_minutes") ?? "240", 10) * 60_000;
  const lastSyncAt = parseInt(settingsMap.get("last_sync_at") ?? "0", 10);

  const now = Date.now();
  const isDue = force || (enabled && now - lastSyncAt >= intervalMs);

  if (!isDue || isSyncing) {
    return NextResponse.json({
      status: isSyncing ? "syncing" : "not_due",
      lastSyncAt,
      nextSyncAt: lastSyncAt + intervalMs,
      enabled,
    });
  }

  isSyncing = true;
  try {
    const result = await syncAllData();

    return NextResponse.json({
      status: "completed",
      lastSyncAt: Date.now(),
      nextSyncAt: Date.now() + intervalMs,
      enabled,
      result: {
        portfolioCount: result.portfolioCount,
        taxYearCount: result.taxYearCount,
        totalSynced: result.totalSynced,
        totalErrors: result.totalErrors,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        lastSyncAt,
        enabled,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    isSyncing = false;
  }
}
