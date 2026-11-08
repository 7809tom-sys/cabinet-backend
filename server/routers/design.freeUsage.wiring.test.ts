import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const photoRenders = readFileSync(
  new URL("./designPhotoRenders.ts", import.meta.url),
  "utf8"
);
const design = readFileSync(new URL("./design.ts", import.meta.url), "utf8");

/**
 * The body of one procedure, from its name to the next sibling procedure (or
 * the end). Matches any procedure kind, so admin endpoints work too.
 */
const PROCEDURE_KINDS = [
  "protectedProcedure",
  "publicProcedure",
  "adminProcedure",
] as const;

function procedureBody(source: string, name: string, nextName?: string) {
  // Procedure keys are indented two spaces and sit at the start of a line, which
  // keeps the search off the same word inside a SQL string or a comment.
  const marker = `\n  ${name}: `;
  const start = source.indexOf(marker);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  const afterMarker = start + marker.length;
  expect(
    PROCEDURE_KINDS.some(kind => source.startsWith(kind, afterMarker)),
    `${name} is not a procedure`
  ).toBe(true);
  if (!nextName) return source.slice(start);
  const relative = source
    .slice(afterMarker)
    .search(new RegExp(`\\n  ${nextName}: `));
  expect(relative, `${nextName} not found after ${name}`).toBeGreaterThan(-1);
  return source.slice(start, afterMarker + relative);
}

describe("free-use cap is enforced at every design-tool entry point", () => {
  it("gates a new photo render, and only after the cached-render early return", () => {
    const create = procedureBody(photoRenders, "create");
    const gateAt = create.indexOf(
      'assertFreeUsageAvailable(usageGate, "photo_render")'
    );
    const claimAt = create.indexOf(
      'claimFreeUsage(db, usageGate, "photo_render"'
    );
    const cachedReturnAt = create.indexOf("reused: true");
    const insertAt = create.indexOf("await db.insert(designPhotoRenders)");
    expect(gateAt).toBeGreaterThan(-1);
    expect(claimAt).toBeGreaterThan(gateAt);
    // Re-serving a cached render is free, so the gate comes after that return.
    expect(gateAt).toBeGreaterThan(cachedReturnAt);
    expect(gateAt).toBeLessThan(insertAt);
    // A failed render hands the use back instead of charging for nothing.
    expect(create).toContain("releaseFreeUsage(db, usageClaim)");
  });

  it("gates a new saved design but never an edit or an autosave", () => {
    const save = procedureBody(design, "save", "autosave");
    const gateAt = save.indexOf(
      'assertFreeUsageAvailable(usageGate, "design")'
    );
    const firstInsertAt = save.indexOf("db.insert(kitchenDesigns)");
    const earlierReturnAt = save.indexOf("recoveredFromStaleId: false");
    expect(gateAt).toBeGreaterThan(-1);
    // The existing-design branch returns before the gate, so editing is free.
    expect(earlierReturnAt).toBeGreaterThan(-1);
    expect(earlierReturnAt).toBeLessThan(gateAt);
    expect(gateAt).toBeLessThan(firstInsertAt);
    expect(save).toContain("releaseFreeUsage(db, usageClaim)");
  });

  it("gates an Auto Design run and offers a way to hand an abandoned run back", () => {
    const auto = procedureBody(design, "startAutoDesign", "releaseAutoDesign");
    expect(auto).toContain('assertFreeUsageAvailable(gate, "auto_design")');
    expect(auto).toContain('claimFreeUsage(db, gate, "auto_design"');
    const release = procedureBody(design, "releaseAutoDesign", "rename");
    expect(release).toContain("releaseUsageById");
  });

  it("decides the cap from the signed-in person, not from the design's store", () => {
    // A storefront customer's design also carries an affiliateId. Keying the cap
    // off that would charge shoppers for the store's membership status.
    const save = procedureBody(design, "save", "autosave");
    expect(save).toContain("loadFreeUsageGate(db, ctx.user)");
    expect(save).not.toContain("loadFreeUsageGate(db, ctx.user, affiliateId)");
  });

  it("exposes the admin grant, renew, and view endpoints as adminProcedure only", () => {
    const grant = procedureBody(
      design,
      "adminGrantDesigns",
      "adminRenewDesignGrant"
    );
    const renew = procedureBody(
      design,
      "adminRenewDesignGrant",
      "adminDesignGrant"
    );
    const view = procedureBody(design, "adminDesignGrant", "rename");
    // Declared as adminProcedure, never reachable as a plain procedure.
    for (const [name, body] of [
      ["adminGrantDesigns", grant],
      ["adminRenewDesignGrant", renew],
      ["adminDesignGrant", view],
    ] as const) {
      expect(design).toContain(`${name}: adminProcedure`);
      expect(design).not.toContain(`${name}: protectedProcedure`);
      expect(design).not.toContain(`${name}: publicProcedure`);
      expect(body, name).toContain("ctx.user");
    }
    // A grant is written only through the grant and renew mutations.
    expect(grant).toContain("writeDesignGrant");
    expect(renew).toContain("renewDesignGrant");
    expect(view).toContain("loadGrantView");
    // Viewing must not write anything.
    expect(view).not.toContain("writeDesignGrant");
    expect(view).not.toContain("renewDesignGrant");
  });
});
