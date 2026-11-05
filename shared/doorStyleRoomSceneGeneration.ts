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

/** A color name plus its code, e.g. "Alabaster (SW 7008)". Never a palette snap. */
export type RoomSceneColorOfRecord = {
  /** Exact 6-digit hex, normalized to `#rrggbb`. */
  hex: string | null;
  /** The name or code as recorded, when one is on file. */
  label: string | null;
  /** Where the hex came from, so the prompt can say if it is an approved render. */
  source: "approved-render" | "style-record" | "none";
};

export type RoomSceneProfileDetails = {
  doorStyle?: string | null;
  doorShape?: string | null;
  panelConstruction?: string | null;
  doorPanelType?: string | null;
  insideEdgeProfile?: string | null;
  railWidth?: string | number | null;
  stileWidth?: string | number | null;
  centerRailWidth?: string | number | null;
  drawerFrontType?: string | null;
  finish?: string | null;
  grainDirection?: string | null;
  finishSheen?: string | null;
};

export type RoomScenePromptStyle = RoomSceneProfileDetails & {
  ourName: string;
  color?: string | null;
  /** The color of record. When present this wins over `color` and any photo. */
  colorOfRecord?: RoomSceneColorOfRecord | null;
  /** True when an approved door render image is passed as a reference. */
  approvedRenderIsReference?: boolean;
};

function clean(value: string | null | undefined): string | null {
  const text = (value ?? "").trim();
  return text.length > 0 ? text : null;
}

/** Inches as stored, e.g. `0.75` or `"0.75"` -> "0.75 inches". Null stays null. */
function widthInInches(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const numeric = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const rounded = Math.round(numeric * 100) / 100;
  return `${rounded} inch${rounded === 1 ? "" : "es"}`;
}

/**
 * One sentence naming the color of record.
 *
 * The recorded hex is authoritative. A name or code is appended when one is on
 * file. Nothing here snaps to a brand palette: the hex goes into the prompt
 * exactly as recorded, so an approved render's measured color is what the model
 * is told to paint.
 */
export function colorOfRecordSentence(color: RoomSceneColorOfRecord | null | undefined): string | null {
  if (!color || !color.hex) return null;
  const hex = color.hex.toLowerCase();
  const label = clean(color.label);
  const named = label ? `${label} (${hex})` : hex;
  const origin = color.source === "approved-render"
    ? " taken from the approved door render for this style"
    : color.source === "style-record"
      ? " recorded on this door style"
      : "";
  return `Paint every cabinet door and drawer front exactly ${named}${origin}. Use this exact color value and do not substitute, tint, brighten, or snap it to a brand palette.`;
}

/**
 * Only the profile details that are actually filled in. A blank field is left
 * out entirely rather than guessed, so the model is never told something the
 * catalog does not know.
 */
export function profileDetailSentences(style: RoomSceneProfileDetails): string[] {
  const sentences: string[] = [];
  const doorStyle = clean(style.doorStyle);
  const shape = clean(style.doorShape);
  if (doorStyle || shape) {
    const label = [doorStyle, shape].filter(Boolean).join(" / ");
    sentences.push(`Door style: ${label}.`);
  }
  const panel = clean(style.panelConstruction);
  const panelType = clean(style.doorPanelType);
  if (panel || panelType) {
    const parts = [panelType, panel].filter(Boolean).filter((part, index, all) => all.indexOf(part) === index);
    sentences.push(`Door panel construction: ${parts.join(", ")}.`);
  }
  const insideEdge = clean(style.insideEdgeProfile);
  if (insideEdge) sentences.push(`Inside edge profile: ${insideEdge}.`);
  const rail = widthInInches(style.railWidth);
  const stile = widthInInches(style.stileWidth);
  const centerRail = widthInInches(style.centerRailWidth);
  if (rail || stile) {
    const parts = [
      rail ? `rail ${rail}` : null,
      stile ? `stile ${stile}` : null,
      centerRail ? `center rail ${centerRail}` : null,
    ].filter(Boolean);
    sentences.push(`Face frame proportions: ${parts.join(", ")}.`);
  }
  const drawerFront = clean(style.drawerFrontType);
  if (drawerFront) sentences.push(`Drawer front type: ${drawerFront}.`);
  const finish = clean(style.finish);
  const sheen = clean(style.finishSheen);
  if (finish || sheen) {
    const parts = [finish, sheen].filter(Boolean);
    sentences.push(`Finish: ${parts.join(", ")}.`);
  }
  const grain = clean(style.grainDirection);
  if (grain) sentences.push(`Grain direction: ${grain}.`);
  return sentences;
}

/**
 * The prompt for an automatic door-style room scene.
 *
 * Order of authority, made explicit for the model:
 *   1. the color of record (approved render hex, else the style's own hex) wins
 *      over everything, including the sample photo;
 *   2. the profile details that are filled in describe the construction;
 *   3. the sample photos are references for profile, grain, and finish detail.
 *
 * When the sample photo's color differs from the selected color, the prompt
 * says the selected hex wins.
 */
export function buildDoorStyleRoomScenePrompt(style: RoomScenePromptStyle): string {
  const name = clean(style.ourName) ?? "selected";
  const color = colorOfRecordSentence(style.colorOfRecord);
  const hasHex = Boolean(style.colorOfRecord?.hex);
  const approved = Boolean(style.approvedRenderIsReference) || style.colorOfRecord?.source === "approved-render";
  const references: string[] = [];
  if (approved) {
    references.push(
      "The first reference image is the door render approved for this style. Use it to read the profile, panel, edge profile, and grain detail.",
    );
  }
  references.push(
    "The reference door photo is the verified cabinet door this style is sold as. Use it for the door and drawer profile, panel shape, edge detail, and grain; it is the shape reference.",
  );
  if (approved) {
    references.push("The next reference image is the verified drawer front. Match every drawer front to that photo's profile and construction.");
  } else {
    references.push("The second reference image is the verified drawer front. Match every drawer front to that photo's profile and construction, even when it differs from the door.");
  }
  const conflictRule = hasHex
    ? "If a reference photo's cabinet color differs in any way from the color stated above, the stated color value wins and the photo's color must be ignored. Apply the stated color to every door and drawer front."
    : "If the reference photos differ from one another in color, follow the door photo's color, because it is the color this style is sold as.";
  const details = profileDetailSentences(style);
  return [
    `Photorealistic architectural photograph of a kitchen using the "${name}" cabinet door style.`,
    color ?? "",
    ...references,
    conflictRule,
    ...details,
    "Show an L-shaped kitchen with base cabinets, drawers, and wall cabinets, bright natural daylight, eye-level three-quarter view.",
    "No people, no text, no watermark, no logo, and do not paste the reference photos into the frame.",
  ].filter((part) => part.length > 0).join(" ");
}
