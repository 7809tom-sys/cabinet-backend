import { describe, expect, it } from "vitest";
import { adminStickyNoteFields, adminStickyNotesRouter } from "./adminStickyNotes";

const nonAdminContext = {
  user: { id: 7, role: "affiliate", name: "Affiliate user" },
} as any;

describe("administrator shared sticky notes", () => {
  it("accepts bounded, color-coded internal note content and defaults to an unpinned yellow note", () => {
    expect(adminStickyNoteFields.parse({ body: "Confirm cabinet sample delivery." })).toEqual({
      body: "Confirm cabinet sample delivery.",
      color: "yellow",
      isPinned: false,
    });
    expect(adminStickyNoteFields.parse({ title: "Team follow-up", body: "Call supplier.", color: "mint", isPinned: true })).toMatchObject({
      title: "Team follow-up",
      body: "Call supplier.",
      color: "mint",
      isPinned: true,
    });
    expect(() => adminStickyNoteFields.parse({ body: " ", color: "outside" })).toThrow();
    expect(() => adminStickyNoteFields.parse({ body: "x".repeat(3_001) })).toThrow();
  });

  it("rejects non-administrators before a shared-note list can be read", async () => {
    const caller = adminStickyNotesRouter.createCaller(nonAdminContext);
    await expect(caller.list()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
