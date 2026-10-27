import {
  verifiedPelicanFaucetProfile,
  verifiedPelicanPotFillerProfile,
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

/** Source fields needed to audit a configured Designer row without changing it. */
export type PelicanDesignerAuditProduct = PelicanDesignerReadinessProduct & {
  id: number;
  isActive: boolean;
  showInDesigner: boolean;
  listPrice?: string | number | null;
  yourCost?: string | number | null;
  imageUrl?: string | null;
  size?: string | null;
  coverageSqFt?: string | number | null;
  unsupportedOverhangLimitIn?: string | number | null;
};

export type PelicanDesignerAuditRow = {
  id: number;
  pelicanCode: string | null;
  name: string | null;
  category: string;
  subCategory: string | null;
  role: ReturnType<typeof pelicanDesignerRole>;
  active: boolean;
  sourcePriced: boolean;
  catalogImage: boolean;
  sourceDimensions: boolean;
  sourceCoverage: boolean | null;
  structuralOverhangLimit: boolean | null;
  approvedRepresentation: boolean;
  paletteReady: boolean;
  evidenceComplete: boolean;
  blockers: string[];
};

export type PelicanDesignerAudit = {
  totals: {
    configured: number;
    paletteReady: number;
    evidenceComplete: number;
    unsupportedRole: number;
    missingSourcePrice: number;
    missingDimensions: number;
    missingCoverage: number;
    missingStructuralOverhangLimit: number;
  };
  roles: Array<{
    role: Exclude<ReturnType<typeof pelicanDesignerRole>, null> | "unsupported";
    configured: number;
    paletteReady: number;
    missingDimensions: number;
    missingCoverage: number;
  }>;
  blockers: Array<{ reason: string; count: number }>;
  rows: PelicanDesignerAuditRow[];
};

function positiveSourceNumber(value: string | number | null | undefined): boolean {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

function presentSourceText(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

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
  | "pot-filler"
  | null {
  // The current official Pelican catalog identifies PL-8410/PL-8461 as
  // dimensioned kitchen wall faucets. A legacy PL-8461 local category says
  // Shower & Bath, so use its exact verified profile—not imported category text.
  if (verifiedPelicanFaucetProfile(product.pelicanCode)?.installation === "wall-mounted-8-inch-center") return "faucet";
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
    return role === "sink" || role === "faucet" || role === "pot-filler" ? role : null;
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
  if (role === "pot-filler") return Boolean(verifiedPelicanPotFillerProfile(product.pelicanCode));
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
  // The product geometry is verified, but the current Designer has no mounted
  // range-wall association or project-specific mount-datum workflow yet.
  if (role === "pot-filler") return false;
  return false;
}

/**
 * Whether a source-priced, Designer-enabled product may be selected and quoted
 * in the Designer's material palette. Countertops and flooring planks do not
 * need an image swatch to be commercially selectable: the Planner uses an
 * explicitly labeled neutral preview until an approved repeatable swatch is
 * saved. Moldings, trim, and underlayment are not planks, so they stay out.
 * The stricter `isPelicanDesignerReady` remains the requirement for an exact
 * material rendering, so a catalog photo is never promoted into a 3D texture.
 */
export function isPelicanDesignerSelectable(product: PelicanDesignerReadinessProduct): boolean {
  const role = pelicanDesignerRole(product);
  if (role === "countertop" || role === "flooring") return true;
  return isPelicanDesignerReady(product);
}

/**
 * Exact-3D signals returned with Designer surface payloads.
 * `designerRenderReady` follows `isPelicanDesignerReady`. For flooring planks
 * that is the same value as `hasSwatch`: a non-empty `materialImageUrl`.
 * When either flag is false, the 3D view should draw a labeled neutral floor.
 * `imageUrl` is the catalog card photo and is never a floor texture.
 */
export function pelicanDesignerRenderFlags(product: PelicanDesignerReadinessProduct): {
  designerRenderReady: boolean;
  hasSwatch: boolean;
} {
  return {
    designerRenderReady: isPelicanDesignerReady(product),
    hasSwatch: hasApprovedPelicanMaterialSwatch(product),
  };
}

export function pelicanDesignerReadinessReason(product: PelicanDesignerReadinessProduct): string | null {
  const role = pelicanDesignerRole(product);
  if (!role) return "No exact supported Designer role";
  if (role === "flooring" || role === "backsplash" || role === "countertop") {
    return hasApprovedPelicanMaterialSwatch(product) ? null : "Approved repeatable material swatch required";
  }
  if (role === "pot-filler") return "Range-associated wall-mount workflow and project mounting datum required";
  return hasVerifiedPelicanFixtureProfile(product) ? null : "Measured technical fixture profile required";
}

/**
 * Produces an evidence-only audit of configured Designer rows. It never repairs
 * source catalog records or infers missing measurements: a row becomes palette
 * ready only through the existing verified-role contract.
 */
export function auditPelicanDesignerReadiness(products: readonly PelicanDesignerAuditProduct[]): PelicanDesignerAudit {
  const rows = products
    .filter((product) => product.showInDesigner)
    .map((product): PelicanDesignerAuditRow => {
      const role = pelicanDesignerRole(product);
      const sourcePriced = positiveSourceNumber(product.yourCost) || positiveSourceNumber(product.listPrice);
      const catalogImage = presentSourceText(product.imageUrl);
      const verifiedFixtureProfile = role === "sink" || role === "faucet" || role === "pot-filler"
        ? hasVerifiedPelicanFixtureProfile(product)
        : false;
      const sourceDimensions = role === "sink" || role === "faucet" || role === "pot-filler"
        ? verifiedFixtureProfile
        : presentSourceText(product.size);
      const sourceCoverage = role === "flooring" || role === "backsplash"
        ? positiveSourceNumber(product.coverageSqFt)
        : null;
      const structuralOverhangLimit = role === "countertop"
        ? positiveSourceNumber(product.unsupportedOverhangLimitIn)
        : null;
      const approvedRepresentation = role === "flooring" || role === "backsplash" || role === "countertop"
        ? hasApprovedPelicanMaterialSwatch(product)
        : role === "sink" || role === "faucet"
          ? verifiedFixtureProfile
          : false;
      const blockers: string[] = [];
      if (!product.isActive) blockers.push("Inactive product");
      if (!role) blockers.push("No exact supported Designer role");
      if (!sourcePriced) blockers.push("Positive authorized source price required");
      if (!catalogImage) blockers.push("Catalog selection image required");
      if ((role === "flooring" || role === "backsplash" || role === "countertop") && !sourceDimensions) {
        blockers.push("Source dimensions required");
      }
      if (sourceCoverage === false) blockers.push("Source coverage per box required");
      if (structuralOverhangLimit === false) blockers.push("Supplier/fabricator overhang limit required");
      const representationReason = pelicanDesignerReadinessReason(product);
      if (representationReason && !blockers.includes(representationReason)) blockers.push(representationReason);
      const paletteReady = Boolean(product.isActive && sourcePriced && catalogImage && isPelicanDesignerReady(product));
      return {
        id: product.id,
        pelicanCode: product.pelicanCode ?? null,
        name: product.name ?? null,
        category: product.category,
        subCategory: product.subCategory ?? null,
        role,
        active: product.isActive,
        sourcePriced,
        catalogImage,
        sourceDimensions,
        sourceCoverage,
        structuralOverhangLimit,
        approvedRepresentation,
        // The live palette intentionally remains conservative. Evidence gaps are
        // reported for admin action, but are not silently bypassed or invented.
        paletteReady,
        evidenceComplete: paletteReady && blockers.length === 0,
        blockers,
      };
    });
  const blockerCounts = new Map<string, number>();
  for (const row of rows) {
    for (const blocker of row.blockers) blockerCounts.set(blocker, (blockerCounts.get(blocker) ?? 0) + 1);
  }
  const roles = new Map<string, { configured: number; paletteReady: number; missingDimensions: number; missingCoverage: number }>();
  for (const row of rows) {
    const role = row.role ?? "unsupported";
    const value = roles.get(role) ?? { configured: 0, paletteReady: 0, missingDimensions: 0, missingCoverage: 0 };
    value.configured += 1;
    if (row.paletteReady) value.paletteReady += 1;
    if (!row.sourceDimensions) value.missingDimensions += 1;
    if (row.sourceCoverage === false) value.missingCoverage += 1;
    roles.set(role, value);
  }
  return {
    totals: {
      configured: rows.length,
      paletteReady: rows.filter((row) => row.paletteReady).length,
      evidenceComplete: rows.filter((row) => row.evidenceComplete).length,
      unsupportedRole: rows.filter((row) => row.role === null).length,
      missingSourcePrice: rows.filter((row) => !row.sourcePriced).length,
      missingDimensions: rows.filter((row) => !row.sourceDimensions).length,
      missingCoverage: rows.filter((row) => row.sourceCoverage === false).length,
      missingStructuralOverhangLimit: rows.filter((row) => row.structuralOverhangLimit === false).length,
    },
    roles: Array.from(roles, ([role, value]) => ({ role: role as PelicanDesignerAudit["roles"][number]["role"], ...value }))
      .sort((left, right) => left.role.localeCompare(right.role)),
    blockers: Array.from(blockerCounts, ([reason, count]) => ({ reason, count }))
      .sort((left, right) => right.count - left.count || left.reason.localeCompare(right.reason)),
    rows,
  };
}
