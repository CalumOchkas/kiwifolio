"use server";

import { prisma } from "@/lib/prisma";

const DEFAULTS: Record<string, string> = {
  sync_enabled: "true",
  sync_interval_minutes: "240",
  last_sync_at: "0",
};

export async function getSetting(key: string): Promise<string> {
  const row = await prisma.appSetting.findUnique({ where: { key } });
  return row?.value ?? DEFAULTS[key] ?? "";
}

export async function getSettings(
  keys: string[]
): Promise<Record<string, string>> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: keys } },
  });
  const result: Record<string, string> = {};
  for (const key of keys) {
    const row = rows.find((r) => r.key === key);
    result[key] = row?.value ?? DEFAULTS[key] ?? "";
  }
  return result;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function updateSyncSchedule(
  intervalMinutes: number,
  enabled: boolean
): Promise<void> {
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: "sync_interval_minutes" },
      update: { value: String(intervalMinutes) },
      create: { key: "sync_interval_minutes", value: String(intervalMinutes) },
    }),
    prisma.appSetting.upsert({
      where: { key: "sync_enabled" },
      update: { value: String(enabled) },
      create: { key: "sync_enabled", value: String(enabled) },
    }),
  ]);
}
