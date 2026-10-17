import { z } from "zod";

/**
 * Per-distributor cabinet configuration rule.
 *
 * Cabinet Config "Save" offers a choice: apply the rule to the master cabinet
 * (every distributor) or ONLY to the distributors the admin ticks. The
 * per-distributor rule is stored as JSON in
 * `distributor_cabinet_overrides.configJson` and merged over the master row
 * at read time (Designer palette / catalog) whenever the distributor is known.
 *
 * Only the keys present in the JSON override the master; anything omitted
 * keeps the master value. `null` explicitly clears a master value for that
 * distributor.
 */
export const distributorCabinetConfigSchema = z
  .object({
    description: z.string().min(1).nullable(),
    category: z.string().min(1).nullable(),
    subCategory: z.string().nullable(),
    width: z.string().nullable(),
    height: z.string().nullable(),
    depth: z.string().nullable(),
    physicalWidth: z.string().nullable(),
    weight: z.string().nullable(),
    pkgLength: z.string().nullable(),
    pkgWidth: z.string().nullable(),
    pkgHeight: z.string().nullable(),
    pkgWeight: z.string().nullable(),
    numberOfDoors: z.number().int().min(0).max(4).nullable(),
    numberOfDrawers: z.number().int().min(0).max(8).nullable(),
    numberOfFixedShelves: z.number().int().min(0).max(8).nullable(),
    numberOfAdjShelves: z.number().int().min(0).max(8).nullable(),
    minPull: z.number().min(3).max(6).nullable(),
    maxPull: z.number().min(3).max(6).nullable(),
    openingWidth: z.number().positive().nullable(),
    openingHeight: z.number().positive().nullable(),
    openingType: z.enum(["top", "middle", "bottom"]).nullable(),
    /** Source-specific appliance configuration for an oven tower. */
    ovenType: z.enum(["single", "double"]).nullable(),
    /** Verified source layout permits its exterior drawer rows to replace a generic oven fallback. */
    sourceOvenDrawerLayout: z.boolean().nullable(),
    doorHeight: z.number().positive().nullable(),
    drawerHeight: z.number().positive().nullable(),
    cornerType: z.enum(["lazy-susan", "blind-corner", "diagonal", "pie-cut", "l-shape", "triangle"]).nullable(),
    shelfRadius: z.number().positive().nullable(),
    shelfCount: z.number().int().positive().nullable(),
    cabinetSquare: z.number().positive().nullable(),
    faceWidth: z.number().positive().nullable(),
    legWidth: z.number().positive().nullable(),
    doorOrientation: z.enum(["side-by-side", "stacked"]).nullable(),
    doorsPerRow: z.number().int().min(1).max(4).nullable(),
    drawerLayout: z.string().nullable(),
    grainDirection: z.enum(["vertical", "horizontal"]).nullable(),
    isDecorativeDoor: z.boolean().nullable(),
    layoutSpec: z.string().nullable(),
    specImageUrl: z.string().nullable(),
    graphicType: z.string().max(64).nullable(),
    specNotes: z.string().nullable(),
    facePattern: z.enum(["slats", "criss-cross", "lattice", "open"]).nullable(),
    glassDoorAddonCode: z.string().nullable(),
    isCornerCabinet: z.boolean().nullable(),
  })
  .partial();

export type DistributorCabinetConfig = z.infer<typeof distributorCabinetConfigSchema>;

export const DISTRIBUTOR_CONFIG_KEYS = Object.keys(
  distributorCabinetConfigSchema.shape,
) as Array<keyof DistributorCabinetConfig>;

/** Dimension keys that also live in real columns of distributor_cabinet_overrides. */
export const DISTRIBUTOR_OVERRIDE_DIM_KEYS = [
  "width",
  "height",
  "depth",
  "physicalWidth",
  "weight",
  "pkgLength",
  "pkgWidth",
  "pkgHeight",
  "pkgWeight",
] as const;

/** Parse a stored configJson string. Invalid or empty JSON yields an empty rule. */
export function parseDistributorCabinetConfig(raw: string | null | undefined): DistributorCabinetConfig {
  if (!raw) return {};
  try {
    const parsed = distributorCabinetConfigSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/**
 * Merge a distributor's configuration rule over the master cabinet row.
 * Keys absent from the rule keep the master value; present keys (including
 * explicit null) replace it. Returns the same object when nothing applies.
 */
export function applyDistributorCabinetConfig<T extends Record<string, unknown>>(
  master: T,
  config: DistributorCabinetConfig | null | undefined,
): T {
  if (!config) return master;
  let changed = false;
  const next: Record<string, unknown> = { ...master };
  for (const key of Object.keys(config) as Array<keyof DistributorCabinetConfig>) {
    if (!(key in master)) continue;
    const value = config[key];
    if (value === undefined) continue;
    if (next[key] !== value) {
      next[key] = value;
      changed = true;
    }
  }
  return changed ? (next as T) : master;
}
