import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

/**
 * GET /api/backup-db
 * Returns the raw SQLite database file as a download.
 */
export async function GET() {
  const dbPath = path.join(process.cwd(), "data", "kiwifolio.db");

  try {
    const buffer = await readFile(dbPath);
    const date = new Date().toISOString().split("T")[0];
    const filename = `kiwifolio-backup-${date}.db`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Database file not found" },
      { status: 404 }
    );
  }
}
