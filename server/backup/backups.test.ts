import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs helper without declarations in this import path style
import { isBackupDue, localParts } from "../../scripts/backup/schedule.mjs";
import { authorizeBackupRequest } from "../backupReport";
import { backupHealth, effectiveStatus, isMissingBackupTable, reportInput, settingsInput, tokenMatches } from "../lib/backups";
import { backupsRouter } from "../routers/backups";

function fakeRes() {
  const r: any = { statusCode: 200, body: undefined };
  r.status = (c: number) => { r.statusCode = c; return r; };
  r.json = (b: unknown) => { r.body = b; return r; };
  return r;
}
const req = (headers: Record<string, string>) => ({ headers }) as any;

describe("schedule due logic", () => {
  const base = { dailyTime: "03:00", timezone: "America/New_York" };
  it("is not due before the configured time and is due after it", () => {
    // 2026-11-23 07:30 UTC = 02:30 EST
    expect(isBackupDue({ ...base, now: new Date("2026-11-23T07:30:00Z") })).toMatchObject({ due: false, reason: "before-scheduled-time", today: "2026-11-23" });
    // 08:15 UTC = 03:15 EST
    expect(isBackupDue({ ...base, now: new Date("2026-11-23T08:15:00Z") })).toMatchObject({ due: true, today: "2026-11-23" });
  });
  it("does not run twice when today's snapshot is already done", () => {
    expect(isBackupDue({ ...base, now: new Date("2026-11-23T20:00:00Z"), doneDates: ["2026-11-23"] })).toMatchObject({ due: false, reason: "already-done-today" });
    expect(isBackupDue({ ...base, now: new Date("2026-11-24T08:15:00Z"), doneDates: ["2026-11-23"] }).due).toBe(true);
  });
  it("uses the configured zone for the local date (late evening Eastern is still 'today')", () => {
    expect(localParts(new Date("2026-11-24T04:30:00Z"), "America/New_York")).toEqual({ date: "2026-11-23", minutes: 23 * 60 + 30 });
    expect(localParts(new Date("2026-11-24T04:30:00Z"), "America/Chicago").date).toBe("2026-11-23");
    expect(localParts(new Date("2026-11-24T04:30:00Z"), "Asia/Tokyo").date).toBe("2026-11-24");
  });
  it("handles daylight saving changes", () => {
    // Spring forward 2026-03-08: 03:00 EDT = 07:00 UTC, so 06:59 UTC is still 01:59 EST.
    expect(isBackupDue({ ...base, now: new Date("2026-03-08T06:59:00Z") }).due).toBe(false);
    expect(isBackupDue({ ...base, now: new Date("2026-03-08T07:00:00Z") }).due).toBe(true);
    // Fall back 2026-11-01: 03:00 EST = 08:00 UTC; 07:59 UTC is 02:59 EST.
    expect(isBackupDue({ ...base, now: new Date("2026-11-01T07:59:00Z") }).due).toBe(false);
    expect(isBackupDue({ ...base, now: new Date("2026-11-01T08:00:00Z") }).due).toBe(true);
  });
  it("refuses an invalid schedule", () => {
    expect(isBackupDue({ dailyTime: "25:00", timezone: "America/New_York" })).toMatchObject({ due: false, reason: "invalid-schedule" });
    expect(isBackupDue({ dailyTime: "03:00", timezone: "Mars/Base" })).toMatchObject({ due: false, reason: "invalid-schedule" });
  });
});

