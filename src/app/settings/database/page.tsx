import { DatabaseClient } from "@/components/database-client";

export default function DatabasePage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Database</h2>
        <p className="text-muted-foreground mt-1">
          Backup and restore your KiwiFolio database.
        </p>
      </div>

      <DatabaseClient />
    </div>
  );
}
