import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull, ne, gt, or, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { pelicanProducts } from "../../drizzle/pelicanSchema";
import { pelicanCategoryMarkups } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { storagePut } from "../storage";

// ─── Pricing helpers (mirror pelican router) ─────────────────────────────────
const DEFAULT_MARKUP_BPS: Record<string, number> = {
  Flooring: 6500,
  "Tile & Mosaic": 5500,
  "Sinks & Faucets": 3800,
  "Toilets & Bidets": 3500,
  "Shower & Bath": 2200,
  "Quartz Slabs (Countertops)": 1800,
};
type MarkupMap = Record<string, number>;
async function loadMarkupMap(db: NonNullable<Awaited<ReturnType<typeof getDb>>>): Promise<MarkupMap> {
  const rows = await db
    .select({ category: pelicanCategoryMarkups.category, markupBps: pelicanCategoryMarkups.markupBps })
    .from(pelicanCategoryMarkups);
  const map: MarkupMap = {};
  for (const r of rows) map[r.category] = r.markupBps;
  return map;
}
function markupBpsFor(map: MarkupMap, category: string): number {
  if (map[category] !== undefined) return map[category];
  return DEFAULT_MARKUP_BPS[category] ?? 0;
}
function computeSellPrice(
  product: { listPrice: string | null; yourCost: string | null; category: string },
  map: MarkupMap
): number | null {
  const costStr = product.yourCost ?? product.listPrice;
  if (costStr == null) return null;
  const cost = Number(costStr);
  if (!Number.isFinite(cost)) return null;
  const bps = markupBpsFor(map, product.category);
  return Math.round(cost * (1 + bps / 10000) * 100) / 100;
}

// ─── Fixture categories for matching ─────────────────────────────────────────
const FIXTURE_CATEGORIES = [
  "Sinks & Faucets",
  "Shower & Bath",
  "Toilets & Bidets",
] as const;

// JSON schema the vision model must return for fixture identification.
const fixtureIdentificationSchema = {
  name: "fixture_identification",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      fixtures: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            type: {
              type: "string",
              description: "The type of fixture: sink, faucet, bathtub, shower, toilet, bidet, shower_door, shower_valve, or other",
            },
            description: {
              type: "string",
              description: "Brief visual description: material, color, style, shape, mounting type",
            },
            brand: {
              type: "string",
              description: "Brand name if visible, otherwise empty string",
            },
            model: {
              type: "string",
              description: "Model number if visible, otherwise empty string",
            },
            quantity: {
              type: "integer",
              description: "Number of this fixture visible, default 1",
            },
          },
          required: ["type", "description", "brand", "model", "quantity"],
        },
      },
    },
    required: ["fixtures"],
  },
} as const;

// JSON schema for the matching step — given fixture descriptions and catalog items,
// pick the best matches.
const fixtureMatchSchema = {
  name: "fixture_match",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      matches: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            fixtureIndex: {
              type: "integer",
              description: "Index of the identified fixture (0-based)",
            },
            productId: {
              type: "integer",
              description: "The id of the best matching product from the catalog, or -1 if no good match",
            },
            confidence: {
              type: "string",
              enum: ["high", "medium", "low", "none"],
              description: "How confident the match is",
            },
            reason: {
              type: "string",
              description: "Brief explanation of why this product matches or why no match was found",
            },
          },
          required: ["fixtureIndex", "productId", "confidence", "reason"],
        },
      },
    },
    required: ["matches"],
  },
} as const;

const SYSTEM_PROMPT = `You are a plumbing fixture identification assistant. The user uploads a photo of a plumbing fixture (sink, faucet, bathtub, shower, toilet, bidet, shower door, shower valve, etc.).
Your job is to identify each distinct fixture in the image and describe it precisely.
Rules:
- Identify the TYPE of fixture (sink, faucet, bathtub, shower, toilet, bidet, shower_door, shower_valve, other).
- Describe the visual characteristics: material (stainless steel, porcelain, acrylic, brass, etc.), color/finish (chrome, brushed nickel, matte black, white, etc.), style (modern, traditional, farmhouse, etc.), shape (round, rectangular, oval, etc.), mounting type (undermount, drop-in, wall-mount, freestanding, etc.).
- If a brand name or model number is visible, include it.
- Count quantity if multiple of the same fixture are visible.
- If the image doesn't contain any plumbing fixtures, return an empty fixtures array.`;

const MATCH_SYSTEM_PROMPT = `You are a product matching assistant. Given a list of identified plumbing fixtures (with visual descriptions) and a catalog of available products (with names, codes, categories, and subcategories), pick the BEST matching product for each fixture.
Rules:
- Match based on fixture type, style, and characteristics.
- Prefer exact type matches (e.g., a sink should match a sink product, not a faucet).
- Consider subcategory alignment (e.g., "Sinks" for sinks, "Faucets" for faucets).
- If a brand/model is specified and matches a product code, that's a high-confidence match.
- If no good match exists, set productId to -1 and confidence to "none".
- Be conservative — only mark "high" confidence if the product clearly matches the fixture's type and general style.`;

const dataUrlInput = z
  .string()
  .min(16)
  .refine((s) => s.startsWith("data:image/"), "Must be a data:image/* URL");

