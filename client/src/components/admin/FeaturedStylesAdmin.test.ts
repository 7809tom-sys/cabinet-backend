import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adminSource = readFileSync(
  resolve(process.cwd(), "client/src/components/admin/FeaturedStylesAdmin.tsx"),
  "utf8",
);

describe("FeaturedStylesAdmin room-scene libraries", () => {
  it("presents a six-scene library for each individual Door Style", () => {
    expect(adminSource).toContain("const MAX_SCENES_PER_STYLE = 6");
    expect(adminSource).toContain("Room Scene Library");
    expect(adminSource).toContain("Add verified matching scene");
    expect(adminSource).toContain("Room scene required");
    expect(adminSource).toContain("shared with every affiliate");
  });

  it("shows verified distributor attribution only in the authorized management component", () => {
    expect(adminSource).toContain("function SourceAttribution");
    expect(adminSource).toContain("Verified distributor:");
    expect(adminSource).toContain("never shown to public shoppers");
  });

  it("shows authorized staff whether a door-frame entry is complete, partial, or blank before saving", () => {
    expect(adminSource).toContain('frameEntryStatus === "complete"');
    expect(adminSource).toContain('"Ready for Designer"');
    expect(adminSource).toContain('"Partial frame entry"');
    expect(adminSource).toContain('"No frame measurement entered"');
    expect(adminSource).toContain("Rail and stile measurements must be positive values in inches");
  });

  it("shows the curated room-scene list whether each style has a complete Designer frame entry", () => {
    expect(adminSource).toContain('"Designer frame ready"');
    expect(adminSource).toContain('"Designer frame partial"');
    expect(adminSource).toContain('"Designer frame blank"');
    expect(adminSource).toContain("Verified rail and stile values will drive the Designer frame");
  });
});
