import { catalogFillerForGap, type CatalogFillerCandidate } from "@/lib/catalogFiller";
import {
  isRefrigerator,
  refrigeratorAssemblyMemberRole,
  type IslandZone,
  type PlacedCabinet,
  type RoomData,
  type WallOpening,
} from "@/lib/design";
import {
  findIslandSmallGapFillerOpportunity,
  findSmallGapFillerOpportunity,
  type SmallGapFillerOpportunity,
} from "@/lib/smallGapFiller";

export type PreSavePlanReviewAction =
  | { kind: "filler"; opportunity: SmallGapFillerOpportunity; fillerCode: string }
  | { kind: "refrigerator"; refrigeratorUid: string }
  | { kind: "issue"; cabinetUid: string };

export type PreSavePlanReviewFinding = {
  id: string;
  severity: "recommendation" | "attention";
  title: string;
  description: string;
  actionLabel: string;
  action: PreSavePlanReviewAction;
};

export type PreSavePlanReview = {
  findings: PreSavePlanReviewFinding[];
};

export type PreSavePlanReviewInput = {
  room: RoomData;
  placed: readonly PlacedCabinet[];
  openings: readonly WallOpening[];
  island: IslandZone | null;
  catalogFillers: readonly CatalogFillerCandidate[];
  conflictUids: ReadonlySet<string>;
};

/**
 * Builds a pre-save construction review strictly from the existing, measured
 * plan. The review never changes the design itself; callers decide whether to
 * open the existing filler, refrigerator, or selected-cabinet workflow.
 */
export function buildPreSavePlanReview({
  room,
  placed,
  openings,
  island,
  catalogFillers,
  conflictUids,
}: PreSavePlanReviewInput): PreSavePlanReview {
  const findings: PreSavePlanReviewFinding[] = [];
  const recordedFillers = new Set<string>();

  for (const cabinet of placed) {
    const opportunity = cabinet.islandFace && island
      ? findIslandSmallGapFillerOpportunity(island, placed, cabinet.uid)
      : findSmallGapFillerOpportunity(room, placed, openings, cabinet.uid);
    if (!opportunity) continue;

    const filler = catalogFillerForGap(catalogFillers, opportunity.remaining, opportunity.layer);
    const uniqueOpening = `${opportunity.islandFace ?? opportunity.wall}:${opportunity.layer}:${opportunity.openingStart}:${opportunity.openingLength}`;
    if (!filler || recordedFillers.has(uniqueOpening)) continue;
    recordedFillers.add(uniqueOpening);
    findings.push({
      id: `filler:${cabinet.uid}:${uniqueOpening}`,
      severity: "recommendation",
      title: `Finish a ${opportunity.remaining}\" gap with ${filler.masterCode}`,
      description: `${cabinet.masterCode} nearly fills this measured ${opportunity.layer} opening. Review the existing left, right, or split filler choices before saving.`,
      actionLabel: "Review filler",
      action: { kind: "filler", opportunity, fillerCode: filler.masterCode },
    });
  }

  for (const refrigerator of placed.filter(isRefrigerator)) {
    const hasOverFridgeCabinet = placed.some((member) =>
      member.uid !== refrigerator.uid && refrigeratorAssemblyMemberRole(member, refrigerator, room) === "bridge",
    );
    if (hasOverFridgeCabinet) continue;
    findings.push({
      id: `refrigerator:${refrigerator.uid}`,
      severity: "recommendation",
      title: "Consider a cabinet above the refrigerator",
      description: `${refrigerator.masterCode} does not yet have a dedicated over-refrigerator cabinet. Review the compatible enclosure options before saving.`,
      actionLabel: "Review refrigerator options",
      action: { kind: "refrigerator", refrigeratorUid: refrigerator.uid },
    });
  }

  for (const cabinetUid of Array.from(conflictUids)) {
    const cabinet = placed.find((item) => item.uid === cabinetUid);
    if (!cabinet) continue;
    findings.push({
      id: `attention:${cabinetUid}`,
      severity: "attention",
      title: `Review ${cabinet.masterCode} placement`,
      description: "This item has an unresolved clearance, overlap, corner, opening, or ceiling check. Review its measured placement before saving.",
      actionLabel: "Review placement",
      action: { kind: "issue", cabinetUid },
    });
  }

  return { findings };
}
