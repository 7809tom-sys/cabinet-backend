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
  installation: "apron-front-undermount" | "undermount";
  sinkType: "farmhouse" | "single";
  apronFront: boolean;
  exteriorWidthIn: number;
  exteriorDepthIn: number;
  exteriorHeightIn: number;
  bowlWidthIn: number;
  bowlDepthIn: number;
  bowlHeightIn: number;
  minimumCabinetWidthIn: number;
  specificationUrl: string;
};

export type VerifiedPelicanFaucetProfile = {
  id: string;
  pelicanCode: string;
  name: string;
  installation: "single-hole";
  overallHeightIn: number;
  spoutLengthIn: number;
  spoutHeightIn: number;
  profile: "pull-down";
  finish: "brushed-nickel";
  specificationUrl: string;
};

const VERIFIED_PELICAN_SINKS: Record<string, VerifiedPelicanSinkProfile> = {
  "PL-FC2418SB": {
    id: "pelican-pl-fc2418sb-fireclay-farmhouse",
    pelicanCode: "PL-FC2418SB",
    name: "PL-FC2418SB Fireclay Farmhouse Sink",
    installation: "apron-front-undermount",
    sinkType: "farmhouse",
    apronFront: true,
    exteriorWidthIn: 24,
    exteriorDepthIn: 18,
    exteriorHeightIn: 10,
    bowlWidthIn: 22.5,
    bowlDepthIn: 16.625,
    bowlHeightIn: 9,
    minimumCabinetWidthIn: 24,
    specificationUrl: "https://cdn.accentuate.io/7876648042636/1729870572366/PL-FC2418SB.pdf?v=1729870572366",
  },
  "PL-FC3018SB": {
    id: "pelican-pl-fc3018sb-fireclay-farmhouse",
    pelicanCode: "PL-FC3018SB",
    name: "PL-FC3018SB Fireclay Farmhouse Sink",
    installation: "apron-front-undermount",
    sinkType: "farmhouse",
    apronFront: true,
    exteriorWidthIn: 30,
    exteriorDepthIn: 18,
    exteriorHeightIn: 10,
    bowlWidthIn: 28.625,
    bowlDepthIn: 16.625,
    bowlHeightIn: 9.25,
    minimumCabinetWidthIn: 30,
    specificationUrl: "https://cdn.accentuate.io/9682969362572/1786578710369/PL-FC3018SB-Spec.pdf?v=1786578710369",
  },
  "PL-FC3318SB": {
    id: "pelican-pl-fc3318sb-fireclay-farmhouse",
    pelicanCode: "PL-FC3318SB",
    name: "PL-FC3318SB Fireclay Farmhouse Sink",
    installation: "apron-front-undermount",
    sinkType: "farmhouse",
    apronFront: true,
    exteriorWidthIn: 32.625,
    exteriorDepthIn: 18,
    exteriorHeightIn: 10,
    bowlWidthIn: 31.375,
    bowlDepthIn: 16.625,
    bowlHeightIn: 9.25,
    minimumCabinetWidthIn: 33,
    specificationUrl: "https://cdn.accentuate.io/8980578500748/1775068978130/PL-FC3318SB.pdf?v=1776100416378",
  },
  "PL-FC3321SB": {
    id: "pelican-pl-fc3321sb-fireclay-farmhouse",
    pelicanCode: "PL-FC3321SB",
    name: "PL-FC3321SB Fireclay Farmhouse Sink",
    installation: "apron-front-undermount",
    sinkType: "farmhouse",
    apronFront: true,
    exteriorWidthIn: 33,
    exteriorDepthIn: 20.875,
    exteriorHeightIn: 10,
    bowlWidthIn: 31.625,
    bowlDepthIn: 19.75,
    bowlHeightIn: 10,
    minimumCabinetWidthIn: 33,
    specificationUrl: "https://cdn.accentuate.io/8980578599052/1775068792025/PL-FC3321SB.pdf?v=1776100377350",
  },
  "PL-HA109": {
    id: "pelican-pl-ha109-stainless-undermount",
    pelicanCode: "PL-HA109",
    name: "PL-HA109 Stainless Steel Undermount Sink",
    installation: "undermount",
    sinkType: "single",
    apronFront: false,
    exteriorWidthIn: 30,
    exteriorDepthIn: 18,
    exteriorHeightIn: 10,
    bowlWidthIn: 28,
    bowlDepthIn: 16,
    bowlHeightIn: 10,
    minimumCabinetWidthIn: 30,
    specificationUrl: "https://cdn.accentuate.io/7876665442444/1729872829476/PL-HA109-R0.pdf?v=1729872829477",
  },
  "PL-HA109 ADA": {
    id: "pelican-pl-ha109-ada-stainless-undermount",
    pelicanCode: "PL-HA109 ADA",
    name: "PL-HA109 ADA Stainless Steel Undermount Sink",
    installation: "undermount",
    sinkType: "single",
    apronFront: false,
    exteriorWidthIn: 30,
    exteriorDepthIn: 18,
    exteriorHeightIn: 5.5,
    bowlWidthIn: 28,
    bowlDepthIn: 16,
    bowlHeightIn: 5.5,
    minimumCabinetWidthIn: 30,
    specificationUrl: "https://cdn.accentuate.io/7876665442444/1742318026789/PL-HA109-ADA-R0-18g-Spec.pdf?v=1742318026789",
  },
};

const VERIFIED_PELICAN_FAUCETS: Record<string, VerifiedPelicanFaucetProfile> = {
  "PL-8203": {
    id: "pelican-pl-8203-fountain-pull-down",
    pelicanCode: "PL-8203",
    name: "PL-8203 Fountain Series Pull-Down Kitchen Faucet",
    installation: "single-hole",
    overallHeightIn: 27.1875,
    spoutLengthIn: 9.875,
    spoutHeightIn: 4.9375,
    profile: "pull-down",
    finish: "brushed-nickel",
    specificationUrl: "https://cdn.accentuate.io/7876662329484/1729881091715/PL-8203-Spec-Sheet.pdf?v=1734119171551",
  },
};

function normalizedPelicanCode(value: string | null | undefined): string {
  const normalized = (value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+\(OLD\)$/, "")
    .replace(/\s+(?:BLACK|GREY|WHITE)$/, "");
  if (/^PL-HA109\s+ADA\s+R(?:0|15)\s+18G$/.test(normalized)) return "PL-HA109 ADA";
  if (/^PL-HA109\s+R(?:0|15)\s+(?:16|18)G$/.test(normalized)) return "PL-HA109";
  return normalized;
}

export function verifiedPelicanSinkProfile(code: string | null | undefined): VerifiedPelicanSinkProfile | null {
  return VERIFIED_PELICAN_SINKS[normalizedPelicanCode(code)] ?? null;
}

export function verifiedPelicanFaucetProfile(code: string | null | undefined): VerifiedPelicanFaucetProfile | null {
  const normalized = (code ?? "").trim().toUpperCase();
  if (/^PL-8203(?:\s+BN)?$/.test(normalized)) return VERIFIED_PELICAN_FAUCETS["PL-8203"];
  return null;
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