describe("report endpoint token auth", () => {
  it("returns 503 when BACKUP_REPORT_TOKEN is not set", () => {
    const res = fakeRes();
    expect(authorizeBackupRequest(req({ "x-backup-token": "anything" }), res, undefined)).toBe(false);
    expect(res.statusCode).toBe(503);
  });
  it("returns 401 for a missing or wrong token and allows the right one", () => {
    let res = fakeRes();
    expect(authorizeBackupRequest(req({}), res, "s3cret")).toBe(false);
    expect(res.statusCode).toBe(401);
    res = fakeRes();
    expect(authorizeBackupRequest(req({ "x-backup-token": "wrong" }), res, "s3cret")).toBe(false);
    expect(res.statusCode).toBe(401);
    res = fakeRes();
    expect(authorizeBackupRequest(req({ "x-backup-token": "s3cret" }), res, "s3cret")).toBe(true);
    res = fakeRes();
    expect(authorizeBackupRequest(req({ authorization: "Bearer s3cret" }), res, "s3cret")).toBe(true);
  });
  it("compares in constant time over equal-length digests", () => {
    expect(tokenMatches("a", "a")).toBe(true);
    expect(tokenMatches("a", "ab")).toBe(false);
    expect(tokenMatches("", "")).toBe(false);
    expect(tokenMatches(undefined, "x")).toBe(false);
  });
  it("validates report bodies", () => {
    expect(reportInput.safeParse({ event: "start", machineName: "PC", scope: ["supabase_storage"] }).success).toBe(true);
    expect(reportInput.safeParse({ event: "finish", status: "weird" }).success).toBe(false);
    expect(reportInput.safeParse({ event: "start", scope: ["customers"] }).success).toBe(false);
  });
});

describe("settings validation", () => {
  it("accepts a valid schedule", () => {
    expect(settingsInput.safeParse({ dailyTime: "03:00", timezone: "America/New_York", retentionDays: 90 }).success).toBe(true);
  });
  it("rejects bad time, zone and retention", () => {
    expect(settingsInput.safeParse({ dailyTime: "3:00", timezone: "America/New_York", retentionDays: 90 }).success).toBe(false);
    expect(settingsInput.safeParse({ dailyTime: "24:00", timezone: "America/New_York", retentionDays: 90 }).success).toBe(false);
    expect(settingsInput.safeParse({ dailyTime: "03:00", timezone: "Nowhere/Land", retentionDays: 90 }).success).toBe(false);
    expect(settingsInput.safeParse({ dailyTime: "03:00", timezone: "America/New_York", retentionDays: 29 }).success).toBe(false);
    expect(settingsInput.safeParse({ dailyTime: "03:00", timezone: "America/New_York", retentionDays: 366 }).success).toBe(false);
    expect(settingsInput.safeParse({ dailyTime: "03:00", timezone: "America/New_York", retentionDays: 30 }).success).toBe(true);
    expect(settingsInput.safeParse({ dailyTime: "03:00", timezone: "America/New_York", retentionDays: 365 }).success).toBe(true);
  });
});

describe("health and friendly states", () => {
  const now = new Date("2026-11-23T12:00:00Z");
  it("warns amber after 26 hours and red after 50", () => {
    expect(backupHealth(new Date("2026-11-23T00:00:00Z"), now).level).toBe("ok");
    expect(backupHealth(new Date("2026-11-22T09:00:00Z"), now).level).toBe("amber");
    expect(backupHealth(new Date("2026-11-21T09:00:00Z"), now).level).toBe("red");
    expect(backupHealth(null, now).level).toBe("amber");
  });
  it("shows a stuck 'running' row as failed", () => {
    expect(effectiveStatus({ status: "running", startedAt: new Date("2026-11-23T01:00:00Z"), finishedAt: null }, now)).toBe("failed");
    expect(effectiveStatus({ status: "running", startedAt: new Date("2026-11-23T11:00:00Z"), finishedAt: null }, now)).toBe("running");
  });
  it("recognises a missing backup table error", () => {
    expect(isMissingBackupTable(new Error("Failed query: select ... Table 'cabinet_dealz.backup_runs' doesn't exist"))).toBe(true);
    expect(isMissingBackupTable(new Error("Failed query", { cause: new Error("Table 'cabinet_dealz.backup_settings' doesn't exist") }))).toBe(true);
    expect(isMissingBackupTable(new Error("Table 'x.orders' doesn't exist"))).toBe(false);
  });
  it("keeps the backup procedures admin only", async () => {
    const caller = backupsRouter.createCaller({ user: { id: 7, role: "affiliate", name: "A" } } as any);
    await expect(caller.listRuns({ page: 1, pageSize: 25 })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.updateSettings({ dailyTime: "03:00", timezone: "America/New_York", retentionDays: 90 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
