import type { DesignCabinet } from "@/lib/design";

export type CatalogFillerCandidate = Pick<
  DesignCabinet,
  "id" | "masterCode" | "description" | "category" | "subCategory" | "width" | "height" | "depth" | "catalogImageUrl"
>;

export type CatalogFillerPlacement = "base" | "wall";

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isCatalogFiller(candidate: Pick<CatalogFillerCandidate, "masterCode" | "description" | "category" | "subCategory">): boolean {
  const text = `${candidate.masterCode} ${candidate.description ?? ""} ${candidate.category ?? ""} ${candidate.subCategory ?? ""}`.toLowerCase();
  return /\bfiller\b|\bscribe\b|^wf|^bf|^ff/.test(text);
}

/**
 * Picks the narrowest sellable filler that covers the exact measured gap. The
 * installer trims this catalog item to `gapWidth`; no generic filler SKU or
 * inferred price is created. Placement ranking favors a 24-in deep base filler
 * or a 12-in deep wall filler, then the closest cuttable height.
 */
export function catalogFillerForGap(
  candidates: readonly CatalogFillerCandidate[],
  gapWidth: number,
  placement: CatalogFillerPlacement,
): CatalogFillerCandidate | null {
  if (!Number.isFinite(gapWidth) || gapWidth <= 0) return null;
  const desiredDepth = placement === "wall" ? 12 : 24;
  const desiredHeight = placement === "wall" ? 30 : 34.5;

  return candidates
    .filter(isCatalogFiller)
    .filter((candidate) => numberValue(candidate.width) + 0.001 >= gapWidth)
    .sort((left, right) => {
      const widthDelta = numberValue(left.width) - numberValue(right.width);
      if (Math.abs(widthDelta) > 0.001) return widthDelta;
      const leftDepth = Math.abs(numberValue(left.depth, desiredDepth) - desiredDepth);
      const rightDepth = Math.abs(numberValue(right.depth, desiredDepth) - desiredDepth);
      if (Math.abs(leftDepth - rightDepth) > 0.001) return leftDepth - rightDepth;
      const leftHeight = Math.abs(numberValue(left.height, desiredHeight) - desiredHeight);
      const rightHeight = Math.abs(numberValue(right.height, desiredHeight) - desiredHeight);
      if (Math.abs(leftHeight - rightHeight) > 0.001) return leftHeight - rightHeight;
      return left.masterCode.localeCompare(right.masterCode);
    })[0] ?? null;
}

export function fittedCatalogFillerDescription(candidate: Pick<CatalogFillerCandidate, "description" | "masterCode">, gapWidth: number): string {
  const source = candidate.description ?? candidate.masterCode;
  const rounded = Math.round(gapWidth * 100) / 100;
  return `${source} — cut to ${rounded}"`;
}
