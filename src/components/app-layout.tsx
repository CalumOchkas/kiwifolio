"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Database,
  RefreshCw,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrandLogo } from "@/components/brand-logo";
import { getPortfolios } from "@/app/actions/portfolio";
import { getOpenIssueCount } from "@/app/actions/sync-issues";

interface SyncStatus {
  status: string;
  lastSyncAt: number;
  enabled: boolean;
}

function formatTimeAgo(epochMs: number): string {
  if (!epochMs) return "Never";
  const diff = Date.now() - epochMs;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function useBackgroundSync() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/background-sync");
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data);
      }
    } catch {
      // Background sync check is best-effort
    }
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, [check]);

  return syncStatus;
}

function AppSidebar() {
  const pathname = usePathname();
  const [portfolios, setPortfolios] = useState<{ id: string; name: string }[]>(
    []
  );
  const [issueCount, setIssueCount] = useState(0);
  const syncStatus = useBackgroundSync();

  useEffect(() => {
    getPortfolios().then(setPortfolios);
    getOpenIssueCount().then(setIssueCount);
  }, [pathname]);

  const holdingsActive =
    pathname === "/holdings" || pathname.startsWith("/holdings/");

  return (
    <Sidebar>
      <SidebarHeader className="px-4 py-4">
        <Link href="/" className="block">
          <BrandLogo compact />
        </Link>
        <p className="text-xs text-muted-foreground">
          NZ FIF Portfolio Tracker
        </p>
      </SidebarHeader>
      <SidebarContent>
        {/* Main */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/"}
                  tooltip="Dashboard"
                  render={<Link href="/" />}
                >
                  <LayoutDashboard />
                  <span>Dashboard</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={holdingsActive}
                  tooltip="Holdings"
                  render={<Link href="/holdings" />}
                >
                  <Briefcase />
                  <span>Holdings</span>
                </SidebarMenuButton>
                {portfolios.length > 0 && (
                  <SidebarMenuSub>
                    {portfolios.map((p) => (
                      <SidebarMenuSubItem key={p.id}>
                        <SidebarMenuSubButton
                          isActive={
                            pathname === `/holdings/${p.id}`
                          }
                          render={<Link href={`/holdings/${p.id}`} />}
                          size="sm"
                        >
                          <span>{p.name}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                )}
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Reporting */}
        <SidebarGroup>
          <SidebarGroupLabel>Reporting</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname.startsWith("/tax-report")}
                  tooltip="FIF Tax Report"
                  render={<Link href="/tax-report" />}
                >
                  <FileText />
                  <span>FIF Tax Report</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Settings */}
        <SidebarGroup>
          <SidebarGroupLabel>Settings</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/settings/sync"}
                  tooltip="Sync Schedule"
                  render={<Link href="/settings/sync" />}
                >
                  <RefreshCw />
                  <span>Sync Schedule</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/settings/issues"}
                  tooltip="Data Issues"
                  render={<Link href="/settings/issues" />}
                >
                  <AlertCircle />
                  <span>Data Issues</span>
                  {issueCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="ml-auto text-xs px-1.5 py-0"
                    >
                      {issueCount}
                    </Badge>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/settings/database"}
                  tooltip="Database"
                  render={<Link href="/settings/database" />}
                >
                  <Database />
                  <span>Database</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="px-4 py-3 border-t">
        <div className="text-xs text-muted-foreground/50 mb-1.5">v0.1.3</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {syncStatus?.status === "syncing" ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Syncing...</span>
            </>
          ) : syncStatus?.status === "completed" ? (
            <>
              <RefreshCw className="h-3 w-3" />
              <span>Synced {formatTimeAgo(syncStatus.lastSyncAt)}</span>
            </>
          ) : syncStatus?.lastSyncAt ? (
            <>
              <RefreshCw className="h-3 w-3" />
              <span>
                {syncStatus.enabled
                  ? `Synced ${formatTimeAgo(syncStatus.lastSyncAt)}`
                  : "Sync disabled"}
              </span>
            </>
          ) : (
            <>
              <RefreshCw className="h-3 w-3" />
              <span>Never synced</span>
            </>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Link href="/" className="min-w-0">
              <BrandLogo compact iconClassName="h-7 w-7" className="gap-2.5" />
            </Link>
          </header>
          <div className="flex-1 p-6 overflow-x-hidden overflow-y-auto min-w-0">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}
