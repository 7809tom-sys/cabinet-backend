export type FourAnchorKind = "sink" | "stove" | "dishwasher" | "refrigerator";
export type FourAnchorLayoutType = "galley" | "l-shape" | "u-shape" | "single-wall";
export type FourAnchorOriginCorner = "left" | "right";
export type FourAnchorRunDirection = "left" | "right";

export type FourAnchorMeasurement = {
  x: number;
  y: number;
};

export type FourAnchorInputs = {
  layoutType: FourAnchorLayoutType;
  originCorner: FourAnchorOriginCorner;
  runDirection: FourAnchorRunDirection;
  sink: FourAnchorMeasurement;
  stove: FourAnchorMeasurement;
  dishwasher?: FourAnchorMeasurement | null;
  refrigerator: FourAnchorMeasurement;
  sinkWindowCenter?: FourAnchorMeasurement | null;
};

export type FourAnchorPlacement = FourAnchorMeasurement & {
  kind: FourAnchorKind;
  source: "measured" | "adjacent-to-sink" | "sink-window-centered";
};

export type FourAnchorBuildPlan = {
  layoutType: FourAnchorLayoutType;
  originCorner: FourAnchorOriginCorner;
  runDirection: FourAnchorRunDirection;
  anchors: FourAnchorPlacement[];
  surroundingRules: readonly ["fillers", "blind corners", "molding", "substitution"];
};

export type FourAnchorBuildResult =
  | { ok: true; plan: FourAnchorBuildPlan }
  | { ok: false; missing: FourAnchorKind[] };

/**
 * The pure, non-destructive planning boundary for the administrator-only
 * four-anchor action. It deliberately returns a plan rather than mutating
 * Designer state; the caller must commit it through a separate admin UI action.
 */
export function planFourAnchorAutoBuild(
  input: FourAnchorInputs,
): FourAnchorBuildResult {
  const missing: FourAnchorKind[] = [];
  if (!validPoint(input.sink)) missing.push("sink");
  if (!validPoint(input.stove)) missing.push("stove");
  if (!validPoint(input.refrigerator)) missing.push("refrigerator");

  const dishwasher = validPoint(input.dishwasher) ? input.dishwasher : null;
  if (!dishwasher && input.dishwasher !== null && input.dishwasher !== undefined) missing.push("dishwasher");
  if (missing.length) return { ok: false, missing };

  const sink = input.sinkWindowCenter && validPoint(input.sinkWindowCenter)
    ? { ...input.sinkWindowCenter, kind: "sink" as const, source: "sink-window-centered" as const }
    : { ...input.sink, kind: "sink" as const, source: "measured" as const };
  const dishwasherPlacement = dishwasher
    ? { ...dishwasher, kind: "dishwasher" as const, source: "measured" as const }
    : { x: input.sink.x, y: input.sink.y, kind: "dishwasher" as const, source: "adjacent-to-sink" as const };

  return {
    ok: true,
    plan: {
      layoutType: input.layoutType,
      originCorner: input.originCorner,
      runDirection: input.runDirection,
      anchors: [
        sink,
        { ...input.stove, kind: "stove", source: "measured" },
        dishwasherPlacement,
        { ...input.refrigerator, kind: "refrigerator", source: "measured" },
      ],
      surroundingRules: ["fillers", "blind corners", "molding", "substitution"],
    },
  };
}

export function canRunFourAnchorAutoBuild(isAdmin: boolean, hasHandPlacedItems: boolean): boolean {
  return isAdmin && !hasHandPlacedItems;
}

function validPoint(point: FourAnchorMeasurement | null | undefined): point is FourAnchorMeasurement {
  if (!point) return false;
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}
