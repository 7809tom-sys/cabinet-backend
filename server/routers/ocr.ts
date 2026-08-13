import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
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

const planInterpretationSchema = {
  name: "cabinet_plan_interpretation",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      roomWidthInches: { type: "number" },
      roomDepthInches: { type: "number" },
      cabinets: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            label: { type: "string" },
            cabinetType: { type: "string" },
            widthInches: { type: "number" },
            wall: { type: "string" },
            confidence: { type: "number" },
          },
          required: ["label", "cabinetType", "widthInches", "wall", "confidence"],
        },
      },
      appliances: { type: "array", items: { type: "string" } },
      reviewNotes: { type: "array", items: { type: "string" } },
    },
    required: ["roomWidthInches", "roomDepthInches", "cabinets", "appliances", "reviewNotes"],
  },
} as const;

const PLAN_SYSTEM_PROMPT = `You interpret kitchen cabinet layouts from a photographed or typed drawing.
Return only dimensions, cabinet notes, appliance labels, and wall assignments that are readable. Do not invent unreadable values. Convert millimetres to inches when they are explicitly labelled. Use confidence 0 through 1. Put unclear handwriting, missing dimensions, and geometry that needs confirmation into reviewNotes.`;

const SYSTEM_PROMPT = `You are a kitchen-cabinet takeoff assistant. The user uploads a photo or scan of a cabinet list, kitchen floor plan, quote, or hand-written takeoff.
Your ONLY job is to extract the cabinet CODES (a.k.a. nomenclature / SKUs) and their quantities.
Cabinet codes look like: B24, B-24, DB24-3, W3030, SB36, WDC2436, BLS36, VB30, etc. (letters + numbers, sometimes with dashes).
Rules:
- Return EVERY distinct cabinet code you can read, with its quantity (default 1 if no quantity is shown).
- If the same code appears multiple times as separate lines, sum the quantities.
- Treat a trailing "x 3", "x3", "X 3", or "* 3" as a quantity. For example, "B-12 x 3" means code B-12, quantity 3.
- Common handwritten codes include B-12, B24, SB36, W2142, and drawer-base codes. Preserve the code exactly as written; the app normalizes dashes afterwards.
- Ignore crossed-out or struck-through entries.
- Read codes EXACTLY as written; do not invent, correct, or expand them.
- Ignore prices, dimensions-only notes, room labels, and anything that is not a cabinet code.
- If you cannot read any codes, return an empty items array.`;

const dataUrlInput = z
  .string()
  .min(16)
  .max(12_000_000)
  .refine((s) => s.startsWith("data:image/"), "Must be a data:image/* URL");

// ─── CSV column headers that 2020 Design / common BOM exports use ────────────
// We try to auto-detect the code column by scanning the first row for any of
// these header strings (case-insensitive). The quantity column is optional.
const CODE_HEADERS = ["code", "sku", "item", "part", "product", "cabinet", "item no", "item #", "item number", "part no", "part #", "part number"];
const QTY_HEADERS = ["qty", "quantity", "count", "amount", "pcs", "pieces", "units"];

export const ocrRouter = router({
  interpretPlan: publicProcedure
    .input(z.object({ imageDataUrl: dataUrlInput }))
    .mutation(async ({ input }) => {
      try {
        const result = await invokeLLM({
          model: "gemini-3-flash-preview",
          messages: [
            { role: "system", content: PLAN_SYSTEM_PROMPT },
            { role: "user", content: [{ type: "text", text: "Read this existing kitchen design for review before editable placement." }, { type: "image_url", image_url: { url: input.imageDataUrl } }] },
          ],
          responseFormat: { type: "json_schema", json_schema: planInterpretationSchema },
          maxTokens: 4000,
        });
        const content = result.choices?.[0]?.message?.content;
        const text = typeof content === "string" ? content : "";
        return JSON.parse(text) as {
          roomWidthInches: number;
          roomDepthInches: number;
          cabinets: Array<{ label: string; cabinetType: string; widthInches: number; wall: string; confidence: number }>;
          appliances: string[];
          reviewNotes: string[];
        };
      } catch {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not interpret this plan. Try a clearer photo or review the readable dimensions manually." });
      }
    }),

  // Parse a CSV/TSV parts list and match codes to the catalog.
  // Accepts a raw CSV text string (max 200KB). No auth required — the catalog
  // lookup is public, and no user data is stored.
  parseCSV: protectedProcedure
    .input(
      z.object({
        // Raw CSV or TSV text content
        csvText: z.string().max(200_000),
        // Optional: caller can specify which column index to use for code/qty
        codeCol: z.number().int().min(0).optional(),
        qtyCol: z.number().int().min(0).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // 1. Parse the CSV text.
      const lines = input.csvText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length === 0) {
        return { matches: [], summary: { total: 0, matched: 0, unmatched: 0, units: 0 } };
      }

      // Detect separator: prefer comma, fall back to tab.
      const sep = lines[0].includes("\t") ? "\t" : ",";
      const rows = lines.map((l) => l.split(sep).map((c) => c.replace(/^"|"$/g, "").trim()));

      // 2. Detect header row and column indices.
      let codeColIdx = input.codeCol ?? -1;
      let qtyColIdx = input.qtyCol ?? -1;
      let dataStart = 0;

      const firstRow = rows[0].map((h) => h.toLowerCase());
      const hasHeader = firstRow.some((h) => CODE_HEADERS.includes(h) || QTY_HEADERS.includes(h));
      if (hasHeader) {
        dataStart = 1;
        if (codeColIdx < 0) {
          codeColIdx = firstRow.findIndex((h) => CODE_HEADERS.includes(h));
        }
        if (qtyColIdx < 0) {
          qtyColIdx = firstRow.findIndex((h) => QTY_HEADERS.includes(h));
        }
      }

      // Fallback: if no header detected, assume col 0 = code, col 1 = qty (if present).
      if (codeColIdx < 0) codeColIdx = 0;
      if (qtyColIdx < 0 && rows[0].length > 1) qtyColIdx = 1;

      // 3. Extract codes + quantities from data rows.
      const extracted: ExtractedCode[] = [];
      for (let i = dataStart; i < rows.length; i++) {
        const row = rows[i];
        const code = row[codeColIdx]?.trim();
        if (!code) continue;
        const rawQty = qtyColIdx >= 0 ? row[qtyColIdx]?.trim() : undefined;
        const qty = rawQty ? Number(rawQty) : 1;
        extracted.push({ code, quantity: Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 1 });
      }

      // 4. Match against the live master catalog.
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

      return { matches, summary };
    }),

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
          model: "gemini-3-flash-preview",
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
        extracted = Array.isArray(parsed.items)
          ? parsed.items
              .map((item) => ({
                code: String(item.code || "").trim(),
                quantity: Math.max(1, Math.floor(Number(item.quantity) || 1)),
              }))
              .filter((item) => item.code.length > 0)
          : [];
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
