/**
 * Pure builder for the AI Photoreal Preview prompt. Kept framework-free and
 * side-effect-free so it can be unit tested and shared between the server
 * mutation and any future preview surface.
 *
 * The goal is a CONSISTENT, professional interior-photography look across every
 * render: same lens, same lighting language, same staging discipline — while
 * the design-specific facts (room size, finish, door style, counter, hardware,
 * per-wall layout) drive what is actually shown.
 */

export type CameraAngle = "three-quarter" | "straight-on" | "wide";
export type TimeOfDay = "daylight" | "golden-hour" | "evening";

export interface PhotorealPromptInput {
  roomWidthFt: number;
  roomDepthFt: number;
  ceilingFt?: number;
  finishName?: string;
  doorStyle?: string;
  secondFinishName?: string;
  countertop?: string;
  hardware?: string;
  wallSummaries?: string[];
  hasIsland?: boolean;
  notes?: string;
  /** Camera framing. Defaults to a flattering three-quarter angle. */
  cameraAngle?: CameraAngle;
  /** Lighting mood. Defaults to bright natural daylight. */
  timeOfDay?: TimeOfDay;
}

const CAMERA_CLAUSE: Record<CameraAngle, string> = {
  "three-quarter":
    "Shot from a natural eye-level three-quarter angle that shows two adjoining runs of cabinetry receding into the room, 24mm full-frame lens, straight verticals (no keystone distortion), composed like an architectural digest interior.",
  "straight-on":
    "Shot straight-on and level with the main cabinet run, symmetric one-point perspective, 35mm full-frame lens, straight verticals, centered composition like a catalog hero photo.",
  wide:
    "Wide establishing shot from a corner of the room, 20mm full-frame lens kept level to avoid distortion, showing the full kitchen layout with generous foreground floor.",
};

const LIGHT_CLAUSE: Record<TimeOfDay, string> = {
  daylight:
    "Bright, even natural daylight pouring in from a large window, soft diffused shadows, clean neutral white balance, airy and inviting.",
  "golden-hour":
    "Warm late-afternoon golden-hour light raking across the counters, long soft shadows, cozy amber highlights balanced against cool window fill.",
  evening:
    "Evening scene lit by warm under-cabinet LED strips and recessed ceiling downlights, gentle pools of light on the counters, calm and upscale mood.",
};

/** Round a foot value for clean prose (no trailing .0). */
function ft(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

export function buildPhotorealPrompt(input: PhotorealPromptInput): string {
  const finish = (input.finishName || "").trim();
  const door = (input.doorStyle || "").trim();
  const counter = (input.countertop || "").trim();
  const hardware = (input.hardware || "").trim();
  const ceiling = input.ceilingFt ?? 8;
  const angle = input.cameraAngle ?? "three-quarter";
  const mood = input.timeOfDay ?? "daylight";

  const parts: string[] = [];

  // 1. Medium + overall quality bar.
  parts.push(
    "Professional photorealistic interior photograph of a real, fully-built residential kitchen, editorial real-estate / architectural-digest quality, ultra realistic, high dynamic range, physically-based materials, crisp focus with subtle natural depth of field."
  );

  // 2. Camera + lighting (the consistency backbone).
  parts.push(CAMERA_CLAUSE[angle]);
  parts.push(LIGHT_CLAUSE[mood]);

  // 3. Room envelope.
  parts.push(
    `The room is approximately ${ft(input.roomWidthFt)} feet wide by ${ft(input.roomDepthFt)} feet deep with a ${ft(ceiling)}-foot ceiling, painted a soft neutral white on the walls with a light wood or warm-toned floor.`
  );

  // 4. Cabinetry (the star of the shot).
  if (door || finish) {
    const twoTone = input.secondFinishName?.trim()
      ? `, with a two-tone scheme where the island or lower cabinets are ${input.secondFinishName.trim()}`
      : "";
    const desc = [finish, door && `${door}-style`].filter(Boolean).join(" ");
    parts.push(
      `The cabinetry is ${desc || "custom"} kitchen cabinets${twoTone}, with clean consistent reveals, realistic door and drawer fronts, and true-to-life paint or wood-grain texture.`
    );
  } else {
    parts.push("Custom kitchen cabinets with clean consistent reveals and realistic fronts.");
  }

  if (counter) {
    parts.push(`The countertops are ${counter} with a realistic polished surface, subtle reflections, and a proper thickness with a finished front edge.`);
  }
  if (hardware) {
    parts.push(`Cabinet hardware is ${hardware}, consistently placed on every door and drawer.`);
  }

  // 5. Layout so the render tracks what the user actually built.
  if (input.wallSummaries && input.wallSummaries.length > 0) {
    parts.push("Layout of the cabinetry: " + input.wallSummaries.join("; ") + ".");
  }
  if (input.hasIsland) {
    parts.push("A central kitchen island with cabinetry and countertop matching the perimeter, with a small amount of walking clearance around it.");
  }
  if (input.notes?.trim()) parts.push(input.notes.trim());

  // 6. Staging discipline.
  parts.push(
    "Tastefully but minimally staged: a few realistic props such as a bowl of fruit, a cutting board, or a plant, but uncluttered counters."
  );

  // 7. Hard constraints (negative prompt) to keep renders clean and on-brief.
  parts.push(
    "Do NOT include: people, hands, pets, text, letters, numbers, labels, watermarks, logos, floor-plan overlays, measurement lines, grid lines, blueprint or CAD look, cartoon or 3D-render CGI look, warped or melted cabinets, crooked walls, extra doors, duplicated fixtures, fisheye distortion, or blurry low-resolution artifacts."
  );

  return parts.join(" ");
}
