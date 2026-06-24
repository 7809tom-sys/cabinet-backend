import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, notInConflict } from "../db";
import { cabinets } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";
import {
  matchCabinetCodes,
  summarizeMatches,
  type CatalogEntry,
  type ExtractedCode,
} from "@shared/cabinetCodeMatch";

// JSON schema the vision model must return.
const extractionSchema = {
  name: "cabinet_code_extraction",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            code: { type: "string", description: "The cabinet code/SKU exactly as written" },
            quantity: { type: "integer", description: "Quantity if shown, else 1" },
          },
          required: ["code", "quantity"],
        },
      },
    },
    required: ["items"],
  },
} as const;

const SYSTEM_PROMPT = `You are a kitchen-cabinet takeoff assistant. The user uploads a photo or scan of a cabinet list, kitchen floor plan, quote, or hand-written takeoff.
Your ONLY job is to extract the cabinet CODES (a.k.a. nomenclature / SKUs) and their quantities.
Cabinet codes look like: B24, B-24, DB24-3, W3030, SB36, WDC2436, BLS36, VB30, etc. (letters + numbers, sometimes with dashes).
Rules:
- Return EVERY distinct cabinet code you can read, with its quantity (default 1 if no quantity is shown).
- If the same code appears multiple times as separate lines, sum the quantities.
- Read codes EXACTLY as written; do not invent, correct, or expand them.
- Ignore prices, dimensions-only notes, room labels, and anything that is not a cabinet code.
- If you cannot read any codes, return an empty items array.`;

const dataUrlInput = z
  .string()
  .min(16)
  .refine((s) => s.startsWith("data:image/"), "Must be a data:image/* URL");

export const ocrRouter = router({
  // Extract cabinet codes from an uploaded image and match them to the catalog.
  extractFromImage: protectedProcedure
    .input(
      z.object({
        // base64 data URL, e.g. "data:image/png;base64,...."
        imageDataUrl: dataUrlInput,
        // optional original filename for the stored record
        filename: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // 1. Persist a copy of the upload to S3 (best-effort; never blocks OCR).
      let storedUrl: string | null = null;
      try {
        const m = input.imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (m) {
          const [, mime, b64] = m;
          const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "png";
          const buf = Buffer.from(b64, "base64");
          // Guard: cap stored size ~10MB
          if (buf.length <= 10 * 1024 * 1024) {
            const safeName = (input.filename || `takeoff.${ext}`).replace(/[^a-zA-Z0-9._-]/g, "_");
            const { url } = await storagePut(`ocr-uploads/u${ctx.user.id}-${safeName}`, buf, mime);
            storedUrl = url;
          }
        }
      } catch {
        // storage failure is non-fatal for the extraction itself
      }

      // 2. Vision extraction.
      let extracted: ExtractedCode[] = [];
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: "Extract all cabinet codes and quantities from this image." },
                { type: "image_url", image_url: { url: input.imageDataUrl } },
              ],
            },
          ],
          responseFormat: { type: "json_schema", json_schema: extractionSchema },
          maxTokens: 2000,
        });

        const raw = result.choices?.[0]?.message?.content;
        const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((p: any) => (p.type === "text" ? p.text : "")).join("") : "";
        const parsed = JSON.parse(text || "{}") as { items?: ExtractedCode[] };
        extracted = Array.isArray(parsed.items) ? parsed.items : [];
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not read the image. Try a clearer, well-lit photo or a typed list.",
        });
      }

      // 3. Match against the live master catalog.
      const catRows = await db
        .select({
          id: cabinets.id,
          masterCode: cabinets.masterCode,
          description: cabinets.description,
          category: cabinets.category,
        })
        .from(cabinets)
        .where(and(eq(cabinets.isActive, true), notInConflict()));

      const catalog: CatalogEntry[] = catRows.map((c) => ({
        id: c.id,
        masterCode: c.masterCode,
        description: c.description,
        category: c.category,
      }));

      const matches = matchCabinetCodes(extracted, catalog);
      const summary = summarizeMatches(matches);

      return { storedUrl, matches, summary };
    }),
});
