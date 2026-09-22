import {
  verifiedPelicanFaucetProfile,
  verifiedPelicanSinkProfile,
} from "../../client/src/lib/pelicanFixtureProfiles";
import { pelicanFixtureRole } from "./pelicanFixtureRole";

export type PelicanDesignerReadinessProduct = {
  category: string;
  subCategory?: string | null;
  pelicanCode?: string | null;
  name?: string | null;
  description?: string | null;
  materialImageUrl?: string | null;
};

/**
 * The only product families with an exact, supported current Designer role.
 * This is intentionally stricter than storefront visibility: a source-priced
 * product may remain catalog-purchasable without being an exact 3D material or
 * fixture.
 */
export function pelicanDesignerRole(product: PelicanDesignerReadinessProduct):
  | "flooring"
  | "backsplash"
  | "countertop"
  | "sink"
  | "faucet"
  | null {
  if (product.category === "Flooring" && product.subCategory === "Planks & Flooring") return "flooring";
  if (product.category === "Tile & Mosaic") return "backsplash";
  if (product.category === "Quartz Slabs (Countertops)") return "countertop";
  if (product.category === "Sinks & Faucets") {
    const role = pelicanFixtureRole({
      ...product,
      subCategory: product.subCategory ?? null,
      name: product.name ?? null,
      description: product.description ?? null,
    });
    return role === "sink" || role === "faucet" ? role : null;
  }
  return null;
}

/** A retail or staged-room image is not an approved, repeatable 3D material. */
export function hasApprovedPelicanMaterialSwatch(product: PelicanDesignerReadinessProduct): boolean {
  return Boolean(product.materialImageUrl?.trim());
}

/** Fixtures require their code to resolve to an exact source-measured profile. */
export function hasVerifiedPelicanFixtureProfile(product: PelicanDesignerReadinessProduct): boolean {
  const role = pelicanDesignerRole(product);
  if (role === "sink") return Boolean(verifiedPelicanSinkProfile(product.pelicanCode));
  if (role === "faucet") return Boolean(verifiedPelicanFaucetProfile(product.pelicanCode));
  return false;
}

/**
 * Returns true only when the current Designer can represent the product without
 * inventing a fixture shape, placement datum, or material texture.
 */
export function isPelicanDesignerReady(product: PelicanDesignerReadinessProduct): boolean {
  const role = pelicanDesignerRole(product);
  if (role === "flooring" || role === "backsplash" || role === "countertop") {
    return hasApprovedPelicanMaterialSwatch(product);
  }
  if (role === "sink" || role === "faucet") {
    return hasVerifiedPelicanFixtureProfile(product);
  }
  return false;
}

export function pelicanDesignerReadinessReason(product: PelicanDesignerReadinessProduct): string | null {
  const role = pelicanDesignerRole(product);
  if (!role) return "No exact supported Designer role";
  if (role === "flooring" || role === "backsplash" || role === "countertop") {
    return hasApprovedPelicanMaterialSwatch(product) ? null : "Approved repeatable material swatch required";
  }
  return hasVerifiedPelicanFixtureProfile(product) ? null : "Measured technical fixture profile required";
}
