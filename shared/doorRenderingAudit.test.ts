import { describe, expect, it } from "vitest";
import {
  DOOR_RENDERING_AUDIT_STYLE_CAP,
  DoorRenderingAuditError,
  liveFlagStatus,
  planVersionDecision,
  selectStylesForRun,
  styleChangedSinceLastRender,
  verdictForOverall,
  type DoorRenderingAuditCandidate,
} from "./doorRenderingAudit";

function style(partial: Partial<DoorRenderingAuditCandidate> & { styleId: number }): DoorRenderingAuditCandidate {
  return {
    samplePhotoUrl: "/manus-storage/sample.png",
    latest: null,
    ...partial,
  };
}

describe("door rendering audit scores and flags", () => {
  it("flags a render that beats the accepted overall score by at least one point", () => {
    expect(verdictForOverall(8, 7)).toEqual({ verdict: "flagged", flagged: true, scoreDelta: 1 });
    expect(verdictForOverall(9, 7)).toEqual({ verdict: "flagged", flagged: true, scoreDelta: 2 });
  });

  it("does not flag an equal or lower score", () => {
    expect(verdictForOverall(7, 7)).toEqual({ verdict: "not_flagged", flagged: false, scoreDelta: 0 });
    expect(verdictForOverall(6, 8)).toEqual({ verdict: "not_flagged", flagged: false, scoreDelta: -2 });
  });

  it("does not flag the first scored render when nothing is accepted yet", () => {
    expect(verdictForOverall(9, null)).toEqual({ verdict: "no_baseline", flagged: false, scoreDelta: null });
  });

  it("keeps a newer high score flagged after the baseline is reverted to an older render", () => {
    expect(liveFlagStatus({
      latest: { versionId: 2, overall: 8 },
      accepted: { versionId: 1, overall: 6 },
      latestEventAction: null,
    })).toBe("flagged");
    expect(liveFlagStatus({
      latest: { versionId: 2, overall: 8 },
      accepted: { versionId: 2, overall: 8 },
      latestEventAction: "reverted",
    })).toBe("accepted");
  });

  it("shows a rejected newest render as rejected without moving the baseline", () => {
    expect(liveFlagStatus({
      latest: { versionId: 2, overall: 9 },
      accepted: { versionId: 1, overall: 6 },
      latestEventAction: "rejected",
    })).toBe("rejected");
  });
});

describe("door rendering audit version decisions", () => {
  const versions = [
    { id: 1, styleId: 5, overall: 6 },
    { id: 2, styleId: 5, overall: 8 },
  ];
  const events = [{ id: 10, styleId: 5, versionId: 1, action: "accepted" as const }];

  it("accepts a flagged render as the new baseline and leaves every version in place", () => {
    const before = structuredClone(versions);
    const plan = planVersionDecision({ versions, events, versionId: 2, action: "accepted" });
    expect(plan).toEqual({ styleId: 5, previousAcceptedVersionId: 1, nextAcceptedVersionId: 2 });
    expect(versions).toEqual(before);
  });

  it("rejects a flagged render without changing the accepted version", () => {
    const plan = planVersionDecision({ versions, events, versionId: 2, action: "rejected" });
    expect(plan.nextAcceptedVersionId).toBe(1);
    expect(plan.previousAcceptedVersionId).toBe(1);
  });

  it("reverts to an older version and records that the previous baseline is replaced", () => {
    const afterAccept = [
      ...events,
      { id: 11, styleId: 5, versionId: 2, action: "accepted" as const },
    ];
    const plan = planVersionDecision({ versions, events: afterAccept, versionId: 1, action: "reverted" });
    expect(plan).toEqual({ styleId: 5, previousAcceptedVersionId: 2, nextAcceptedVersionId: 1 });
    expect(versions.map((row) => row.id)).toEqual([1, 2]);
  });

  it("refuses to accept or revert the version that is already current", () => {
    expect(() => planVersionDecision({ versions, events, versionId: 1, action: "accepted" })).toThrow(DoorRenderingAuditError);
    expect(() => planVersionDecision({ versions, events, versionId: 1, action: "reverted" })).toThrow(
      /already the accepted version/,
    );
  });

  it("refuses to reject the current accepted render", () => {
    expect(() => planVersionDecision({ versions, events, versionId: 1, action: "rejected" })).toThrow(
      /Revert to another version/,
    );
  });

  it("reports a missing version", () => {
    expect(() => planVersionDecision({ versions, events, versionId: 99, action: "reverted" })).toThrow(
      /not found/,
    );
  });
});

