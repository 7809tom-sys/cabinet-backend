import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { cabinets, doorStyles, cabinet3dPreviews } from "../../drizzle/schema";
import { generateImage } from "../_core/imageGeneration";
import { storagePut } from "../storage";

/**
 * Build a photorealistic prompt for a single cabinet in a specific door style/color.
 * The goal is a studio-quality product shot on a neutral background.
 */
function buildCabinet3dPrompt(cabinet: {
  masterCode: string | null;
  description: string | null;
  category: string | null;
  subCategory: string | null;
  width: string | null;
  height: string | null;
  depth: string | null;
  numberOfDoors: number | null;
  numberOfDrawers: number | null;
  cornerType: string | null;
}, style: {
  ourName: string;
  doorStyle: string | null;
  finish: string | null;
  color: string | null;
  woodSpecies: string | null;
}): string {
  const parts: string[] = [];

  // Cabinet identity
  const desc = cabinet.description || `${cabinet.category || "Base"} Cabinet`;
  parts.push(`A single photorealistic ${desc.toLowerCase()}`);

  // Dimensions
  const dims: string[] = [];
  if (cabinet.width) dims.push(`${cabinet.width}" wide`);
  if (cabinet.height) dims.push(`${cabinet.height}" tall`);
  if (cabinet.depth) dims.push(`${cabinet.depth}" deep`);
  if (dims.length) parts.push(`(${dims.join(", ")})`);

  // Door/drawer configuration
  const doorCount = cabinet.numberOfDoors ?? 0;
  const drawerCount = cabinet.numberOfDrawers ?? 0;
  if (doorCount > 0 || drawerCount > 0) {
    const config: string[] = [];
    if (doorCount > 0) config.push(`${doorCount} door${doorCount > 1 ? "s" : ""}`);
    if (drawerCount > 0) config.push(`${drawerCount} drawer${drawerCount > 1 ? "s" : ""}`);
    parts.push(`with ${config.join(" and ")}`);
  }

  // Corner type
  if (cabinet.cornerType && cabinet.cornerType !== "none") {
    parts.push(`(${cabinet.cornerType.replace(/-/g, " ")} corner style)`);
  }

  // Door style and finish
  parts.push(".");
  parts.push(`Door style: ${style.doorStyle || "Shaker"} profile.`);

  // Color/finish
  if (style.color) {
    parts.push(`Color: ${style.color}.`);
  } else if (style.finish) {
    parts.push(`Finish: ${style.finish}.`);
  }

  // Wood species if relevant
  if (style.woodSpecies && style.woodSpecies.toLowerCase() !== "n/a") {
    parts.push(`Wood: ${style.woodSpecies}.`);
  }

  // Photography direction
  parts.push(
    "Studio product photography, three-quarter angle view showing front and one side.",
    "Soft diffused studio lighting with subtle shadow underneath.",
    "Clean white/light gray gradient background.",
    "Photorealistic quality, high detail on wood grain, paint texture, and hardware.",
    "Cabinet shown with brushed nickel bar pulls on doors and drawers.",
    "No room context, no countertop, no wall — isolated product shot.",
    "Professional catalog photography style, sharp focus, 4K quality."
  );

  return parts.join(" ");
}

export const cabinet3dPreviewRouter = router({
  /**
   * Get a cached 3D preview for a cabinet+style combo, or null if not yet generated.
   */
  get: publicProcedure
    .input(z.object({
      cabinetId: z.number(),
      styleId: z.number(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const [existing] = await db
        .select({ imageUrl: cabinet3dPreviews.imageUrl })
        .from(cabinet3dPreviews)
        .where(
          and(
            eq(cabinet3dPreviews.cabinetId, input.cabinetId),
            eq(cabinet3dPreviews.styleId, input.styleId)
          )
        )
        .limit(1);
      return existing ?? null;
    }),

  /**
   * Generate (or return cached) a photorealistic 3D preview of a cabinet in a specific door style.
   */
  generate: publicProcedure
    .input(z.object({
      cabinetId: z.number(),
      styleId: z.number(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;

      // Check cache first
      const [cached] = await db
        .select({ imageUrl: cabinet3dPreviews.imageUrl })
        .from(cabinet3dPreviews)
        .where(
          and(
            eq(cabinet3dPreviews.cabinetId, input.cabinetId),
            eq(cabinet3dPreviews.styleId, input.styleId)
          )
        )
        .limit(1);

      if (cached) return { imageUrl: cached.imageUrl, fromCache: true };

      // Fetch cabinet and style data
      const [cab] = await db
        .select()
        .from(cabinets)
        .where(eq(cabinets.id, input.cabinetId))
        .limit(1);
      if (!cab) throw new TRPCError({ code: "NOT_FOUND", message: "Cabinet not found" });

      const [style] = await db
        .select()
        .from(doorStyles)
        .where(eq(doorStyles.id, input.styleId))
        .limit(1);
      if (!style) throw new TRPCError({ code: "NOT_FOUND", message: "Door style not found" });

      // Build prompt
      const prompt = buildCabinet3dPrompt(
        {
          masterCode: cab.masterCode,
          description: cab.description,
          category: cab.category,
          subCategory: cab.subCategory,
          width: cab.width,
          height: cab.height,
          depth: cab.depth,
          numberOfDoors: cab.numberOfDoors,
          numberOfDrawers: cab.numberOfDrawers,
          cornerType: cab.cornerType,
        },
        {
          ourName: style.ourName,
          doorStyle: style.doorStyle,
          finish: style.finish,
          color: style.color,
          woodSpecies: style.woodSpecies,
        }
      );

      // Generate image
      const result = await generateImage({ prompt });
      if (!result.url) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Image generation returned no URL" });
      }

      // Download and re-upload to our S3 for permanence
      const imgResp = await fetch(result.url);
      if (!imgResp.ok) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch generated image" });
      }
      const imgBuf = Buffer.from(await imgResp.arrayBuffer());
      const key = `cabinet-3d-previews/${cab.masterCode ?? cab.id}_style${style.id}_${Date.now()}.png`;
      const { url: s3Url } = await storagePut(key, imgBuf, "image/png");

      // Cache in DB
      await db.insert(cabinet3dPreviews).values({
        cabinetId: input.cabinetId,
        styleId: input.styleId,
        imageUrl: s3Url,
        prompt,
      });

      return { imageUrl: s3Url, fromCache: false };
    }),
});
