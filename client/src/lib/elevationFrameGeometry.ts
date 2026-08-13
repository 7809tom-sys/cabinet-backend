export const ELEVATION_PIXELS_PER_INCH = 4;
export const SHAKER_FACE_FRAME_INCHES = 3;
export const SHAKER_FACE_FRAME_PX = SHAKER_FACE_FRAME_INCHES * ELEVATION_PIXELS_PER_INCH;

export function isShakerElevationStyle(kind: string): boolean {
  return kind === "shaker" || kind === "slim-shaker" || kind === "double-shaker";
}

export function isFlatPanelElevationStyle(kind: string): boolean {
  return kind === "slab";
}

/**
 * Converts a cabinet style's authored face-frame width in inches into the
 * elevation renderer's pixel-scale inset. The renderer's standard elevation
 * scale is approximately four pixels per inch, so a 3-inch stile/rail becomes
 * a 12-pixel recessed-panel reveal.
 */
export function frameInsetPxFromInches(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const inches = Number.parseFloat(String(value));
  if (!Number.isFinite(inches) || inches <= 0) return null;
  return Math.min(16, Math.max(2, Math.round(inches * ELEVATION_PIXELS_PER_INCH)));
}

/**
 * Every Shaker-classified face follows the global elevation standard: 3-inch
 * rails and stiles with square 90-degree corners. Other styles may retain
 * their authored elevation inset.
 */
export function elevationFrameInsetPx(kind: string, authoredInset?: number | null): number | null {
  if (isFlatPanelElevationStyle(kind)) return null;
  return isShakerElevationStyle(kind) ? SHAKER_FACE_FRAME_PX : authoredInset ?? null;
}

/**
 * Drawer fronts are shorter than doors, so preserve the authored frame width
 * while keeping enough visible recessed-panel area for the elevation drawing.
 */
export function drawerPanelInsetPx(frameInsetPx: number | null | undefined, isShaker = false): number {
  if (isShaker) return SHAKER_FACE_FRAME_PX;
  return Math.min(10, Math.max(3, Math.round(frameInsetPx ?? 3)));
}
