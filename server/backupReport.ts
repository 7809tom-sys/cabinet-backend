// Machine-to-machine endpoints for the PC backup script. Auth: header x-backup-token (or Authorization: Bearer)
// equal to env BACKUP_REPORT_TOKEN, compared in constant time. If the env is unset both return 503.
// Neither endpoint reads or returns customer data.
import type { Express, Request, Response } from "express";
import { getDb } from "./db";
import { DEFAULT_SCHEDULE } from "../scripts/backup/schedule.mjs";
import { isMissingBackupTable, readSettings, reportInput, tokenMatches, upsertRun } from "./lib/backups";

function providedToken(req: Request): string | undefined {
  const header = req.headers["x-backup-token"];
  if (typeof header === "string") return header;
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) return auth.slice(7);
  return undefined;
}

/** Returns true when the request may continue. Sends the error response itself otherwise. */
export function authorizeBackupRequest(req: Request, res: Response, expected = process.env.BACKUP_REPORT_TOKEN): boolean {
  if (!expected) {
    res.status(503).json({ error: "Backup reporting is not configured." });
    return false;
  }
  if (!tokenMatches(providedToken(req), expected)) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export function registerBackupReport(app: Express) {
  app.get("/api/backups/schedule", async (req, res) => {
    if (!authorizeBackupRequest(req, res)) return;
    try {
      const db = await getDb();
      if (!db) return res.json({ ...DEFAULT_SCHEDULE });
      const s = await readSettings(db);
      return res.json({ dailyTime: s.dailyTime, timezone: s.timezone, retentionDays: s.retentionDays });
    } catch (error) {
      // Tables not created yet, or a database hiccup: hand the PC the default schedule so it still backs up.
      if (!isMissingBackupTable(error)) console.error("[Backups] schedule read failed", error instanceof Error ? error.name : "unknown error");
      return res.json({ ...DEFAULT_SCHEDULE });
    }
  });

  app.post("/api/backups/report", async (req, res) => {
    if (!authorizeBackupRequest(req, res)) return;
    const parsed = reportInput.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: "Invalid report" });
    try {
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });
      const runId = await upsertRun(db, parsed.data);
      return res.json({ ok: true, runId });
    } catch (error) {
      if (isMissingBackupTable(error)) return res.status(503).json({ error: "needs_database_update" });
      console.error("[Backups] report failed", error instanceof Error ? error.name : "unknown error");
      return res.status(500).json({ error: "Report failed" });
    }
  });
}
