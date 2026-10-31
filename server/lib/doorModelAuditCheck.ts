import { invokeLLM, type InvokeResult } from "../_core/llm";
import {
  DOOR_MODEL_AUDIT_CHECKS,
  DoorModelAuditError,
  type DoorModelCheckNotes,
  type DoorModelCheckScores,
} from "../../shared/doorModelAudit";
import { DOOR_RENDER_AUDIT_MODEL, imageUrlToDataUrl, messageText } from "./doorRenderingAuditScore";

type Invoker = (params: Parameters<typeof invokeLLM>[0]) => Promise<InvokeResult>;

const scoreField = (description: string) => ({ type: "integer", description });
const noteField = { type: "string", description: "One short sentence on the biggest gap, or an empty string when it matches" };

const RESPONSE_FORMAT = {
  type: "json_schema" as const,
  json_schema: {
    name: "door_model_audit_check",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        color: scoreField("Color match from 1 to 10"),
        grain: scoreField("Grain and texture match from 1 to 10"),
        profile: scoreField("Door profile match (shaker, slab, slim, raised) from 1 to 10"),
        proportions: scoreField("Rail, stile and panel proportions from 1 to 10"),
        drawerFront: scoreField("Drawer front match from 1 to 10"),
        colorNote: noteField,
        grainNote: noteField,
        profileNote: noteField,
        proportionsNote: noteField,
        drawerFrontNote: noteField,
      },
      required: [
        "color", "grain", "profile", "proportions", "drawerFront",
        "colorNote", "grainNote", "profileNote", "proportionsNote", "drawerFrontNote",
      ],
    },
  },
};

const INSTRUCTIONS = [
  "You audit a 3D cabinet door model against the real supplier sample photos.",
  "Image 1 is the real door sample photo. If a real drawer-front photo is given it comes next.",
  "The remaining images are renders of the 3D model: straight-on door and drawer, a 3/4 view, and a small cabinet run.",
  "Score each check from 1 (clearly different) to 10 (matches the sample).",
  "color: hue, depth and finish tone. grain: wood grain direction, figure, scale and surface texture/sheen.",
  "profile: the door style, such as shaker, slab/flat, slim shaker or raised panel, and edge detail.",
  "proportions: rail and stile widths and panel size relative to the door.",
  "drawerFront: the drawer front style matches the sample (slab, shaker, five-piece) and reads as the same family as the door.",
  "Score only what is visible. If no real drawer photo is given, judge the drawer front against the door sample's family.",
  "Each note is one short sentence naming the gap, written so a 3D artist can fix it. Use an empty string when it matches.",
].join(" ");

export type DoorModelCheckInput = {
  doorSampleUrl: string;
  drawerSampleUrl: string | null;
  previews: { straight: string; threeQuarter: string; run: string };
};

export type DoorModelCheckResult = {
  scores: DoorModelCheckScores;
  notes: DoorModelCheckNotes;
  model: string;
};

export function parseDoorModelCheck(text: string): { scores: DoorModelCheckScores; notes: DoorModelCheckNotes } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DoorModelAuditError("The vision model did not return check scores.");
  }
  if (!parsed || typeof parsed !== "object") throw new DoorModelAuditError("The vision model did not return check scores.");
  const record = parsed as Record<string, unknown>;
  const scores = {} as DoorModelCheckScores;
  const notes = {} as DoorModelCheckNotes;
  for (const check of DOOR_MODEL_AUDIT_CHECKS) {
    const raw = record[check];
    const value = typeof raw === "number" ? Math.round(raw) : Number.NaN;
    if (!Number.isFinite(value) || value < 1 || value > 10) {
      throw new DoorModelAuditError(`The vision model returned an invalid ${check} score.`);
    }
    scores[check] = value;
    const note = record[`${check}Note`];
    notes[check] = typeof note === "string" ? note.trim().slice(0, 300) : "";
  }
  return { scores, notes };
}

/** Uses the same Gemini vision path (invokeLLM) as the existing door rendering audit. */
export async function checkDoorModelAgainstSample(
  input: DoorModelCheckInput,
  invoke: Invoker = invokeLLM,
): Promise<DoorModelCheckResult> {
  const content: Array<Record<string, unknown>> = [{ type: "text", text: INSTRUCTIONS }];
  const add = async (label: string, url: string) => {
    content.push({ type: "text", text: label });
    content.push({ type: "image_url", image_url: { url: await imageUrlToDataUrl(url), detail: "auto" } });
  };
  await add("Real door sample photo:", input.doorSampleUrl);
  if (input.drawerSampleUrl) await add("Real drawer-front sample photo:", input.drawerSampleUrl);
  await add("Render, straight-on door and drawer:", input.previews.straight);
  await add("Render, 3/4 view:", input.previews.threeQuarter);
  await add("Render, small cabinet run:", input.previews.run);
  const result = await invoke({
    model: DOOR_RENDER_AUDIT_MODEL,
    maxTokens: 900,
    responseFormat: RESPONSE_FORMAT,
    messages: [
      { role: "system", content: "You score 3D cabinet door models. Reply with the requested JSON only." },
      { role: "user", content: content as never },
    ],
  });
  return { ...parseDoorModelCheck(messageText(result)), model: DOOR_RENDER_AUDIT_MODEL };
}