export const fixturePhotoRouter = router({
  // Identify fixtures in a photo and match them to Pelican catalog products.
  identifyAndMatch: protectedProcedure
    .input(
      z.object({
        imageDataUrl: dataUrlInput,
        filename: z.string().max(200).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // 1. Persist a copy of the upload to S3 (best-effort).
      let storedUrl: string | null = null;
      try {
        const m = input.imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (m) {
          const [, mime, b64] = m;
          const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "png";
          const buf = Buffer.from(b64, "base64");
          if (buf.length <= 10 * 1024 * 1024) {
            const safeName = (input.filename || `fixture.${ext}`).replace(/[^a-zA-Z0-9._-]/g, "_");
            const { url } = await storagePut(`fixture-uploads/u${ctx.user.id}-${Date.now()}-${safeName}`, buf, mime);
            storedUrl = url;
          }
        }
      } catch {
        // non-fatal
      }

      // 2. Vision identification — identify fixtures in the photo.
      type IdentifiedFixture = {
        type: string;
        description: string;
        brand: string;
        model: string;
        quantity: number;
      };
      let fixtures: IdentifiedFixture[] = [];
      try {
        const result = await invokeLLM({
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                { type: "text", text: "Identify all plumbing fixtures in this image." },
                { type: "image_url", image_url: { url: input.imageDataUrl } },
              ],
            },
          ],
          responseFormat: { type: "json_schema", json_schema: fixtureIdentificationSchema },
          maxTokens: 2000,
        });

        const raw = result.choices?.[0]?.message?.content;
        const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((p: any) => (p.type === "text" ? p.text : "")).join("") : "";
        const parsed = JSON.parse(text || "{}") as { fixtures?: IdentifiedFixture[] };
        fixtures = Array.isArray(parsed.fixtures) ? parsed.fixtures : [];
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not analyze the image. Try a clearer, well-lit photo.",
        });
      }

      if (fixtures.length === 0) {
        return {
          storedUrl,
          fixtures: [],
          matches: [],
          summary: { identified: 0, matched: 0, unmatched: 0 },
        };
      }

      // 3. Load fixture catalog products (with images, active, priced).
      const markupMap = await loadMarkupMap(db);
      const catalogRows = await db
        .select({
          id: pelicanProducts.id,
          pelicanCode: pelicanProducts.pelicanCode,
          name: pelicanProducts.name,
          category: pelicanProducts.category,
          subCategory: pelicanProducts.subCategory,
          size: pelicanProducts.size,
          imageUrl: pelicanProducts.imageUrl,
          listPrice: pelicanProducts.listPrice,
          yourCost: pelicanProducts.yourCost,
        })
        .from(pelicanProducts)
        .where(
          and(
            inArray(pelicanProducts.category, [...FIXTURE_CATEGORIES]),
            eq(pelicanProducts.isActive, true),
            or(gt(pelicanProducts.yourCost, "0"), gt(pelicanProducts.listPrice, "0")),
            isNotNull(pelicanProducts.imageUrl),
            ne(pelicanProducts.imageUrl, ""),
          )
        );

      // Build a concise catalog summary for the LLM (id, code, name, category, subCategory).
      const catalogSummary = catalogRows.map((r) => ({
        id: r.id,
        code: r.pelicanCode,
        name: r.name,
        category: r.category,
        sub: r.subCategory || "",
        size: r.size || "",
      }));

      // 4. Ask LLM to match identified fixtures to catalog products.
      type MatchResult = {
        fixtureIndex: number;
        productId: number;
        confidence: "high" | "medium" | "low" | "none";
        reason: string;
      };
      let matchResults: MatchResult[] = [];
      try {
        const matchResult = await invokeLLM({
          messages: [
            { role: "system", content: MATCH_SYSTEM_PROMPT },
            {
              role: "user",
              content: `Here are the fixtures identified in the photo:\n${JSON.stringify(fixtures, null, 2)}\n\nHere is the available product catalog (${catalogSummary.length} items):\n${JSON.stringify(catalogSummary)}`,
            },
          ],
          responseFormat: { type: "json_schema", json_schema: fixtureMatchSchema },
          maxTokens: 2000,
        });

        const raw = matchResult.choices?.[0]?.message?.content;
        const text = typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((p: any) => (p.type === "text" ? p.text : "")).join("") : "";
        const parsed = JSON.parse(text || "{}") as { matches?: MatchResult[] };
        matchResults = Array.isArray(parsed.matches) ? parsed.matches : [];
      } catch {
        // If matching fails, return fixtures without matches
        matchResults = fixtures.map((_, i) => ({
          fixtureIndex: i,
          productId: -1,
          confidence: "none" as const,
          reason: "Matching service unavailable",
        }));
      }

      // 5. Enrich matches with product details and pricing.
      const matchedProductIds = matchResults
        .filter((m) => m.productId > 0)
        .map((m) => m.productId);

      const productMap = new Map<number, typeof catalogRows[0]>();
      for (const row of catalogRows) {
        if (matchedProductIds.includes(row.id)) {
          productMap.set(row.id, row);
        }
      }

      const enrichedMatches = matchResults.map((m) => {
        const fixture = fixtures[m.fixtureIndex];
        const product = m.productId > 0 ? productMap.get(m.productId) : null;
        return {
          fixture: fixture || null,
          matched: m.productId > 0 && m.confidence !== "none",
          confidence: m.confidence,
          reason: m.reason,
          product: product
            ? {
                id: product.id,
                pelicanCode: product.pelicanCode,
                name: product.name,
                category: product.category,
                subCategory: product.subCategory,
                size: product.size,
                imageUrl: product.imageUrl,
                sellPrice: computeSellPrice(
                  { listPrice: product.listPrice, yourCost: product.yourCost, category: product.category },
                  markupMap
                ),
              }
            : null,
        };
      });

      const matched = enrichedMatches.filter((m) => m.matched).length;
      const unmatched = enrichedMatches.filter((m) => !m.matched).length;

      return {
        storedUrl,
        fixtures,
        matches: enrichedMatches,
        summary: { identified: fixtures.length, matched, unmatched },
      };
    }),
});
