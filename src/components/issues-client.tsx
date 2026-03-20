"use client";

import { useState, useTransition } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  resolveIssue,
  resolveAllIssuesForTicker,
  getAllIssues,
  type SyncIssueRow,
} from "@/app/actions/sync-issues";
import { CheckCircle, X } from "lucide-react";

const ISSUE_TYPE_CONFIG: Record<
  string,
  { label: string; variant: "secondary" | "destructive" }
> = {
  PRICE_MISSING: { label: "Missing Price", variant: "secondary" },
  FX_RATE_MISSING: { label: "Missing FX Rate", variant: "secondary" },
  SYNC_FAILED: { label: "Sync Failed", variant: "destructive" },
  SPLIT_FETCH_FAILED: { label: "Split Check Failed", variant: "destructive" },
};

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString("en-NZ", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function IssuesClient({
  issues: initialIssues,
}: {
  issues: SyncIssueRow[];
}) {
  const [issues, setIssues] = useState(initialIssues);
  const [showResolved, setShowResolved] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDismiss(issueId: string) {
    startTransition(async () => {
      await resolveIssue(issueId);
      const updated = await getAllIssues(showResolved);
      setIssues(updated);
    });
  }

  function handleDismissAllForTicker(ticker: string) {
    startTransition(async () => {
      await resolveAllIssuesForTicker(ticker);
      const updated = await getAllIssues(showResolved);
      setIssues(updated);
    });
  }

  function handleToggleResolved(checked: boolean) {
    setShowResolved(checked);
    startTransition(async () => {
      const updated = await getAllIssues(checked);
      setIssues(updated);
    });
  }

  const openIssues = issues.filter((i) => !i.resolvedAt);
  const hasOpenIssues = openIssues.length > 0;

  // Group issues by ticker for the "dismiss all" action
  const tickersWithMultipleIssues = new Set<string>();
  const tickerCounts = new Map<string, number>();
  for (const issue of openIssues) {
    tickerCounts.set(issue.ticker, (tickerCounts.get(issue.ticker) ?? 0) + 1);
  }
  for (const [ticker, count] of tickerCounts) {
    if (count > 1) tickersWithMultipleIssues.add(ticker);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Switch
          id="show-resolved"
          checked={showResolved}
          onCheckedChange={handleToggleResolved}
          disabled={isPending}
        />
        <Label htmlFor="show-resolved" className="text-sm">
          Show resolved issues
        </Label>
      </div>

      {issues.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="mx-auto h-10 w-10 text-green-500 mb-3" />
            <p className="text-lg font-medium">No data issues found</p>
            <p className="text-sm text-muted-foreground mt-1">
              All tickers are syncing correctly.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {hasOpenIssues
                ? `${openIssues.length} open issue${openIssues.length !== 1 ? "s" : ""}`
                : "All issues resolved"}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Issue</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead className="min-w-[250px]">
                    How to Resolve
                  </TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {issues.map((issue) => {
                  const config = ISSUE_TYPE_CONFIG[issue.issueType] ?? {
                    label: issue.issueType,
                    variant: "secondary" as const,
                  };
                  const isResolved = !!issue.resolvedAt;

                  return (
                    <TableRow
                      key={issue.id}
                      className={isResolved ? "opacity-50" : ""}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {issue.ticker}
                          {tickersWithMultipleIssues.has(issue.ticker) &&
                            !isResolved && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs px-1.5"
                                onClick={() =>
                                  handleDismissAllForTicker(issue.ticker)
                                }
                                disabled={isPending}
                                title={`Dismiss all issues for ${issue.ticker}`}
                              >
                                Dismiss all
                              </Button>
                            )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={config.variant}>{config.label}</Badge>
                        {isResolved && (
                          <Badge variant="outline" className="ml-1">
                            Resolved
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate" title={issue.message}>
                        {issue.message}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {formatDate(issue.occurredAt)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {issue.resolution}
                      </TableCell>
                      <TableCell>
                        {!isResolved && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleDismiss(issue.id)}
                            disabled={isPending}
                            title="Dismiss"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
