export type PlanSwitchSourceCabinet = {
  cabinetId: number;
  masterCode: string;
  description: string | null;
  category: string | null;
  subCategory: string | null;
  placementType: string | null;
  width: number;
  height: number;
  depth: number;
  numberOfDoors: number | null;
  numberOfDrawers: number | null;
  isCornerCabinet: boolean;
};

export type PricedPlanSwitchCandidate = PlanSwitchSourceCabinet & {
  customerPrice: number;
};

export type PlanSwitchAlternative = PricedPlanSwitchCandidate & {
  matchKind: "exact_function" | "corner_equivalent";
  doorCountChanged: boolean;
  drawerCountChanged: boolean;
  explanation: string;
};

const DIMENSION_EPSILON_IN = 0.25;

function sameDimension(a: number, b: number) {
  return Math.abs(a - b) <= DIMENSION_EPSILON_IN;
}

function normalizedCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function isLazySusanOrEasyReach(source: PlanSwitchSourceCabinet) {
  const code = normalizedCode(source.masterCode);
  const text = `${source.category ?? ""} ${source.subCategory ?? ""} ${source.description ?? ""}`.toLowerCase();
  return code.startsWith("LS") || text.includes("lazy susan") || text.includes("easy reach");
}

function isShelfCorner(candidate: PricedPlanSwitchCandidate) {
  const code = normalizedCode(candidate.masterCode);
  const text = `${candidate.category ?? ""} ${candidate.subCategory ?? ""} ${candidate.description ?? ""}`.toLowerCase();
  return code.startsWith("ER") || code.startsWith("BER") || text.includes("easy reach") || text.includes("shelf corner");
}

function matchingBaseGeometry(source: PlanSwitchSourceCabinet, candidate: PricedPlanSwitchCandidate) {
  return sameDimension(source.width, candidate.width)
    && sameDimension(source.height, candidate.height)
    && sameDimension(source.depth, candidate.depth);
}

function isExactFunctionalMatch(source: PlanSwitchSourceCabinet, candidate: PricedPlanSwitchCandidate) {
  if (!matchingBaseGeometry(source, candidate)) return false;
  if ((source.placementType ?? "") !== (candidate.placementType ?? "")) return false;
  if (source.isCornerCabinet !== candidate.isCornerCabinet) return false;
  return (source.category ?? "").toLowerCase() === (candidate.category ?? "").toLowerCase();
}

function isCornerEquivalent(source: PlanSwitchSourceCabinet, candidate: PricedPlanSwitchCandidate) {
  if (!isLazySusanOrEasyReach(source) || !isShelfCorner(candidate)) return false;
  if (!sameDimension(source.width, candidate.width) || !sameDimension(source.height, candidate.height)) return false;
  // A shelf-corner can be shallower than a Lazy Susan body. It never expands
  // the existing cabinet footprint, so the user review remains collision-safe.
  return candidate.depth <= source.depth + DIMENSION_EPSILON_IN;
}

function alternativeExplanation(source: PlanSwitchSourceCabinet, candidate: PricedPlanSwitchCandidate, kind: PlanSwitchAlternative["matchKind"]) {
  const changes: string[] = [];
  if (source.numberOfDoors != null && candidate.numberOfDoors != null && source.numberOfDoors !== candidate.numberOfDoors) {
    changes.push(`${source.numberOfDoors}-door to ${candidate.numberOfDoors}-door front`);
  }
  if (source.numberOfDrawers != null && candidate.numberOfDrawers != null && source.numberOfDrawers !== candidate.numberOfDrawers) {
    changes.push(`${source.numberOfDrawers}-drawer to ${candidate.numberOfDrawers}-drawer layout`);
  }
  if (kind === "corner_equivalent") changes.push("shelf-corner body instead of a Lazy Susan carousel");
  return changes.length > 0
    ? `Same usable fit; changes ${changes.join(" and ")}.`
    : "Same cabinet use and installed dimensions.";
}

/**
 * Select only verified, already-priced functional replacements. This intentionally
 * does not invent a match across a different cabinet footprint or placement type.
 */
export function pricedFunctionalAlternatives(
  source: PlanSwitchSourceCabinet,
  candidates: readonly PricedPlanSwitchCandidate[],
  limit = 3,
): PlanSwitchAlternative[] {
  const alternatives = candidates.flatMap((candidate) => {
    if (candidate.cabinetId === source.cabinetId || candidate.customerPrice <= 0) return [];
    const matchKind = isExactFunctionalMatch(source, candidate)
      ? "exact_function" as const
      : isCornerEquivalent(source, candidate)
      ? "corner_equivalent" as const
      : null;
    if (!matchKind) return [];
    return [{
      ...candidate,
      matchKind,
      doorCountChanged: source.numberOfDoors != null && candidate.numberOfDoors != null && source.numberOfDoors !== candidate.numberOfDoors,
      drawerCountChanged: source.numberOfDrawers != null && candidate.numberOfDrawers != null && source.numberOfDrawers !== candidate.numberOfDrawers,
      explanation: alternativeExplanation(source, candidate, matchKind),
    } satisfies PlanSwitchAlternative];
  });

  return alternatives.sort((a, b) => {
    const kindRank = (value: PlanSwitchAlternative) => value.matchKind === "exact_function" ? 0 : 1;
    const kindDifference = kindRank(a) - kindRank(b);
    if (kindDifference !== 0) return kindDifference;
    const doorDifference = Number(a.doorCountChanged) - Number(b.doorCountChanged);
    if (doorDifference !== 0) return doorDifference;
    const drawerDifference = Number(a.drawerCountChanged) - Number(b.drawerCountChanged);
    if (drawerDifference !== 0) return drawerDifference;
    return a.masterCode.localeCompare(b.masterCode, undefined, { numeric: true });
  }).slice(0, limit);
}
