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
  // An explicit 3D drop must honor its actual target. It may not silently move
  // the cabinet to another open run just because that run happens to fit.
  if (!containing) return null;
  const segment = containing;
  return Math.max(segment.start, Math.min(targetAlong - width / 2, segment.start + segment.length - width));
}
