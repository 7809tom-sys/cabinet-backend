import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AdminStickyNotes workspace", () => {
  it("offers durable shared-note actions with author attribution and no customer-facing wording", () => {
    const source = readFileSync(new URL("./AdminStickyNotes.tsx", import.meta.url), "utf8");
    expect(source).toContain("trpc.adminStickyNotes.list.useQuery()");
    expect(source).toContain("trpc.adminStickyNotes.create.useMutation");
    expect(source).toContain("trpc.adminStickyNotes.update.useMutation");
    expect(source).toContain("trpc.adminStickyNotes.remove.useMutation");
    expect(source).toContain("Private working notes for CabinetDealz administrators.");
    expect(source).toContain("Post note");
    expect(source).toContain("Pinned");
    expect(source).toContain("Remove this shared note for every administrator?");
  });

  it("registers Team Notes only in the administrator Operations workspace", () => {
    const source = readFileSync(new URL("./AdminGroupedTabs.tsx", import.meta.url), "utf8");
    const adminPage = readFileSync(new URL("../../pages/Admin.tsx", import.meta.url), "utf8");
    expect(source).toContain('{ value: "team-notes", label: "Team Notes" }');
    expect(source).toContain('<TabsContent value="team-notes" className="mt-6"><AdminStickyNotes /></TabsContent>');
    expect(adminPage).toContain('if (isSalesRep)');
    expect(adminPage).toContain('if (isDesigner)');
    expect(adminPage).toContain('<AdminGroupedTabs />');
    expect(adminPage.indexOf('<AdminGroupedTabs />')).toBeGreaterThan(adminPage.indexOf('if (isDesigner)'));
  });
});
