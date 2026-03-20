import { getOpenIssues } from "@/app/actions/sync-issues";
import { IssuesClient } from "@/components/issues-client";

export default async function IssuesPage() {
  const issues = await getOpenIssues();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Data Issues</h2>
        <p className="text-muted-foreground mt-1">
          Review and resolve data quality issues found during market data sync.
        </p>
      </div>
      <IssuesClient issues={issues} />
    </div>
  );
}
