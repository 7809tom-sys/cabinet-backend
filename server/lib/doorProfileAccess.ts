import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { DOOR_DRAWER_FRONT_IDS, DOOR_PANEL_CONSTRUCTION_IDS } from "../../shared/doorProfiles";
import { canEditDoorStyle } from "../../shared/doorProfileRules";

/**
 * Door profile fields shared by the admin Featured Door Styles editor and the
 * Vendor Portal. Both write through buildDoorProfilePatch so they accept the
 * same fields with the same validation.
 */
export const doorProfileFieldsShape = {
  railWidth: z.number().min(0).max(99).nullable().optional(),
  stileWidth: z.number().min(0).max(99).nullable().optional(),
  centerRailWidth: z.number().min(0).max(99).nullable().optional(),
  panelConstruction: z.enum(DOOR_PANEL_CONSTRUCTION_IDS).nullable().optional(),
  bevelWidth: z.number().min(0).max(12).nullable().optional(),
  bevelDepth: z.number().min(0).max(4).nullable().optional(),
  /** Stored as a fixed id. Legacy free text is mapped to the nearest id (or null = unset). */
  insideEdgeProfile: z.string().max(64).nullable().optional(),
  drawerFrontType: z.enum(DOOR_DRAWER_FRONT_IDS).nullable().optional(),
  grainDirection: z.enum(["vertical-stiles-horizontal-rails", "vertical", "horizontal", "none"]).nullable().optional(),
  finishSheen: z.enum(["satin", "matte", "gloss"]).nullable().optional(),
  profileNotes: z.string().max(256).nullable().optional(),
  sourceSpecification: z.string().max(512).nullable().optional(),
};
export const doorProfileFieldsSchema = z.object(doorProfileFieldsShape);
export type DoorProfileFields = z.infer<typeof doorProfileFieldsSchema>;

export { buildDoorProfilePatch } from "../../shared/doorProfileRules";

export function assertCanEditDoorStyle<T extends { distributorId: number | null }>(
  actor: { isAdmin: boolean; distributorIds: readonly number[] },
  style: T | null | undefined,
): asserts style is T {
  const verdict = canEditDoorStyle(actor, style);
  if (verdict === "not_found") throw new TRPCError({ code: "NOT_FOUND", message: "Door style not found." });
  if (verdict === "forbidden") throw new TRPCError({ code: "FORBIDDEN", message: "That Door Style does not belong to your cabinet line." });
}
