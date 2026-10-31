import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DOOR_MODEL_AUDIT_STATUSES,
  canTransition,
  doorModelSourceFingerprint,
  enqueueDecision,
  evaluateChecks,
  isInApprovalQueue,
  isLiveInDesigner,
  isNeedsAttention,
  nextStatusAfterCheck,
  normalizeMaxAttempts,
} from "../shared/doorModelAudit";

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const good = { color: 9, grain: 9, profile: 9, proportions: 9, drawerFront: 9 };

describe("door model audit rules", () => {
  it("has the seven required statuses", () => {
    expect([...DOOR_MODEL_AUDIT_STATUSES]).toEqual(
      ["queued", "generating", "checking", "flagged", "awaiting_tom", "approved", "rejected"],
    );
  });

  it("passes only when all five checks meet the score", () => {
    expect(evaluateChecks(good, {}).passed).toBe(true);
    const bad = evaluateChecks({ ...good, drawerFront: 5 }, { drawerFront: "slab, not shaker" });
    expect(bad.passed).toBe(false);
    expect(bad.reasons[0]).toContain("slab, not shaker");
  });

  it("revises until the attempts run out, then flags", () => {
    expect(nextStatusAfterCheck({ passed: false, attemptsUsed: 2, maxAttempts: 3 })).toBe("generating");
    expect(nextStatusAfterCheck({ passed: false, attemptsUsed: 3, maxAttempts: 3 })).toBe("flagged");
    expect(nextStatusAfterCheck({ passed: true, attemptsUsed: 1, maxAttempts: 3 })).toBe("awaiting_tom");
    expect(normalizeMaxAttempts(undefined)).toBe(3);
    expect(normalizeMaxAttempts("5")).toBe(5);
  });

  it("only approved is live; only awaiting_tom is in Tom's queue; flagged is separate", () => {
    for (const s of DOOR_MODEL_AUDIT_STATUSES) {
      expect(isLiveInDesigner(s)).toBe(s === "approved");
      expect(isInApprovalQueue(s)).toBe(s === "awaiting_tom");
      expect(isNeedsAttention(s)).toBe(s === "flagged");
    }
    expect(canTransition("flagged", "awaiting_tom")).toBe(false);
    expect(canTransition("flagged", "approved")).toBe(false);
    expect(canTransition("generating", "approved")).toBe(false);
  });

  it("re-audits when a door or drawer photo changes", () => {
    const source = { doorSampleImageUrl: "/a.jpg", drawerSampleImageUrl: "/d.jpg", doorStyle: "Shaker", finish: null, color: "White", renderHex: "#fff" };
    const fp = doorModelSourceFingerprint(source);
    expect(enqueueDecision({ source, existing: null })).toEqual({ action: "enqueue", reason: "first-time" });
    expect(enqueueDecision({ source, existing: { status: "approved", sourceFingerprint: fp } }).action).toBe("skip");
    expect(enqueueDecision({ source: { ...source, drawerSampleImageUrl: "/d2.jpg" }, existing: { status: "approved", sourceFingerprint: fp } }))
      .toEqual({ action: "enqueue", reason: "source-changed" });
    expect(enqueueDecision({ source: { ...source, doorSampleImageUrl: null }, existing: null }).action).toBe("skip");
  });
});

describe("door model audit wiring", () => {
  const router = read("server/routers/doorModelAudit.ts");

  it("every write and queue procedure is admin only; only designerModels is public", () => {
    for (const name of ["awaitingTom", "needsAttention", "counts", "history", "approve", "reject", "retry"]) {
      expect(router).toMatch(new RegExp(`${name}: adminProcedure`));
    }
    expect(router.match(/publicProcedure/g)?.length).toBe(2); // import + designerModels
    expect(router).toMatch(/designerModels: publicProcedure/);
  });

  it("the Designer query returns only approved models", () => {
    expect(router).toMatch(/eq\(doorModelAudits\.status, "approved"\)/);
    expect(router).toContain("approvedModelSpec");
  });

  it("the approval queue lists awaiting_tom and needs attention lists flagged, separately", () => {
    expect(router).toContain('awaitingTom: adminProcedure.query(() => auditCards(["awaiting_tom"]))');
    expect(router).toContain('needsAttention: adminProcedure.query(() => auditCards(["flagged"]))');
  });

  it("is mounted inside the door rendering audit router", () => {
    expect(read("server/routers/doorRenderingAudit.ts")).toContain("autoAudit: doorModelAuditRouter");
  });

  it("is triggered next to every sample photo save that already queues room scenes", () => {
    const portal = read("server/routers/distributorPortal.ts");
    const catalog = read("server/routers/catalog.ts");
    expect(portal.match(/scheduleDoorModelAudit\(/g)?.length).toBe(2);
    expect(portal).toContain("scheduleDoorModelAuditForStyles(");
    expect(catalog.match(/scheduleDoorModelAudit\(/g)?.length).toBe(4);
  });

  it("only the admin approve path writes approvedModelSpec", () => {
    const core = read("server/doorModelAuditCore.ts");
    expect(core.match(/approvedModelSpec: attempt\.modelSpec/g)?.length).toBe(1);
    expect(core).toContain('status: "approved"');
    expect(core.match(/status: "approved"/g)?.length).toBe(1);
  });

  it("ships the migration, the journal entry, and the by-hand TiDB file", () => {
    const sql = read("docs/sql/0227_door_model_audit.tidb.sql");
    expect(sql).toContain("RUN BEFORE MERGING");
    expect(sql.match(/CREATE TABLE IF NOT EXISTS cabinet_dealz\./g)?.length).toBe(3);
    expect(sql).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/);
    expect(read("drizzle/0227_door_model_audit.sql")).toContain("`door_model_audits`");
    expect(read("drizzle/meta/_journal.json")).toContain("0227_door_model_audit");
  });

  it("the admin page has Awaiting Tom and Needs attention tabs with Approve and Reject", () => {
    const page = read("client/src/components/admin/DoorModelAuditAdmin.tsx");
    expect(page).toContain("Awaiting Tom");
    expect(page).toContain("Needs attention");
    expect(page).toContain("Approve");
    expect(page).toContain("Source door sample photo");
    expect(page).toContain("reason");
    expect(read("client/src/components/admin/AdminGroupedTabs.tsx")).toContain("<DoorModelAuditAdmin />");
  });
});
