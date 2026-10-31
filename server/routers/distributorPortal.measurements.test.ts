import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(process.cwd(), "server/routers/distributorPortal.ts"), "utf8");

describe("vendor sample-door measurement router contracts", () => {
  it("stores vendor-sourced measurements as pending submissions with a generated citation", () => {
    expect(source).toContain('submitDoorMeasurement: withVendorFeature("door_styles")');
    expect(source).toContain("measurementData: input.measurements");
    expect(source).toContain("status: \"pending\" as const");
    expect(source).toContain("Measured from sample door:");
    expect(source).toContain("submittedBy: ctx.user.id");
    expect(source).toContain("submittedByName: ctx.user.name ?? null");
  });

  it("requires every selected same-profile style to be owned and catalog-linked", () => {
    expect(source).toContain("appliesToStyleIds: z.array");
    expect(source).toContain("Every checked Door Style must belong to your own cabinet line.");
    expect(source).toContain("Every checked Door Style must be linked to at least one cabinet in your catalog.");
    expect(source).toContain("appliesToStyleIds,");
  });

  it("only applies the shared Designer profile after an admin confirms the physical sample and team values", () => {
    expect(source).toContain("reviewDoorMeasurementSubmission: adminProcedure");
    expect(source).toContain("Confirm that CabinetDealz measured the physical sample before approving it for Designer.");
    expect(source).toContain("Enter both team-measured rail and stile widths before approving Designer geometry.");
    expect(source).toContain("where(inArray(doorStyles.id, submission.appliesToStyleIds))");
    expect(source).toContain("sourceSpecification: submission.citation");
    expect(source).toContain("doorSampleVerified: true");
  });

  it("vendors edit door profile fields through the shared builder, limited to their own line", () => {
    // Replaces the old "submit measurements instead" block (Tom, Oct 31): vendors and admins
    // share one door profile editor; the server restricts vendors to their own distributor id.
    expect(source).toContain("...doorProfileFieldsShape");
    expect(source).toContain("Object.assign(patch, buildDoorProfilePatch(fields))");
    expect(source).toContain("assertCanEditDoorStyle(");
    expect(source).not.toContain("instead of editing Designer frame data directly");
  });
});
