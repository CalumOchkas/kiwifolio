import { prisma } from "@/lib/prisma";
import { SyncSettingsClient } from "@/components/sync-settings-client";

export default async function SyncSettingsPage() {
  const settings = await prisma.appSetting.findMany({
    where: {
      key: {
        in: ["sync_enabled", "sync_interval_minutes", "last_sync_at"],
      },
    },
  });
  const settingsMap = Object.fromEntries(
    settings.map((s) => [s.key, s.value])
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Sync Schedule</h2>
        <p className="text-muted-foreground mt-1">
          Configure automatic market data synchronization.
        </p>
      </div>
      <SyncSettingsClient
        enabled={settingsMap.sync_enabled !== "false"}
        intervalMinutes={parseInt(
          settingsMap.sync_interval_minutes ?? "240",
          10
        )}
        lastSyncAt={parseInt(settingsMap.last_sync_at ?? "0", 10)}
      />
    </div>
  );
}
