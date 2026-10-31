import { DOOR_MODEL_RENDERER_NOT_CONFIGURED, DoorModelAuditError } from "../../shared/doorModelAudit";
import { storagePut } from "../storage";

export type DoorModelRenderRequest = {
  style: {
    id: number;
    ourName: string;
    doorStyle: string | null;
    finish: string | null;
    color: string | null;
    renderHex: string | null;
  };
  doorSampleUrl: string;
  drawerSampleUrl: string | null;
  attemptNo: number;
  /** Failed-check notes or Tom's rejection reason to fix on this attempt. */
  feedback: string | null;
  previousModelSpec: string | null;
};

export type DoorModelRenderResult = {
  /** JSON the Designer's InteractiveRoom3D loads for this door and drawer front. */
  modelSpec: string;
  previews: { straight: string; threeQuarter: string; run: string };
};

export interface DoorModelRenderer {
  configured(): boolean;
  render(request: DoorModelRenderRequest): Promise<DoorModelRenderResult>;
}

const MAX_SPEC_BYTES = 64 * 1024;

async function storePreview(styleId: number, attemptNo: number, kind: string, value: unknown): Promise<string> {
  if (typeof value !== "string" || !value) throw new DoorModelAuditError(`The renderer returned no ${kind} preview.`);
  const data = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (data) {
    const ext = data[1] === "image/png" ? "png" : data[1] === "image/webp" ? "webp" : "jpg";
    const { url } = await storagePut(
      `door-model-audit/style-${styleId}/attempt-${attemptNo}-${kind}.${ext}`,
      Buffer.from(data[2], "base64"),
      data[1],
    );
    return url;
  }
  if (/^https?:\/\//i.test(value) || value.startsWith("/manus-storage/")) return value;
  throw new DoorModelAuditError(`The renderer returned an unusable ${kind} preview.`);
}

/**
 * There is no 3D renderer inside the web server (three.js runs only in the
 * browser). This talks to a separate render worker over HTTP:
 *   POST DOOR_MODEL_RENDERER_URL  (Authorization: Bearer DOOR_MODEL_RENDERER_TOKEN)
 * Body: DoorModelRenderRequest. Response JSON:
 *   { modelSpec: object|string, previews: { straight, threeQuarter, run } }
 * where each preview is an https/stored URL or a base64 image data URL.
 */
export const httpDoorModelRenderer: DoorModelRenderer = {
  configured: () => Boolean(process.env.DOOR_MODEL_RENDERER_URL?.trim()),
  async render(request) {
    const url = process.env.DOOR_MODEL_RENDERER_URL?.trim();
    if (!url) throw new DoorModelAuditError(DOOR_MODEL_RENDERER_NOT_CONFIGURED);
    const token = process.env.DOOR_MODEL_RENDERER_TOKEN?.trim();
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) throw new DoorModelAuditError(`The 3D renderer failed (${response.status}).`);
    const body = (await response.json()) as { modelSpec?: unknown; previews?: Record<string, unknown> };
    const spec = typeof body.modelSpec === "string" ? body.modelSpec : JSON.stringify(body.modelSpec ?? null);
    if (!body.modelSpec || spec.length > MAX_SPEC_BYTES) {
      throw new DoorModelAuditError("The 3D renderer returned no usable model.");
    }
    const id = request.style.id;
    return {
      modelSpec: spec,
      previews: {
        straight: await storePreview(id, request.attemptNo, "straight", body.previews?.straight),
        threeQuarter: await storePreview(id, request.attemptNo, "three-quarter", body.previews?.threeQuarter),
        run: await storePreview(id, request.attemptNo, "run", body.previews?.run),
      },
    };
  },
};
