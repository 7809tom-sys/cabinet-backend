/**
 * When both a door style's door photo and drawer-front photo are present and
 * verified, the server generates one room scene. This module is the decision
 * logic only: no database, no image provider, no keys.
 *
 * Door verification today is `doorSampleVerified`, set by an admin photo
 * correction or by approving a sample-door measurement. Drawer fronts had no
 * matching flag, so `drawerSampleVerified` follows the same rule.
 */

export const AUTO_ROOM_SCENE_SOURCE_NOTE = "Auto-generated draft from verified door and drawer photos";
export const AUTO_ROOM_SCENE_NAME = "Room";
export const ROOM_SCENE_GENERATION_NOT_CONFIGURED = "GEMINI_API_KEY is not configured";

/**
 * Fixed cabinetry constraint for every auto room-scene prompt. Callers cannot
 * pass a replacement. `buildDoorStyleRoomScenePrompt` always appends this
 * exact text after any style-specific sentences.
 */
export const DOOR_STYLE_ROOM_SCENE_CABINETRY_RULE = "Staging may be added (plants, decor, accessories, styling), but never add extra cabinets or alter the cabinet design, door style, door or drawer fronts, finish/color, hardware, sizes or layout. The cabinetry must faithfully match the verified door and drawer photos provided.";

export type RoomSceneGenerationStatus = "pending" | "generating" | "ready" | "failed";

export type SampleImageState = {
  doorSampleImageUrl: string | null;
  drawerSampleImageUrl: string | null;
  doorSampleVerified: boolean;
  drawerSampleVerified: boolean;
};

export type RoomSceneGenerationSnapshot = {
  status: RoomSceneGenerationStatus;
  doorImageUrl: string;
  drawerImageUrl: string;
};

export function normalizedSampleUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

export function bothSampleImagesVerified(style: SampleImageState): boolean {
  return Boolean(
    normalizedSampleUrl(style.doorSampleImageUrl)
    && normalizedSampleUrl(style.drawerSampleImageUrl)
    && style.doorSampleVerified
    && style.drawerSampleVerified,
  );
}

export type GenerationDecision =
  | { action: "skip"; reason: "not-ready" | "same-images-in-progress" | "same-images-ready" | "same-images-failed" }
  | { action: "start"; reason: "first-time" | "images-replaced" };

/**
 * One scene per verified pair. Re-verifying the same two URLs does not start
 * another job, including after a failure (an admin retry is separate). A new
 * URL on either image starts a replacement only once both are verified again.
 */
export function generationDecision(
  style: SampleImageState,
  existing: RoomSceneGenerationSnapshot | null,
  options?: { forceRetry?: boolean },
): GenerationDecision {
  if (!bothSampleImagesVerified(style)) return { action: "skip", reason: "not-ready" };
  const doorImageUrl = normalizedSampleUrl(style.doorSampleImageUrl)!;
  const drawerImageUrl = normalizedSampleUrl(style.drawerSampleImageUrl)!;
  if (!existing) return { action: "start", reason: "first-time" };
  const sameImages = existing.doorImageUrl === doorImageUrl && existing.drawerImageUrl === drawerImageUrl;
  if (!sameImages) return { action: "start", reason: "images-replaced" };
  if (existing.status === "failed") {
    return options?.forceRetry
      ? { action: "start", reason: "first-time" }
      : { action: "skip", reason: "same-images-failed" };
  }
  if (existing.status === "ready") return { action: "skip", reason: "same-images-ready" };
  return { action: "skip", reason: "same-images-in-progress" };
}

/**
 * Replacing a sample URL drops that photo's verified flag unless the caller
 * sets it in the same save. An administrator saving a non-empty replacement
 * verifies the new photo. A vendor replacement stays unverified.
 * Returns undefined when the URL did not change and no explicit flag was sent.
 */
export function nextSampleVerifiedFlag(input: {
  isAdmin: boolean;
  previousUrl: string | null;
  nextUrl?: string | null;
  explicitVerified?: boolean;
}): boolean | undefined {
  if (input.explicitVerified !== undefined) return input.explicitVerified;
  if (input.nextUrl === undefined) return undefined;
  if (normalizedSampleUrl(input.previousUrl) === normalizedSampleUrl(input.nextUrl)) return undefined;
  if (!normalizedSampleUrl(input.nextUrl)) return false;
  return input.isAdmin;
}

export function buildDoorStyleRoomScenePrompt(style: {
  ourName: string;
  doorStyle?: string | null;
  finish?: string | null;
  color?: string | null;
}): string {
  const details = [
    style.doorStyle?.trim() ? `Door profile: ${style.doorStyle.trim()}.` : "",
    style.color?.trim() ? `Color: ${style.color.trim()}.` : "",
    style.finish?.trim() ? `Finish: ${style.finish.trim()}.` : "",
  ].filter(Boolean);
  return [
    `Photorealistic architectural photograph of a kitchen using the "${style.ourName.trim() || "selected"}" cabinet door style.`,
    "The first reference image is the verified cabinet door. Match every cabinet door to that photo's profile, color, grain, and finish.",
    "The second reference image is the verified drawer front. Match every drawer front to that photo, even when it differs from the door.",
    ...details,
    "Show an L-shaped kitchen with base cabinets, drawers, and wall cabinets, bright natural daylight, eye-level three-quarter view.",
    "No people, no text, no watermark, no logo, and do not paste the reference photos into the frame.",
    DOOR_STYLE_ROOM_SCENE_CABINETRY_RULE,
  ].join(" ");
}
