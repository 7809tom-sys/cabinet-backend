import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NOT_ADMIN_ERR_MSG } from "../../shared/const";
import { appRouter } from "../routers";

function caller(role: "admin" | "user" | null) {
  return appRouter.createCaller({
    user: role
      ? { id: 7, openId: "door-audit", name: "Tom", email: "tom@example.com", role }
      : null,
    req: { headers: {} },
    res: {},
  } as never);
}

const procedureCalls = {
  listStyles: (api: ReturnType<typeof caller>) => api.doorRenderingAudit.listStyles(),
  startRun: (api: ReturnType<typeof caller>) => api.doorRenderingAudit.startRun({ scope: "changed" }),
  runStatus: (api: ReturnType<typeof caller>) => api.doorRenderingAudit.runStatus({ runId: 1 }),
  submitRender: (api: ReturnType<typeof caller>) => api.doorRenderingAudit.submitRender({
    runId: 1,
    styleId: 1,
    imageBase64: "a".repeat(32),
  }),
  rerunStyle: (api: ReturnType<typeof caller>) => api.doorRenderingAudit.rerunStyle({ styleId: 1 }),
  decideRender: (api: ReturnType<typeof caller>) => api.doorRenderingAudit.decideRender({
    versionId: 1,
    decision: "accept",
  }),
  revertToVersion: (api: ReturnType<typeof caller>) => api.doorRenderingAudit.revertToVersion({ versionId: 1 }),
  runHistory: (api: ReturnType<typeof caller>) => api.doorRenderingAudit.runHistory(),
  styleVersions: (api: ReturnType<typeof caller>) => api.doorRenderingAudit.styleVersions({ styleId: 1 }),
  abandonRun: (api: ReturnType<typeof caller>) => api.doorRenderingAudit.abandonRun({ runId: 1 }),
};

describe("door rendering audit admin guard", () => {
  it.each(["user", null] as const)("rejects a %s caller on every audit procedure", async (role) => {
    const api = caller(role);
    for (const [name, call] of Object.entries(procedureCalls)) {
      await expect(call(api), name).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: NOT_ADMIN_ERR_MSG,
      });
    }
  });

  it("keeps render versions append-only and behind adminProcedure", () => {
    const source = readFileSync(new URL("./doorRenderingAudit.ts", import.meta.url), "utf8");
    expect(source).toContain("listStyles: adminProcedure");
    expect(source).toContain("startRun: adminProcedure");
    expect(source).toContain("runStatus: adminProcedure");
    expect(source).toContain("submitRender: adminProcedure");
    expect(source).toContain("rerunStyle: adminProcedure");
    expect(source).toContain("decideRender: adminProcedure");
    expect(source).toContain("revertToVersion: adminProcedure");
    expect(source).toContain("runHistory: adminProcedure");
    expect(source).toContain("styleVersions: adminProcedure");
    expect(source).toContain("abandonRun: adminProcedure");
    expect(source).not.toMatch(/update\(doorRenderingVersions\)/);
    expect(source).not.toMatch(/delete\(doorRenderingVersions\)/);
    expect(source).not.toMatch(/delete\(doorRenderingVersionEvents\)/);
    expect(source).toContain("verdictForOverall");
    expect(source).toContain("planVersionDecision");
  });
});

describe("door rendering audit migration", () => {
  it("follows 0222 in the journal", () => {
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
      entries: Array<{ idx: number; when: number; tag: string }>;
    };
    const previous = journal.entries.find((entry) => entry.tag === "0222_door_style_auto_room_scene");
    const audit = journal.entries.find((entry) => entry.tag === "0223_door_rendering_audit");
    expect(previous).toMatchObject({ idx: 221, when: 1794300000000 });
    expect(audit).toMatchObject({ idx: 222, when: 1794400000000 });
    expect(journal.entries[journal.entries.length - 1]).toBe(audit);
  });

  it("is a re-runnable TiDB script with one statement per numbered block", () => {
    const sql = readFileSync("docs/sql/0223_door_rendering_audit.tidb.sql", "utf8");
    expect(sql).not.toContain("--> statement-breakpoint");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS cabinet_dealz.door_rendering_audit_runs");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS cabinet_dealz.door_rendering_audit_results");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS cabinet_dealz.door_rendering_versions");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS cabinet_dealz.door_rendering_version_events");
    expect(sql).toContain("DEFAULT CURRENT_TIMESTAMP");
    expect(sql).not.toMatch(/\bAS\s+(status|key|order|group|check|table)\b/i);
    const blocks = sql.split(/\n-- \d+[^\n]*\n/).slice(1);
    expect(blocks.length).toBe(13);
    for (const block of blocks) {
      const statements = block.split(";").map((part) => part.trim()).filter(Boolean);
      expect(statements).toHaveLength(1);
    }
    const snapshot = JSON.parse(readFileSync("drizzle/meta/0223_snapshot.json", "utf8")) as { prevId: string };
    const previous = JSON.parse(readFileSync("drizzle/meta/0222_snapshot.json", "utf8")) as { id: string };
    expect(snapshot.prevId).toBe(previous.id);
    expect(snapshot.prevId).toBe("22302ac7-6395-4d6d-95ad-0a53f119940d");
  });
});
