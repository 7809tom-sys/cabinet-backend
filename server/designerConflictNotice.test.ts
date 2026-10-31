import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  CABINET_CONFLICT_NOTICE_TEXT, addConflictNotice, cabinetConflictAdminHref, isInCabinetConflict, shouldShowCabinetConflictNotice,
} from "../client/src/lib/cabinetConflictNotice";

const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), "utf8");
const db = read("server/db.ts");
const design = read("server/routers/design.ts");
const tool = read("client/src/pages/DesignTool.tsx");
const notice = read("client/src/components/design/CabinetConflictNotice.tsx");

describe("Designer keeps published Cabinet Conflict items usable", () => {
  it("notInConflict() no longer excludes conflict items, but still needs active, canonical and a published price", () => {
    const fn = db.slice(db.indexOf("export function notInConflict()"), db.indexOf("let _db"));
    expect(fn).not.toContain("conflictStatus");
    expect(fn).toContain("eq(cabinets.isActive, true)");
    expect(fn).toContain("isCanonicalCabinetMaster()");
    expect(fn).toContain("hasPositivePublishedCabinetPrice()");
  });
  it("designer catalog and price lookups no longer drop conflict rows, and send conflictStatus to the client", () => {
    expect(design).toContain("conflictStatus: cabinets.conflictStatus");
    // only the retired-master price authority and the trim alias keep the old gate
    expect((design.match(/ne\(cabinets\.conflictStatus, "conflict"\)/g) ?? []).length).toBe(2);
  });
});

describe("admin-only conflict pop-up", () => {
  const item = { conflictStatus: "conflict" };
  it("shows only for role admin and only for conflict/review items", () => {
    expect(shouldShowCabinetConflictNotice({ role: "admin" }, item)).toBe(true);
    expect(shouldShowCabinetConflictNotice({ role: "admin" }, { conflictStatus: "review" })).toBe(true);
    expect(shouldShowCabinetConflictNotice({ role: "admin" }, { conflictStatus: "none" })).toBe(false);
    expect(shouldShowCabinetConflictNotice({ role: "user" }, item)).toBe(false);
    expect(shouldShowCabinetConflictNotice(null, item)).toBe(false);
    expect(shouldShowCabinetConflictNotice({ role: "admin" }, null)).toBe(false);
    expect(isInCabinetConflict({ conflictStatus: null })).toBe(false);
  });
  it("uses Tom's exact text and links to the item in Admin > Cabinet Conflict", () => {
    expect(CABINET_CONFLICT_NOTICE_TEXT).toBe("This item is in Cabinet Conflict. Please go to Cabinet Conflict to rectify it. You can keep using it in this design as needed.");
    expect(cabinetConflictAdminHref("B18 FH")).toBe("/admin?tab=conflicts&item=B18%20FH");
  });
  it("is keyed on the master code and does not stack duplicates", () => {
    expect(addConflictNotice([], "W1230GD")).toEqual(["W1230GD"]);
    expect(addConflictNotice(["W1230GD"], "W1230GD")).toEqual(["W1230GD"]);
    expect(addConflictNotice(["A"], " ")).toEqual(["A"]);
  });
  it("is dismissible and non-blocking (no modal/overlay), wired to addCabinet and admin-only render", () => {
    expect(notice).toContain('aria-label="Dismiss"');
    expect(notice).toContain("pointer-events-auto");
    expect(notice).not.toMatch(/Dialog|fixed inset-0|backdrop/i);
    expect(tool).toContain("shouldShowCabinetConflictNotice(conflictNoticeUserRef.current");
    expect(tool).toContain("isAdmin && conflictNotices.length > 0");
    expect(tool).toContain("pointer-events-none fixed bottom-4 right-4");
  });
  it("Admin > Cabinet Conflict highlights the linked item", () => {
    const admin = read("client/src/components/admin/ConflictsAdmin.tsx");
    expect(admin).toContain('.get("item")');
    expect(admin).toContain("conflict-item-${c.masterCode}");
  });
});
