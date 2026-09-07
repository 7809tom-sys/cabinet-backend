export const ELEVATION_PIXELS_PER_INCH = 4;
export const SHAKER_FACE_FRAME_INCHES = 3;
export const SHAKER_FACE_FRAME_PX = SHAKER_FACE_FRAME_INCHES * ELEVATION_PIXELS_PER_INCH;

export interface ShakerFacePanelGeometry {
  stileInches: number;
  railInches: number;
  centerPanelWidthInches: number;
  centerPanelHeightInches: number;
  horizontalInsetPercent: number;
  verticalInsetPercent: number;
}

/**
 * Physical Shaker face geometry. Verified stile and rail values may be supplied
 * by the authorized Door Style record; absent values retain the neutral 3-inch
 * profile. The center panel remains independent of screen zoom.
 */
export function shakerFacePanelGeometry(faceWidthInches: number, faceHeightInches: number, verified?: { stileInches?: number | null; railInches?: number | null }): ShakerFacePanelGeometry {
  const width = Math.max(0.1, faceWidthInches);
  const height = Math.max(0.1, faceHeightInches);
  const requestedStile = Number(verified?.stileInches);
  const requestedRail = Number(verified?.railInches);
  const stile = Math.min(Number.isFinite(requestedStile) && requestedStile > 0 ? requestedStile : SHAKER_FACE_FRAME_INCHES, width / 2);
  const rail = Math.min(Number.isFinite(requestedRail) && requestedRail > 0 ? requestedRail : SHAKER_FACE_FRAME_INCHES, height / 2);
  return {
    stileInches: stile,
    railInches: rail,
    centerPanelWidthInches: Math.max(0, width - stile * 2),
    centerPanelHeightInches: Math.max(0, height - rail * 2),
    horizontalInsetPercent: (stile / width) * 100,
    verticalInsetPercent: (rail / height) * 100,
  };
}

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
 * Every framed face uses a verified authored stile inset when present; the
 * neutral three-inch Shaker inset remains the fallback for blank fields.
 */
export function elevationFrameInsetPx(kind: string, authoredInset?: number | null): number | null {
  if (isFlatPanelElevationStyle(kind)) return null;
  return authoredInset ?? (isShakerElevationStyle(kind) ? SHAKER_FACE_FRAME_PX : null);
}

/**
 * Drawer fronts are shorter than doors, so preserve the authored frame width
 * while keeping enough visible recessed-panel area for the elevation drawing.
 */
export function drawerPanelInsetPx(frameInsetPx: number | null | undefined, isShaker = false): number {
  if (isShaker) return frameInsetPx ?? SHAKER_FACE_FRAME_PX;
  return Math.min(10, Math.max(3, Math.round(frameInsetPx ?? 3)));
}
