/**
 * Door blueprint ground truth for every AI path that describes or draws a door.
 *
 * The backend does not share the frontend's blueprint files, so this mirrors only
 * the facts the prompts need. Nothing here is invented; each fact cites its source
 * in cabinet-frontend (origin/main @ 489a7d7d, 2026-11-23). If the frontend rule
 * changes, change it here too.
 *
 *   shared/shakerDoorBlueprint.ts:62      DL_SHAKER_FIRM_RULE: every shaker door uses the DL shaker style.
 *   shared/shakerDoorBlueprint.ts:65      STANDARD_SHAKER_RAIL_IN = 3
 *   shared/shakerDoorBlueprint.ts:67-72   DL_SHAKER_GEOMETRY: corners "square", center "flat-slab", shared shaker notch
 *   shared/shakerDoorBlueprint.ts:177-178 classify: slim|narrow|skinny|thin-frame => slim-shaker; double => double-shaker
 *   shared/shakerDoorBlueprint.ts:189-205 standard rail 2.75 or 3 in; effectiveShakerRailIn defaults a plain shaker to 3 in
 *   shared/shakerDoorBlueprint.ts:311-314 slim, double and hickory are not the DL blueprint
 *   shared/doorBoxBlueprint.ts:139-175    dlShakerDoorBox: five pieces (top rail, bottom rail, two stiles, flat recessed center slab)
 */

export type DoorGroundTruthInput = {
  /** Our name for the style, e.g. "Honey Core". */
  ourName?: string | null;
  /** The distributor's name, e.g. "Shaker Honey". */
  distributorName?: string | null;
  /** Whatever single name the caller has (used when ourName and distributorName are absent). */
  doorName?: string | null;
  /** The profile field, e.g. "Shaker". */
  doorStyle?: string | null;
  woodSpecies?: string | null;
  /** The color, e.g. "SW 3122 Honey". */
  color?: string | null;
  /** The finish, e.g. "UV Coated Natural Interior". */
  finish?: string | null;
  /** Stored rail or stile width in inches, when the style has one. */
  railWidthIn?: number | string | null;
};

export type DoorBlueprintFamily = "shaker" | "slim-shaker" | "double-shaker" | "hickory-shaker" | "other";

export const DL_SHAKER_FIRM_RULE = "FIRM RULE (Tom): every shaker door uses the DL shaker style.";
export const STANDARD_SHAKER_RAIL_IN = 3;

const clean = (value: string | number | null | undefined): string => (value == null ? "" : String(value).trim());

/** Mirrors shakerDoorFamily + isHickoryDoor in the frontend, from the text fields available here. */
export function doorBlueprintFamily(input: DoorGroundTruthInput): DoorBlueprintFamily {
  const text = [input.doorStyle, input.ourName, input.distributorName, input.doorName].map(clean).join(" ").toLowerCase();
  if (!/shaker/.test(text)) return "other";
  if (/\b(?:slim|narrow|skinny|thin[\s-]?frame)\b/.test(text)) return "slim-shaker";
  if (/\bdouble\b/.test(text)) return "double-shaker";
  if (/\bhickory\b/.test(text)) return "hickory-shaker";
  return "shaker";
}

function railInches(input: DoorGroundTruthInput): number {
  const parsed = Number.parseFloat(clean(input.railWidthIn));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : STANDARD_SHAKER_RAIL_IN;
}

function blueprintLine(input: DoorGroundTruthInput): string {
  const family = doorBlueprintFamily(input);
  if (family === "shaker") {
    const rail = railInches(input);
    return `Blueprint: this door uses the DL Shaker blueprint (${DL_SHAKER_FIRM_RULE}). It is a five-piece shaker door: one single recessed flat center panel, two stiles and two rails, square corners and a square inside edge, with the standard ${rail} inch rail and stile width.`;
  }
  if (family === "slim-shaker") {
    return "Blueprint: a slim shaker with its own narrow frame. It is not the DL Shaker blueprint and not the standard 2.75/3 inch rail. Describe the frame width only as seen in the photo.";
  }
  if (family === "double-shaker") {
    return "Blueprint: a double shaker with two panels. It is not the DL Shaker blueprint (which has one flat center panel).";
  }
  if (family === "hickory-shaker") {
    return "Blueprint: a hickory door that keeps its own catalog photo. It is not the DL Shaker blueprint. Describe the construction only as seen in the photo.";
  }
  return "Blueprint: this is not a plain shaker, so the DL Shaker blueprint does not apply. Describe its construction only as seen in the photo, and do not call it a shaker.";
}

/** The GROUND TRUTH block appended to every door description or door image prompt. */
export function doorGroundTruthBlock(input: DoorGroundTruthInput = {}): string {
  const ourName = clean(input.ourName) || clean(input.doorName);
  const distributorName = clean(input.distributorName);
  const names = [ourName, distributorName && distributorName !== ourName ? `distributor name: ${distributorName}` : ""]
    .filter(Boolean)
    .join(" / ");
  const lines = [
    "GROUND TRUTH (from our catalog; this is fact, not a guess):",
    `- Door style name: ${names || "not supplied"}`,
    `- Door style (profile): ${clean(input.doorStyle) || "not supplied"}`,
    `- Wood species: ${clean(input.woodSpecies) || "not supplied"}`,
    `- Color: ${clean(input.color) || "not supplied"}`,
    `- Finish: ${clean(input.finish) || "not supplied"}`,
    `- ${blueprintLine(input)}`,
    "You must not contradict this ground truth. Do not add or remove panels, and do not describe a raised panel, a two-panel door, a bevel, a bead or any other profile that the blueprint does not have. Within it, describe only the color, the grain and the finish as you see them.",
  ];
  return lines.join("\n");
}

/** `prompt`, then the ground-truth block. Safe to call twice: an existing block is not repeated. */
export function withDoorGroundTruth(prompt: string, input?: DoorGroundTruthInput | null): string {
  const base = prompt.trim();
  if (base.includes("GROUND TRUTH (from our catalog")) return base;
  return `${base}\n\n${doorGroundTruthBlock(input ?? {})}`;
}
