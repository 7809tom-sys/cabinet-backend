import { normalizeInsideEdgeProfile } from "./doorProfiles";

/** Pure door profile rules (no zod / tRPC), shared by the routers and tests. */
export type DoorProfileFieldInput = {
  railWidth?: number | null; stileWidth?: number | null; centerRailWidth?: number | null;
  panelConstruction?: string | null; bevelWidth?: number | null; bevelDepth?: number | null;
  insideEdgeProfile?: string | null; drawerFrontType?: string | null; grainDirection?: string | null;
  finishSheen?: string | null; profileNotes?: string | null; sourceSpecification?: string | null;
};

export function buildDoorProfilePatch(fields: DoorProfileFieldInput): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (fields.railWidth !== undefined) patch.railWidth = fields.railWidth ?? null;
  if (fields.stileWidth !== undefined) patch.stileWidth = fields.stileWidth ?? null;
  if (fields.centerRailWidth !== undefined) patch.centerRailWidth = fields.centerRailWidth ?? null;
  if (fields.panelConstruction !== undefined) patch.panelConstruction = fields.panelConstruction;
  if (fields.bevelWidth !== undefined) patch.bevelWidth = fields.bevelWidth ?? null;
  if (fields.bevelDepth !== undefined) patch.bevelDepth = fields.bevelDepth ?? null;
  if (fields.insideEdgeProfile !== undefined) patch.insideEdgeProfile = normalizeInsideEdgeProfile(fields.insideEdgeProfile);
  if (fields.drawerFrontType !== undefined) patch.drawerFrontType = fields.drawerFrontType;
  if (fields.grainDirection !== undefined) patch.grainDirection = fields.grainDirection;
  if (fields.finishSheen !== undefined) patch.finishSheen = fields.finishSheen;
  if (fields.profileNotes !== undefined) patch.profileNotes = fields.profileNotes?.trim() || null;
  if (fields.sourceSpecification !== undefined) patch.sourceSpecification = fields.sourceSpecification?.trim() || null;
  return patch;
}


/**
 * Admins can edit every door style. A distributor can edit only styles tied to
 * its own distributor id (or a linked supplier line it manages).
 */
export function canEditDoorStyle(
  actor: { isAdmin: boolean; distributorIds: readonly number[] },
  style: { distributorId: number | null } | null | undefined,
): "ok" | "not_found" | "forbidden" {
  if (!style) return "not_found";
  if (actor.isAdmin) return "ok";
  return style.distributorId != null && actor.distributorIds.includes(style.distributorId) ? "ok" : "forbidden";
}
