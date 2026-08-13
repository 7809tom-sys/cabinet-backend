import { isCustomCabinetProfile } from "./customCabinetProfiles";

export type CustomCabinetRenderMode = "standard" | "generic-image" | "vector-profile";

/**
 * Resolves the source of a non-standard cabinet elevation face. A configured
 * generic drawing always wins over the vector fallback for the selected rule.
 */
export function resolveCustomCabinetRender(
  profile: string | null | undefined,
  genericDrawingUrl: string | null | undefined,
  isAppliance: boolean,
): CustomCabinetRenderMode {
  if (isAppliance || !isCustomCabinetProfile(profile)) return "standard";
  return genericDrawingUrl ? "generic-image" : "vector-profile";
}
