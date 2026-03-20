import { NextRequest, NextResponse } from "next/server";
import { writeFile, copyFile } from "fs/promises";
import path from "path";

/**
 * POST /api/restore-db
 * Accepts a SQLite database file upload and replaces the current database.
 * Creates a backup of the current DB before overwriting.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "No file provided" },
      { status: 400 }
    );
  }

  const dbPath = path.join(process.cwd(), "data", "kiwifolio.db");
  const backupPath = path.join(
    process.cwd(),
    "data",
    `kiwifolio-pre-restore-${Date.now()}.db`
  );

  try {
    // Backup current DB before overwriting
    try {
      await copyFile(dbPath, backupPath);
    } catch {
      // No existing DB to backup - that's fine
    }

    // Write the uploaded file
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Basic SQLite validation: check magic bytes "SQLite format 3\0"
    const magic = buffer.subarray(0, 16).toString("ascii");
    if (!magic.startsWith("SQLite format 3")) {
      return NextResponse.json(
        { error: "Invalid SQLite database file" },
        { status: 400 }
      );
    }

    await writeFile(dbPath, buffer);

    return NextResponse.json({
      success: true,
      message: "Database restored. Please restart the application for changes to take effect.",
      backupPath: backupPath,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to restore database" },
      { status: 500 }
    );
  }
}