describe("door rendering audit run selection", () => {
  it("treats a new sample photo or a new designer version as changed", () => {
    const current = style({
      styleId: 1,
      latest: { samplePhotoUrl: "/manus-storage/sample.png", renderingCommit: "aaa" },
    });
    expect(styleChangedSinceLastRender(current, "aaa")).toBe(false);
    expect(styleChangedSinceLastRender(current, "bbb")).toBe(true);
    expect(styleChangedSinceLastRender({ ...current, samplePhotoUrl: "/manus-storage/new.png" }, "aaa")).toBe(true);
    expect(styleChangedSinceLastRender(style({ styleId: 2 }), null)).toBe(true);
  });

  it("skips unchanged styles by default and caps a run at 40", () => {
    const styles = [
      style({
        styleId: 1,
        latest: { samplePhotoUrl: "/manus-storage/sample.png", renderingCommit: "aaa" },
      }),
      ...Array.from({ length: 45 }, (_, index) => style({ styleId: index + 2 })),
    ];
    const changed = selectStylesForRun({ styles, scope: "changed", renderingCommit: "aaa" });
    expect(changed.skippedUnchanged).toBe(1);
    expect(changed.selected).toHaveLength(DOOR_RENDERING_AUDIT_STYLE_CAP);
    expect(changed.truncated).toBe(true);
    expect(changed.selected.map((row) => row.styleId)).toEqual(Array.from({ length: 40 }, (_, index) => index + 2));
  });

  it("includes unchanged styles when the admin asks for every style, still capped", () => {
    const styles = Array.from({ length: 3 }, (_, index) => style({
      styleId: index + 1,
      latest: { samplePhotoUrl: "/manus-storage/sample.png", renderingCommit: "aaa" },
    }));
    const selected = selectStylesForRun({ styles, scope: "all", renderingCommit: "aaa" });
    expect(selected.skippedUnchanged).toBe(0);
    expect(selected.selected.map((row) => row.styleId)).toEqual([1, 2, 3]);
  });

  it("audits the styles an admin picked, including one that has not changed", () => {
    const styles = [
      style({
        styleId: 4,
        latest: { samplePhotoUrl: "/manus-storage/sample.png", renderingCommit: "aaa" },
      }),
      style({ styleId: 9, samplePhotoUrl: null }),
    ];
    const selected = selectStylesForRun({
      styles,
      scope: "selected",
      styleIds: [4, 9, 4, 12],
      renderingCommit: "aaa",
    });
    expect(selected.selected.map((row) => row.styleId)).toEqual([4]);
    expect(selected.skippedMissingSample).toBe(1);
    expect(selected.missingStyleIds).toEqual([12]);
    expect(selected.skippedUnchanged).toBe(0);
  });

  it("puts styles that have never been rendered ahead of styles that only changed", () => {
    const styles = [
      style({
        styleId: 3,
        samplePhotoUrl: "/manus-storage/new.png",
        latest: { samplePhotoUrl: "/manus-storage/old.png", renderingCommit: "aaa" },
      }),
      style({ styleId: 8 }),
    ];
    const selected = selectStylesForRun({ styles, scope: "changed", renderingCommit: "aaa" });
    expect(selected.selected.map((row) => row.styleId)).toEqual([8, 3]);
  });
});
