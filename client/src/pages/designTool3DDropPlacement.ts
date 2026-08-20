export type ThreeDWallDropTarget = { x: number; y: number };

export type WallFreeSegment = { start: number; length: number };

/**
 * Chooses a cabinet start within a free wall segment nearest to the point where
 * the designer released the catalog item. Falls back to the first fit only
 * when the drop target does not land in a segment wide enough for the item.
 */
export function nearestFreeWallDropStart(
  targetAlong: number,
  width: number,
  segments: WallFreeSegment[],
): number | null {
  const fits = segments.filter((segment) => segment.length >= width);
  if (fits.length === 0) return null;
  const containing = fits.find((segment) => targetAlong >= segment.start && targetAlong <= segment.start + segment.length);
  const segment = containing ?? [...fits].sort((a, b) => {
    const distanceA = Math.abs(targetAlong - (a.start + a.length / 2));
    const distanceB = Math.abs(targetAlong - (b.start + b.length / 2));
    return distanceA - distanceB;
  })[0];
  return Math.max(segment.start, Math.min(targetAlong - width / 2, segment.start + segment.length - width));
}
