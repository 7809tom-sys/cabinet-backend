/**
 * Source-verified, measured fixture profiles used by the kitchen Designer.
 *
 * These are deliberately small and additive. A product is listed only after a
 * Pelican technical source provides the dimensions required to place it safely.
 * The profile creates measured parametric geometry; it never treats a catalog
 * photo, product thumbnail, or room image as a 3D model or material texture.
 */

export type VerifiedPelicanSinkProfile = {
  id: string;
  pelicanCode: string;
  name: string;
  installation: "apron-front-undermount";
  sinkType: "farmhouse";
  exteriorWidthIn: number;
  exteriorDepthIn: number;
  exteriorHeightIn: number;
  bowlWidthIn: number;
  bowlDepthIn: number;
  bowlHeightIn: number;
  minimumCabinetWidthIn: number;
  specificationUrl: string;
};

const VERIFIED_PELICAN_SINKS: Record<string, VerifiedPelicanSinkProfile> = {
  "PL-FC2418SB": {
    id: "pelican-pl-fc2418sb-fireclay-farmhouse",
    pelicanCode: "PL-FC2418SB",
    name: "PL-FC2418SB Fireclay Farmhouse Sink",
    installation: "apron-front-undermount",
    sinkType: "farmhouse",
    exteriorWidthIn: 24,
    exteriorDepthIn: 18,
    exteriorHeightIn: 10,
    bowlWidthIn: 22.5,
    bowlDepthIn: 16.625,
    bowlHeightIn: 9,
    minimumCabinetWidthIn: 24,
    specificationUrl: "https://cdn.accentuate.io/7876648042636/1729870572366/PL-FC2418SB.pdf?v=1729870572366",
  },
};

function normalizedPelicanCode(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export function verifiedPelicanSinkProfile(code: string | null | undefined): VerifiedPelicanSinkProfile | null {
  return VERIFIED_PELICAN_SINKS[normalizedPelicanCode(code)] ?? null;
}

export function verifiedPelicanSinkFitsCabinet(profile: VerifiedPelicanSinkProfile, cabinetWidthIn: number): boolean {
  return Number.isFinite(cabinetWidthIn) && cabinetWidthIn >= profile.minimumCabinetWidthIn;
}

export type PelicanSinkCandidate = {
  pelicanCode?: string | null;
  name?: string | null;
  description?: string | null;
};

export type PelicanSinkBaseKind = "farmhouse" | "standard";

/**
 * A farmhouse/apron-front base must never offer ordinary drop-in or undermount
 * sinks, and an SB36-style standard base must never offer a farmhouse apron.
 * Verified profiles take precedence; the imported product text is the fallback
 * for catalog items that have not yet received a measured 3D profile.
 */
export function pelicanSinkBaseKind(candidate: PelicanSinkCandidate): PelicanSinkBaseKind {
  if (verifiedPelicanSinkProfile(candidate.pelicanCode)?.sinkType === "farmhouse") return "farmhouse";
  const details = `${candidate.name ?? ""} ${candidate.description ?? ""}`.toLowerCase();
  return /\bfarm(?:house)?\b|\bapron[-\s]?front\b/.test(details) ? "farmhouse" : "standard";
}

export function isPelicanSinkCompatibleWithBase(
  candidate: PelicanSinkCandidate,
  baseKind: PelicanSinkBaseKind,
): boolean {
  return pelicanSinkBaseKind(candidate) === baseKind;
}
