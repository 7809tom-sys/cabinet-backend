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
  /** Number of source-verified interior bowls; omitted profiles are single-bowl. */
  bowlCount?: 1 | 2;
  /** Individually measured bowl widths for asymmetric two-bowl sink profiles. */
  bowlWidthsIn?: readonly [number, number];
  /** Individually measured bowl depths for asymmetric two-bowl sink profiles. */
  bowlDepthsIn?: readonly [number, number];
  /** Source-documented inset from the bowl's right edge to its drain center. */
  drainInsetRightIn?: number;
  /** Source-documented inset from the bowl's rear edge to its drain center. */
  drainInsetBackIn?: number;
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
  profile: "pull-down" | "standard-arc" | "pull-out" | "articulated-swing";
  finish: "brushed-nickel" | "matte-black" | "brushed-gold" | "chrome" | "oil-rubbed-bronze";
  specificationUrl: string;
};

const VERIFIED_PELICAN_SINKS: Record<string, VerifiedPelicanSinkProfile> = {
  "PL-FC3318SB": {
    id: "pelican-pl-fc3318sb-fireclay-farmhouse", pelicanCode: "PL-FC3318SB", name: "PL-FC3318SB Fireclay Farmhouse Sink",
    installation: "apron-front-undermount", sinkType: "farmhouse", apronFront: true,
    exteriorWidthIn: 32.625, exteriorDepthIn: 18, exteriorHeightIn: 10, bowlWidthIn: 31.375, bowlDepthIn: 16.625, bowlHeightIn: 9.25, minimumCabinetWidthIn: 33,
    specificationUrl: "https://cdn.accentuate.io/8980578500748/1775068978130/PL-FC3318SB.pdf?v=1776100416378",
  },
  "PL-FC3620SB": {
    id: "pelican-pl-fc3620sb-fireclay-farmhouse", pelicanCode: "PL-FC3620SB", name: "PL-FC3620SB Fireclay Farmhouse Sink",
    installation: "apron-front-undermount", sinkType: "farmhouse", apronFront: true,
    exteriorWidthIn: 36, exteriorDepthIn: 20, exteriorHeightIn: 10, bowlWidthIn: 34.5625, bowlDepthIn: 18.5625, bowlHeightIn: 9, minimumCabinetWidthIn: 36,
    specificationUrl: "https://cdn.accentuate.io/7876649746572/1729870771898/PL-FC3620SB.pdf?v=1729870771898",
  },
  "PL-HA109": {
    id: "pelican-pl-ha109-stainless-undermount", pelicanCode: "PL-HA109", name: "PL-HA109 Stainless Steel Undermount Sink",
    installation: "undermount", sinkType: "single", apronFront: false,
    exteriorWidthIn: 30, exteriorDepthIn: 18, exteriorHeightIn: 10, bowlWidthIn: 28, bowlDepthIn: 16, bowlHeightIn: 10, drainInsetBackIn: 1, minimumCabinetWidthIn: 30,
    specificationUrl: "https://cdn.accentuate.io/7876665442444/1729872829476/PL-HA109-R0.pdf?v=1729872829477",
  },
  "PL-HA109 ADA": {
    id: "pelican-pl-ha109-ada-stainless-undermount", pelicanCode: "PL-HA109 ADA", name: "PL-HA109 ADA Stainless Steel Undermount Sink",
    installation: "undermount", sinkType: "single", apronFront: false,
    exteriorWidthIn: 30, exteriorDepthIn: 18, exteriorHeightIn: 5.5, bowlWidthIn: 28, bowlDepthIn: 16, bowlHeightIn: 5.5, minimumCabinetWidthIn: 30,
    specificationUrl: "https://cdn.accentuate.io/7876665442444/1742318026789/PL-HA109-ADA-R0-18g-Spec.pdf?v=1742318026789",
  },
  "PL-HA115": {
    id: "pelican-pl-ha115-r0-stainless-undermount", pelicanCode: "PL-HA115", name: "PL-HA115 R0 Stainless Steel Undermount Sink",
    installation: "undermount", sinkType: "single", apronFront: false,
    exteriorWidthIn: 32, exteriorDepthIn: 18, exteriorHeightIn: 10, bowlWidthIn: 30, bowlDepthIn: 16, bowlHeightIn: 10, minimumCabinetWidthIn: 32,
    specificationUrl: "https://cdn.accentuate.io/7876665966732/1729873248748/PL-HA115-R0.pdf?v=1729873248749",
  },
  "PL-HA104": {
    id: "pelican-pl-ha104-r0-stainless-undermount", pelicanCode: "PL-HA104", name: "PL-HA104 R0 Stainless Steel Undermount Sink",
    installation: "undermount", sinkType: "single", apronFront: false,
    exteriorWidthIn: 17, exteriorDepthIn: 18, exteriorHeightIn: 10, bowlWidthIn: 15, bowlDepthIn: 16, bowlHeightIn: 10, minimumCabinetWidthIn: 18,
    specificationUrl: "https://cdn.accentuate.io/7876665278604/1729872420755/PL-HA104-R0.pdf?v=1729872420755",
  },
  "PL-HA108": {
    id: "pelican-pl-ha108-r0-stainless-undermount", pelicanCode: "PL-HA108", name: "PL-HA108 R0 Stainless Steel Undermount Sink",
    installation: "undermount", sinkType: "single", apronFront: false,
    exteriorWidthIn: 23, exteriorDepthIn: 18, exteriorHeightIn: 10, bowlWidthIn: 21, bowlDepthIn: 16, bowlHeightIn: 10, minimumCabinetWidthIn: 24,
    specificationUrl: "https://cdn.accentuate.io/7876665376908/1729872673252/PL-HA108-R0.pdf?v=1729872673252",
  },
  "PL-HA111": {
    id: "pelican-pl-ha111-r0-stainless-undermount", pelicanCode: "PL-HA111", name: "PL-HA111 R0 Stainless Steel Undermount Sink",
    installation: "undermount", sinkType: "single", apronFront: false,
    exteriorWidthIn: 27, exteriorDepthIn: 18, exteriorHeightIn: 10, bowlWidthIn: 25, bowlDepthIn: 16, bowlHeightIn: 10, minimumCabinetWidthIn: 27,
    specificationUrl: "https://cdn.accentuate.io/7876665802892/1729873006384/PL-HA111-R0.pdf?v=1729873006384",
  },
  "PL-HA117": {
    id: "pelican-pl-ha117-r0-stainless-double-bowl-undermount", pelicanCode: "PL-HA117", name: "PL-HA117 R0 Stainless Steel Double-Bowl Undermount Sink",
    installation: "undermount", sinkType: "single", apronFront: false,
    exteriorWidthIn: 32, exteriorDepthIn: 18, exteriorHeightIn: 10, bowlWidthIn: 14.5, bowlDepthIn: 16, bowlHeightIn: 10, bowlCount: 2, minimumCabinetWidthIn: 32,
    specificationUrl: "https://cdn.accentuate.io/7876666130572/1729873362647/PL-HA117-R0.pdf?v=1729873362647",
  },
  "PL-HA119": {
    id: "pelican-pl-ha119-r19-stainless-offset-drain-undermount", pelicanCode: "PL-HA119", name: "PL-HA119 R19 Handmade Stainless Steel Undermount Sink",
    installation: "undermount", sinkType: "single", apronFront: false,
    exteriorWidthIn: 31.25, exteriorDepthIn: 18, exteriorHeightIn: 10, bowlWidthIn: 29.25, bowlDepthIn: 16, bowlHeightIn: 9.5, drainInsetRightIn: 5, drainInsetBackIn: 5, minimumCabinetWidthIn: 32,
    specificationUrl: "https://cdn.accentuate.io/8978112544908/1775067326529/PL-HA119-R15.pdf?v=1775067326529",
  },
  "PL-HA126": {
    id: "pelican-pl-ha126-r0-stainless-asymmetric-double-bowl-undermount", pelicanCode: "PL-HA126", name: "PL-HA126 R0 Stainless Steel Double-Bowl Undermount Sink",
    installation: "undermount", sinkType: "single", apronFront: false,
    exteriorWidthIn: 31.25, exteriorDepthIn: 20.5, exteriorHeightIn: 10, bowlWidthIn: 14, bowlDepthIn: 18, bowlHeightIn: 10, bowlCount: 2, bowlWidthsIn: [14, 13.5], bowlDepthsIn: [18, 16], minimumCabinetWidthIn: 32,
    specificationUrl: "https://cdn.accentuate.io/7876666523788/1729873836731/PL-HA126-R0.pdf?v=1729873836732",
  },
  "PL-HA128": {
    id: "pelican-pl-ha128-r15-stainless-double-bowl-farmhouse", pelicanCode: "PL-HA128", name: "PL-HA128 R15 Handmade Double-Bowl Farmhouse Sink",
    installation: "apron-front-undermount", sinkType: "farmhouse", apronFront: true,
    exteriorWidthIn: 33, exteriorDepthIn: 21, exteriorHeightIn: 10, bowlWidthIn: 14.5, bowlDepthIn: 16, bowlHeightIn: 10, bowlCount: 2, minimumCabinetWidthIn: 33,
    specificationUrl: "https://cdn.accentuate.io/7876666720396/1729873935066/PL-HA128-R15-%282%29.pdf?v=1729873935067",
  },
  "PL-FC3219SB": {
    id: "pelican-pl-fc3219sb-fireclay-farmhouse", pelicanCode: "PL-FC3219SB", name: "PL-FC3219SB Fireclay Farmhouse Sink",
    installation: "apron-front-undermount", sinkType: "farmhouse", apronFront: true,
    exteriorWidthIn: 31.875, exteriorDepthIn: 19.125, exteriorHeightIn: 10.25, bowlWidthIn: 29.125, bowlDepthIn: 16.125, bowlHeightIn: 9.25, minimumCabinetWidthIn: 33,
    specificationUrl: "https://cdn.accentuate.io/9687395860620/1786579710979/PL-FC3219SB.pdf?v=1786579710979",
  },
  "PL-FC3318DB": {
    id: "pelican-pl-fc3318db-fireclay-double-bowl-farmhouse", pelicanCode: "PL-FC3318DB", name: "PL-FC3318DB Fireclay Double-Bowl Farmhouse Sink",
    installation: "apron-front-undermount", sinkType: "farmhouse", apronFront: true,
    exteriorWidthIn: 32.625, exteriorDepthIn: 18, exteriorHeightIn: 10, bowlWidthIn: 15.375, bowlDepthIn: 16.5, bowlHeightIn: 9.25, bowlCount: 2, minimumCabinetWidthIn: 33,
    specificationUrl: "https://cdn.accentuate.io/8980578435212/1775069060533/PL-FC3318DB-(2).pdf?v=1776100453253",
  },
  "PL-HA136": {
    id: "pelican-pl-ha136-r15-stainless-asymmetric-double-bowl-farmhouse", pelicanCode: "PL-HA136", name: "PL-HA136 R15 Handmade Double-Bowl Farmhouse Sink",
    installation: "apron-front-undermount", sinkType: "farmhouse", apronFront: true,
    exteriorWidthIn: 33, exteriorDepthIn: 21, exteriorHeightIn: 10, bowlWidthIn: 17, bowlDepthIn: 16, bowlHeightIn: 10, bowlCount: 2, bowlWidthsIn: [17, 12], minimumCabinetWidthIn: 33,
    specificationUrl: "https://cdn.accentuate.io/7876666949772/1729874053747/PL-HA136-R15.pdf?v=1729874053747",
  },
  "PL-HA139": {
    id: "pelican-pl-ha139-r15-stainless-asymmetric-double-bowl-farmhouse", pelicanCode: "PL-HA139", name: "PL-HA139 R15 Handmade Double-Bowl Farmhouse Sink",
    installation: "apron-front-undermount", sinkType: "farmhouse", apronFront: true,
    exteriorWidthIn: 33, exteriorDepthIn: 21, exteriorHeightIn: 10, bowlWidthIn: 12, bowlDepthIn: 16, bowlHeightIn: 10, bowlCount: 2, bowlWidthsIn: [12, 17], minimumCabinetWidthIn: 33,
    specificationUrl: "https://cdn.accentuate.io/7876666982540/1729874196839/PL-HA139-R15.pdf?v=1729874196839",
  },
  "PL-HA130": {
    id: "pelican-pl-ha130-r0-stainless-double-bowl-farmhouse", pelicanCode: "PL-HA130", name: "PL-HA130 R0 Handmade Double-Bowl Farmhouse Sink",
    installation: "apron-front-undermount", sinkType: "farmhouse", apronFront: true,
    exteriorWidthIn: 36, exteriorDepthIn: 21, exteriorHeightIn: 10, bowlWidthIn: 16, bowlDepthIn: 16, bowlHeightIn: 10, bowlCount: 2, minimumCabinetWidthIn: 36,
    specificationUrl: "https://cdn.accentuate.io/7876666818700/1729873984961/PL-HA130-R0.pdf?v=1729873984961",
  },
  "PL-HA122": {
    id: "pelican-pl-ha122-r15-stainless-farmhouse", pelicanCode: "PL-HA122", name: "PL-HA122 R15 Handmade Farmhouse Sink",
    installation: "apron-front-undermount", sinkType: "farmhouse", apronFront: true,
    exteriorWidthIn: 32.875, exteriorDepthIn: 20.75, exteriorHeightIn: 10, bowlWidthIn: 30, bowlDepthIn: 16, bowlHeightIn: 10, minimumCabinetWidthIn: 33,
    specificationUrl: "https://cdn.accentuate.io/7876666261644/1729873641877/PL-HA122-R15-(1).pdf?v=1729873641877",
  },
  "PL-HA118": {
    id: "pelican-pl-ha118-r15-stainless-farmhouse", pelicanCode: "PL-HA118", name: "PL-HA118 R15 Handmade Farmhouse Sink",
    installation: "apron-front-undermount", sinkType: "farmhouse", apronFront: true,
    exteriorWidthIn: 30, exteriorDepthIn: 21, exteriorHeightIn: 10, bowlWidthIn: 27, bowlDepthIn: 16, bowlHeightIn: 10, minimumCabinetWidthIn: 30,
    specificationUrl: "https://cdn.accentuate.io/7876666196108/1729873514105/PL-HA118-R15.pdf?v=1729873514105",
  },
  "PL-HA125": {
    id: "pelican-pl-ha125-r0-stainless-asymmetric-double-bowl-farmhouse", pelicanCode: "PL-HA125", name: "PL-HA125 R0 Handmade Double-Bowl Farmhouse Sink",
    installation: "apron-front-undermount", sinkType: "farmhouse", apronFront: true,
    exteriorWidthIn: 35.875, exteriorDepthIn: 20.75, exteriorHeightIn: 10, bowlWidthIn: 19, bowlDepthIn: 16, bowlHeightIn: 10, bowlCount: 2, bowlWidthsIn: [19, 13], minimumCabinetWidthIn: 36,
    specificationUrl: "https://cdn.accentuate.io/7876666392716/1729873787540/PL-HA125-R0.pdf?v=1729873787540",
  },
  "PL-HA124": {
    id: "pelican-pl-ha124-r0-stainless-farmhouse", pelicanCode: "PL-HA124", name: "PL-HA124 R0 Handmade Farmhouse Sink",
    installation: "apron-front-undermount", sinkType: "farmhouse", apronFront: true,
    exteriorWidthIn: 35.875, exteriorDepthIn: 20.75, exteriorHeightIn: 10, bowlWidthIn: 33, bowlDepthIn: 16, bowlHeightIn: 10, minimumCabinetWidthIn: 36,
    specificationUrl: "https://cdn.accentuate.io/7876666294412/1729873733866/PL-HA124-R0.pdf?v=1729873733866",
  },
  "PL-HA144": {
    id: "pelican-pl-ha144-r10-stainless-farmhouse", pelicanCode: "PL-HA144", name: "PL-HA144 R10 Handmade Farmhouse Sink",
    installation: "apron-front-undermount", sinkType: "farmhouse", apronFront: true,
    exteriorWidthIn: 33, exteriorDepthIn: 21, exteriorHeightIn: 10, bowlWidthIn: 31, bowlDepthIn: 16, bowlHeightIn: 9.75, minimumCabinetWidthIn: 33,
    specificationUrl: "https://cdn.accentuate.io/8978112807052/1775059262434/PL-HA144-R10.pdf?v=1775059262434",
  },
  "PL-HA148": {
    id: "pelican-pl-ha148-r10-stainless-farmhouse", pelicanCode: "PL-HA148", name: "PL-HA148 R10 Handmade Farmhouse Sink",
    installation: "apron-front-undermount", sinkType: "farmhouse", apronFront: true,
    exteriorWidthIn: 36, exteriorDepthIn: 21, exteriorHeightIn: 10, bowlWidthIn: 34, bowlDepthIn: 16, bowlHeightIn: 9.75, minimumCabinetWidthIn: 36,
    specificationUrl: "https://cdn.accentuate.io/8978112938124/1775058900343/PL-HA148-R10.pdf?v=1775058900343",
  },
  "PL-FC2522SB": {
    id: "pelican-pl-fc2522sb-fireclay-compact-farmhouse", pelicanCode: "PL-FC2522SB", name: "PL-FC2522SB Fireclay Compact Farmhouse Sink",
    installation: "apron-front-undermount", sinkType: "farmhouse", apronFront: true,
    exteriorWidthIn: 25, exteriorDepthIn: 22, exteriorHeightIn: 11.625, bowlWidthIn: 19.875, bowlDepthIn: 14, bowlHeightIn: 11, minimumCabinetWidthIn: 27,
    specificationUrl: "https://cdn.accentuate.io/8980578369676/1775069308518/PL-FC2522SB.pdf?v=1776100502044",
  },
  "PL-VS3218": {
    id: "pelican-pl-vs3218-stainless-undermount", pelicanCode: "PL-VS3218", name: "PL-VS3218 Signature Series Stainless Steel Undermount Sink",
    installation: "undermount", sinkType: "single", apronFront: false,
    exteriorWidthIn: 32.125, exteriorDepthIn: 18, exteriorHeightIn: 9, bowlWidthIn: 30.125, bowlDepthIn: 16, bowlHeightIn: 9, minimumCabinetWidthIn: 32,
    specificationUrl: "https://cdn.accentuate.io/7876668227724/1729876598079/PL-VS3218.pdf?v=1758834311979",
  },
  "PL-VS3018": {
    id: "pelican-pl-vs3018-stainless-undermount", pelicanCode: "PL-VS3018", name: "PL-VS3018 Signature Series Stainless Steel Undermount Sink",
    installation: "undermount", sinkType: "single", apronFront: false,
    exteriorWidthIn: 30, exteriorDepthIn: 18, exteriorHeightIn: 9, bowlWidthIn: 28, bowlDepthIn: 16, bowlHeightIn: 9, minimumCabinetWidthIn: 30,
    specificationUrl: "https://cdn.accentuate.io/7876667965580/1729876393881/PL-VS3018.pdf?v=1758828574961",
  },
  "PL-VS2718": {
    id: "pelican-pl-vs2718-stainless-undermount", pelicanCode: "PL-VS2718", name: "PL-VS2718 Signature Series Stainless Steel Undermount Sink",
    installation: "undermount", sinkType: "single", apronFront: false,
    exteriorWidthIn: 27, exteriorDepthIn: 18, exteriorHeightIn: 9, bowlWidthIn: 25, bowlDepthIn: 16, bowlHeightIn: 9, minimumCabinetWidthIn: 27,
    specificationUrl: "https://cdn.accentuate.io/7876667900044/1729876262131/PL-VS2718.pdf?v=1742392624082",
  },
  "PL-VS1815": {
    id: "pelican-pl-vs1815-stainless-undermount", pelicanCode: "PL-VS1815", name: "PL-VS1815 Signature Series Stainless Steel Undermount Sink",
    installation: "undermount", sinkType: "single", apronFront: false,
    exteriorWidthIn: 18.5, exteriorDepthIn: 15, exteriorHeightIn: 7, bowlWidthIn: 16.5, bowlDepthIn: 13, bowlHeightIn: 7, minimumCabinetWidthIn: 21,
    specificationUrl: "https://cdn.accentuate.io/7876667375756/1729875932156/PL-VS1815.pdf?v=1742391310508",
  },
  "PL-VS2118": {
    id: "pelican-pl-vs2118-stainless-undermount", pelicanCode: "PL-VS2118", name: "PL-VS2118 Signature Series Stainless Steel Undermount Sink",
    installation: "undermount", sinkType: "single", apronFront: false,
    exteriorWidthIn: 20.625, exteriorDepthIn: 17.875, exteriorHeightIn: 9, bowlWidthIn: 18.625, bowlDepthIn: 15.875, bowlHeightIn: 9, minimumCabinetWidthIn: 21,
    specificationUrl: "https://cdn.accentuate.io/7876667408524/1729875967180/PL-VS2118.pdf?v=1742391427922",
  },
  "PL-VS2318": {
    id: "pelican-pl-vs2318-stainless-undermount", pelicanCode: "PL-VS2318", name: "PL-VS2318 Signature Series Stainless Steel Undermount Sink",
    installation: "undermount", sinkType: "single", apronFront: false,
    exteriorWidthIn: 23, exteriorDepthIn: 17.75, exteriorHeightIn: 9, bowlWidthIn: 21, bowlDepthIn: 15.75, bowlHeightIn: 9, minimumCabinetWidthIn: 24,
    specificationUrl: "https://cdn.accentuate.io/7876667474060/1729876113634/PL-VS2318-.pdf?v=1742392230407",
  },
};

const VERIFIED_PELICAN_FAUCETS: Record<string, VerifiedPelicanFaucetProfile> = {
  "PL-8203": {
    id: "pelican-pl-8203-fountain-pull-down", pelicanCode: "PL-8203", name: "PL-8203 Fountain Series Pull-Down Kitchen Faucet",
    installation: "single-hole", overallHeightIn: 27.1875, spoutLengthIn: 9.875, spoutHeightIn: 4.9375, profile: "pull-down", finish: "brushed-nickel",
    specificationUrl: "https://cdn.accentuate.io/7876662329484/1729881091715/PL-8203-Spec-Sheet.pdf?v=1734119171551",
  },
  "PL-8207 BN": {
    id: "pelican-pl-8207-fountain-pull-down-brushed-nickel", pelicanCode: "PL-8207 BN", name: "PL-8207 Fountain Series Pull-Down Kitchen Faucet — Brushed Nickel",
    installation: "single-hole", overallHeightIn: 26.125, spoutLengthIn: 7.6875, spoutHeightIn: 6.5, profile: "pull-down", finish: "brushed-nickel",
    specificationUrl: "https://cdn.accentuate.io/7876662395020/1729881131839/PL-8207-Spec-Sheet.pdf?v=1734119192469",
  },
  "PL-8207 MB": {
    id: "pelican-pl-8207-fountain-pull-down-matte-black", pelicanCode: "PL-8207 MB", name: "PL-8207 Fountain Series Pull-Down Kitchen Faucet — Matte Black",
    installation: "single-hole", overallHeightIn: 26.125, spoutLengthIn: 7.6875, spoutHeightIn: 6.5, profile: "pull-down", finish: "matte-black",
    specificationUrl: "https://cdn.accentuate.io/7876662395020/1729881131839/PL-8207-Spec-Sheet.pdf?v=1734119192469",
  },
  "PL-8237 BG": {
    id: "pelican-pl-8237-fountain-standard-arc-brushed-gold", pelicanCode: "PL-8237 BG", name: "PL-8237 Fountain Series Kitchen Faucet — Brushed Gold",
    installation: "single-hole", overallHeightIn: 12.8125, spoutLengthIn: 7.0625, spoutHeightIn: 8.375, profile: "standard-arc", finish: "brushed-gold",
    specificationUrl: "https://cdn.accentuate.io/7876664393868/1729881524238/PL-8237.pdf?v=1729881524238",
  },
  "PL-8237 BN": {
    id: "pelican-pl-8237-fountain-standard-arc-brushed-nickel", pelicanCode: "PL-8237 BN", name: "PL-8237 Fountain Series Kitchen Faucet — Brushed Nickel",
    installation: "single-hole", overallHeightIn: 12.8125, spoutLengthIn: 7.0625, spoutHeightIn: 8.375, profile: "standard-arc", finish: "brushed-nickel",
    specificationUrl: "https://cdn.accentuate.io/7876664393868/1729881524238/PL-8237.pdf?v=1729881524238",
  },
  "PL-8237 CHR": {
    id: "pelican-pl-8237-fountain-standard-arc-chrome", pelicanCode: "PL-8237 CHR", name: "PL-8237 Fountain Series Kitchen Faucet — Chrome",
    installation: "single-hole", overallHeightIn: 12.8125, spoutLengthIn: 7.0625, spoutHeightIn: 8.375, profile: "standard-arc", finish: "chrome",
    specificationUrl: "https://cdn.accentuate.io/7876664393868/1729881524238/PL-8237.pdf?v=1729881524238",
  },
  "PL-8237 MB": {
    id: "pelican-pl-8237-fountain-standard-arc-matte-black", pelicanCode: "PL-8237 MB", name: "PL-8237 Fountain Series Kitchen Faucet — Matte Black",
    installation: "single-hole", overallHeightIn: 12.8125, spoutLengthIn: 7.0625, spoutHeightIn: 8.375, profile: "standard-arc", finish: "matte-black",
    specificationUrl: "https://cdn.accentuate.io/7876664393868/1729881524238/PL-8237.pdf?v=1729881524238",
  },
  "PL-8248 BN": {
    id: "pelican-pl-8248-fountain-pull-out-brushed-nickel", pelicanCode: "PL-8248 BN", name: "PL-8248 Fountain Series Pull-Out Kitchen Faucet — Brushed Nickel",
    installation: "single-hole", overallHeightIn: 12.375, spoutLengthIn: 10.0625, spoutHeightIn: 10.875, profile: "pull-out", finish: "brushed-nickel",
    specificationUrl: "https://cdn.accentuate.io/8105530687628/1744289003241/PL-8248.pdf?v=1744289003241",
  },
  "PL-8248 CHR": {
    id: "pelican-pl-8248-fountain-pull-out-chrome", pelicanCode: "PL-8248 CHR", name: "PL-8248 Fountain Series Pull-Out Kitchen Faucet — Chrome",
    installation: "single-hole", overallHeightIn: 12.375, spoutLengthIn: 10.0625, spoutHeightIn: 10.875, profile: "pull-out", finish: "chrome",
    specificationUrl: "https://cdn.accentuate.io/8105530687628/1744289003241/PL-8248.pdf?v=1744289003241",
  },
  "PL-8248 MB": {
    id: "pelican-pl-8248-fountain-pull-out-matte-black", pelicanCode: "PL-8248 MB", name: "PL-8248 Fountain Series Pull-Out Kitchen Faucet — Matte Black",
    installation: "single-hole", overallHeightIn: 12.375, spoutLengthIn: 10.0625, spoutHeightIn: 10.875, profile: "pull-out", finish: "matte-black",
    specificationUrl: "https://cdn.accentuate.io/8105530687628/1744289003241/PL-8248.pdf?v=1744289003241",
  },
  "PL-8222 BN": {
    id: "pelican-pl-8222-fountain-pull-out-brushed-nickel", pelicanCode: "PL-8222 BN", name: "PL-8222 Fountain Series Pull-Out Kitchen Faucet — Brushed Nickel",
    installation: "single-hole", overallHeightIn: 9.5625, spoutLengthIn: 8.375, spoutHeightIn: 5.8125, profile: "pull-out", finish: "brushed-nickel",
    specificationUrl: "https://cdn.accentuate.io/7876663148684/1729881399900/PL-8222-Spec-Sheet.pdf?v=1734119372824",
  },
  "PL-8206 BN": {
    id: "pelican-pl-8206-fountain-articulated-swing-brushed-nickel", pelicanCode: "PL-8206 BN", name: "PL-8206 Fountain Series Articulated Kitchen Faucet — Brushed Nickel",
    installation: "single-hole", overallHeightIn: 10.5, spoutLengthIn: 9.75, spoutHeightIn: 9.25, profile: "articulated-swing", finish: "brushed-nickel",
    specificationUrl: "https://cdn.accentuate.io/8105530654860/1744229984387/PL-8206.pdf?v=1744229984387",
  },
  "PL-8206 CHR": {
    id: "pelican-pl-8206-fountain-articulated-swing-chrome", pelicanCode: "PL-8206 CHR", name: "PL-8206 Fountain Series Articulated Kitchen Faucet — Chrome",
    installation: "single-hole", overallHeightIn: 10.5, spoutLengthIn: 9.75, spoutHeightIn: 9.25, profile: "articulated-swing", finish: "chrome",
    specificationUrl: "https://cdn.accentuate.io/8105530654860/1744229984387/PL-8206.pdf?v=1744229984387",
  },
  "PL-8206 MB": {
    id: "pelican-pl-8206-fountain-articulated-swing-matte-black", pelicanCode: "PL-8206 MB", name: "PL-8206 Fountain Series Articulated Kitchen Faucet — Matte Black",
    installation: "single-hole", overallHeightIn: 10.5, spoutLengthIn: 9.75, spoutHeightIn: 9.25, profile: "articulated-swing", finish: "matte-black",
    specificationUrl: "https://cdn.accentuate.io/8105530654860/1744229984387/PL-8206.pdf?v=1744229984387",
  },
  "PL-8224 BN": {
    id: "pelican-pl-8224-fountain-pull-out-brushed-nickel", pelicanCode: "PL-8224 BN", name: "PL-8224 Fountain Series Pull-Out Kitchen Faucet — Brushed Nickel",
    installation: "single-hole", overallHeightIn: 19.3125, spoutLengthIn: 7.9375, spoutHeightIn: 10.25, profile: "pull-out", finish: "brushed-nickel",
    specificationUrl: "https://cdn.accentuate.io/7876664131724/1729881432596/PL-8224-Spec-Sheet.pdf?v=1734119408878",
  },
  "PL-8224 ORB": {
    id: "pelican-pl-8224-fountain-pull-out-oil-rubbed-bronze", pelicanCode: "PL-8224 ORB", name: "PL-8224 Fountain Series Pull-Out Kitchen Faucet — Oil Rubbed Bronze",
    installation: "single-hole", overallHeightIn: 19.3125, spoutLengthIn: 7.9375, spoutHeightIn: 10.25, profile: "pull-out", finish: "oil-rubbed-bronze",
    specificationUrl: "https://cdn.accentuate.io/7876664131724/1729881432596/PL-8224-Spec-Sheet.pdf?v=1734119408878",
  },
  "PL-8210 BN": {
    id: "pelican-pl-8210-fountain-commercial-pull-down-brushed-nickel", pelicanCode: "PL-8210 BN", name: "PL-8210 Fountain Series Commercial Pull-Down Kitchen Faucet — Brushed Nickel",
    installation: "single-hole", overallHeightIn: 22.5, spoutLengthIn: 9.75, spoutHeightIn: 7.75, profile: "pull-down", finish: "brushed-nickel",
    specificationUrl: "https://cdn.accentuate.io/7876662493324/1729881249111/PL-8210-Spec-Sheet.pdf?v=1734119224340",
  },
  "PL-8210 MB": {
    id: "pelican-pl-8210-fountain-commercial-pull-down-matte-black", pelicanCode: "PL-8210 MB", name: "PL-8210 Fountain Series Commercial Pull-Down Kitchen Faucet — Matte Black",
    installation: "single-hole", overallHeightIn: 22.5, spoutLengthIn: 9.75, spoutHeightIn: 7.75, profile: "pull-down", finish: "matte-black",
    specificationUrl: "https://cdn.accentuate.io/7876662493324/1729881249111/PL-8210-Spec-Sheet.pdf?v=1734119224340",
  },
  "PL-8211 BG": {
    id: "pelican-pl-8211-fountain-pull-down-brushed-gold", pelicanCode: "PL-8211 BG", name: "PL-8211 Fountain Series Pull-Down Kitchen Faucet — Brushed Gold",
    installation: "single-hole", overallHeightIn: 15.6875, spoutLengthIn: 9.4375, spoutHeightIn: 6.625, profile: "pull-down", finish: "brushed-gold",
    specificationUrl: "https://cdn.accentuate.io/7876662689932/1729881278122/PL-8211-spec.pdf?v=1750169308913",
  },
  "PL-8211 BN": {
    id: "pelican-pl-8211-fountain-pull-down-brushed-nickel", pelicanCode: "PL-8211 BN", name: "PL-8211 Fountain Series Pull-Down Kitchen Faucet — Brushed Nickel",
    installation: "single-hole", overallHeightIn: 15.6875, spoutLengthIn: 9.4375, spoutHeightIn: 6.625, profile: "pull-down", finish: "brushed-nickel",
    specificationUrl: "https://cdn.accentuate.io/7876662689932/1729881278122/PL-8211-spec.pdf?v=1750169308913",
  },
  "PL-8211 CHR": {
    id: "pelican-pl-8211-fountain-pull-down-chrome", pelicanCode: "PL-8211 CHR", name: "PL-8211 Fountain Series Pull-Down Kitchen Faucet — Chrome",
    installation: "single-hole", overallHeightIn: 15.6875, spoutLengthIn: 9.4375, spoutHeightIn: 6.625, profile: "pull-down", finish: "chrome",
    specificationUrl: "https://cdn.accentuate.io/7876662689932/1729881278122/PL-8211-spec.pdf?v=1750169308913",
  },
  "PL-8213 BN": {
    id: "pelican-pl-8213-fountain-pull-down-brushed-nickel", pelicanCode: "PL-8213 BN", name: "PL-8213 Fountain Series Pull-Down Kitchen Faucet — Brushed Nickel",
    installation: "single-hole", overallHeightIn: 15.75, spoutLengthIn: 9.375, spoutHeightIn: 6.5, profile: "pull-down", finish: "brushed-nickel",
    specificationUrl: "https://cdn.accentuate.io/7876662886540/1729881310144/PL-8213-Spec-Sheet.pdf?v=1734119293439",
  },
  "PL-8213 CHR": {
    id: "pelican-pl-8213-fountain-pull-down-chrome", pelicanCode: "PL-8213 CHR", name: "PL-8213 Fountain Series Pull-Down Kitchen Faucet — Chrome",
    installation: "single-hole", overallHeightIn: 15.75, spoutLengthIn: 9.375, spoutHeightIn: 6.5, profile: "pull-down", finish: "chrome",
    specificationUrl: "https://cdn.accentuate.io/7876662886540/1729881310144/PL-8213-Spec-Sheet.pdf?v=1734119293439",
  },
  "PL-8217 BN": {
    id: "pelican-pl-8217-fountain-pull-down-brushed-nickel", pelicanCode: "PL-8217 BN", name: "PL-8217 Fountain Series Pull-Down Kitchen Faucet — Brushed Nickel",
    installation: "single-hole", overallHeightIn: 16.8125, spoutLengthIn: 9.375, spoutHeightIn: 7.5625, profile: "pull-down", finish: "brushed-nickel",
    specificationUrl: "https://cdn.accentuate.io/7876662952076/1729881335594/PL-8217-Spec-Sheet.pdf?v=1734119313031",
  },
  "PL-8217 CHR": {
    id: "pelican-pl-8217-fountain-pull-down-chrome", pelicanCode: "PL-8217 CHR", name: "PL-8217 Fountain Series Pull-Down Kitchen Faucet — Chrome",
    installation: "single-hole", overallHeightIn: 16.8125, spoutLengthIn: 9.375, spoutHeightIn: 7.5625, profile: "pull-down", finish: "chrome",
    specificationUrl: "https://cdn.accentuate.io/7876662952076/1729881335594/PL-8217-Spec-Sheet.pdf?v=1734119313031",
  },
  "PL-8217 ORB": {
    id: "pelican-pl-8217-fountain-pull-down-oil-rubbed-bronze", pelicanCode: "PL-8217 ORB", name: "PL-8217 Fountain Series Pull-Down Kitchen Faucet — Oil Rubbed Bronze",
    installation: "single-hole", overallHeightIn: 16.8125, spoutLengthIn: 9.375, spoutHeightIn: 7.5625, profile: "pull-down", finish: "oil-rubbed-bronze",
    specificationUrl: "https://cdn.accentuate.io/7876662952076/1729881335594/PL-8217-Spec-Sheet.pdf?v=1734119313031",
  },
  "PL-8218 BN": {
    id: "pelican-pl-8218-fountain-pull-down-brushed-nickel", pelicanCode: "PL-8218 BN", name: "PL-8218 Fountain Series Pull-Down Kitchen Faucet — Brushed Nickel",
    installation: "single-hole", overallHeightIn: 17.6875, spoutLengthIn: 9.375, spoutHeightIn: 8.375, profile: "pull-down", finish: "brushed-nickel",
    specificationUrl: "https://cdn.accentuate.io/7876663017612/1729881362501/PL-8218-Spec-Sheet.pdf?v=1734119334413",
  },
  "PL-8218 CHR": {
    id: "pelican-pl-8218-fountain-pull-down-chrome", pelicanCode: "PL-8218 CHR", name: "PL-8218 Fountain Series Pull-Down Kitchen Faucet — Chrome",
    installation: "single-hole", overallHeightIn: 17.6875, spoutLengthIn: 9.375, spoutHeightIn: 8.375, profile: "pull-down", finish: "chrome",
    specificationUrl: "https://cdn.accentuate.io/7876663017612/1729881362501/PL-8218-Spec-Sheet.pdf?v=1734119334413",
  },
  "PL-8218 MB": {
    id: "pelican-pl-8218-fountain-pull-down-matte-black", pelicanCode: "PL-8218 MB", name: "PL-8218 Fountain Series Pull-Down Kitchen Faucet — Matte Black",
    installation: "single-hole", overallHeightIn: 17.6875, spoutLengthIn: 9.375, spoutHeightIn: 8.375, profile: "pull-down", finish: "matte-black",
    specificationUrl: "https://cdn.accentuate.io/7876663017612/1729881362501/PL-8218-Spec-Sheet.pdf?v=1734119334413",
  },
  "PL-8231 BG": {
    id: "pelican-pl-8231-fountain-pull-out-brushed-gold", pelicanCode: "PL-8231 BG", name: "PL-8231 Fountain Series Pull-Out Kitchen Faucet — Brushed Gold",
    installation: "single-hole", overallHeightIn: 15.75, spoutLengthIn: 9.375, spoutHeightIn: 6.5, profile: "pull-out", finish: "brushed-gold",
    specificationUrl: "https://cdn.accentuate.io/7876664230028/1729881462010/PL-8231-Spec-Sheet.pdf?v=1734119435030",
  },
  "PL-8231 BN": {
    id: "pelican-pl-8231-fountain-pull-out-brushed-nickel", pelicanCode: "PL-8231 BN", name: "PL-8231 Fountain Series Pull-Out Kitchen Faucet — Brushed Nickel",
    installation: "single-hole", overallHeightIn: 15.75, spoutLengthIn: 9.375, spoutHeightIn: 6.5, profile: "pull-out", finish: "brushed-nickel",
    specificationUrl: "https://cdn.accentuate.io/7876664230028/1729881462010/PL-8231-Spec-Sheet.pdf?v=1734119435030",
  },
  "PL-8231 CHR": {
    id: "pelican-pl-8231-fountain-pull-out-chrome", pelicanCode: "PL-8231 CHR", name: "PL-8231 Fountain Series Pull-Out Kitchen Faucet — Chrome",
    installation: "single-hole", overallHeightIn: 15.75, spoutLengthIn: 9.375, spoutHeightIn: 6.5, profile: "pull-out", finish: "chrome",
    specificationUrl: "https://cdn.accentuate.io/7876664230028/1729881462010/PL-8231-Spec-Sheet.pdf?v=1734119435030",
  },
  "PL-8231 MB": {
    id: "pelican-pl-8231-fountain-pull-out-matte-black", pelicanCode: "PL-8231 MB", name: "PL-8231 Fountain Series Pull-Out Kitchen Faucet — Matte Black",
    installation: "single-hole", overallHeightIn: 15.75, spoutLengthIn: 9.375, spoutHeightIn: 6.5, profile: "pull-out", finish: "matte-black",
    specificationUrl: "https://cdn.accentuate.io/7876664230028/1729881462010/PL-8231-Spec-Sheet.pdf?v=1734119435030",
  },
  "PL-8257 BN": {
    id: "pelican-pl-8257-fountain-pull-down-brushed-nickel", pelicanCode: "PL-8257 BN", name: "PL-8257 Fountain Series Pull-Down Kitchen Faucet — Brushed Nickel",
    installation: "single-hole", overallHeightIn: 17.75, spoutLengthIn: 8.25, spoutHeightIn: 9.5, profile: "pull-down", finish: "brushed-nickel",
    specificationUrl: "https://cdn.accentuate.io/8105530785932/1744290070437/PL-8257.pdf?v=1744290070437",
  },
  "PL-8257 CHR": {
    id: "pelican-pl-8257-fountain-pull-down-chrome", pelicanCode: "PL-8257 CHR", name: "PL-8257 Fountain Series Pull-Down Kitchen Faucet — Chrome",
    installation: "single-hole", overallHeightIn: 17.75, spoutLengthIn: 8.25, spoutHeightIn: 9.5, profile: "pull-down", finish: "chrome",
    specificationUrl: "https://cdn.accentuate.io/8105530785932/1744290070437/PL-8257.pdf?v=1744290070437",
  },
  "PL-8257 MB": {
    id: "pelican-pl-8257-fountain-pull-down-matte-black", pelicanCode: "PL-8257 MB", name: "PL-8257 Fountain Series Pull-Down Kitchen Faucet — Matte Black",
    installation: "single-hole", overallHeightIn: 17.75, spoutLengthIn: 8.25, spoutHeightIn: 9.5, profile: "pull-down", finish: "matte-black",
    specificationUrl: "https://cdn.accentuate.io/8105530785932/1744290070437/PL-8257.pdf?v=1744290070437",
  },
};

function normalizedPelicanCode(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().toUpperCase().replace(/\s+\(OLD\)$/, "").replace(/\s+(?:BLACK|GREY|WHITE)$/, "");
  if (/^PL-HA109\s+ADA\s+R(?:0|15)\s+18G$/.test(normalized)) return "PL-HA109 ADA";
  if (/^PL-HA109\s+R(?:0|15)\s+(?:16|18)G$/.test(normalized)) return "PL-HA109";
  if (/^PL-HA115\s+R(?:0|15)\s+(?:16|18)G$/.test(normalized)) return "PL-HA115";
  if (/^PL-HA104\s+R(?:0|15)\s+16G$/.test(normalized)) return "PL-HA104";
  if (/^PL-HA108\s+R0\s+(?:16|18)G$/.test(normalized)) return "PL-HA108";
  if (/^PL-HA111\s+R0\s+(?:16|18)G$/.test(normalized)) return "PL-HA111";
  if (/^PL-HA117\s+R0\s+(?:16|18)G$/.test(normalized)) return "PL-HA117";
  if (/^PL-HA119\s+R(?:15|19)\s+18G$/.test(normalized)) return "PL-HA119";
  if (/^PL-HA126\s+R0\s+(?:16|18)G$/.test(normalized)) return "PL-HA126";
  if (/^PL-HA128\s+R15\s+16G$/.test(normalized)) return "PL-HA128";
  if (/^PL-HA130\s+R0(?:\s+16G)?$/.test(normalized)) return "PL-HA130";
  if (/^PL-HA122\s+R15(?:\s+16G)?$/.test(normalized)) return "PL-HA122";
  if (/^PL-HA118\s+R15(?:\s+16G)?$/.test(normalized)) return "PL-HA118";
  if (/^PL-HA125\s+R0(?:\s+16G)?$/.test(normalized)) return "PL-HA125";
  if (/^PL-HA124\s+R0(?:\s+16G)?$/.test(normalized)) return "PL-HA124";
  if (/^PL-HA139\s+R15(?:\s+16G)?$/.test(normalized)) return "PL-HA139";
  if (/^PL-HA144\s+R10(?:\s+16G)?$/.test(normalized)) return "PL-HA144";
  if (/^PL-HA148\s+R10(?:\s+16G)?$/.test(normalized)) return "PL-HA148";
  if (/^PL-VS3218\s+(?:16|18)G$/.test(normalized)) return "PL-VS3218";
  if (/^PL-VS3018\s+(?:16|18)G$/.test(normalized)) return "PL-VS3018";
  if (/^PL-VS2718\s+(?:16|18)G$/.test(normalized)) return "PL-VS2718";
  if (/^PL-VS1815\s+18G$/.test(normalized)) return "PL-VS1815";
  if (/^PL-VS2118\s+18G$/.test(normalized)) return "PL-VS2118";
  if (/^PL-VS2318\s+(?:16|18)G$/.test(normalized)) return "PL-VS2318";
  return normalized;
}

export function verifiedPelicanSinkProfile(code: string | null | undefined): VerifiedPelicanSinkProfile | null {
  return VERIFIED_PELICAN_SINKS[normalizedPelicanCode(code)] ?? null;
}

export function verifiedPelicanFaucetProfile(code: string | null | undefined): VerifiedPelicanFaucetProfile | null {
  const normalized = (code ?? "").trim().toUpperCase();
  if (/^PL-8203(?:\s+BN)?$/.test(normalized)) return VERIFIED_PELICAN_FAUCETS["PL-8203"];
  return VERIFIED_PELICAN_FAUCETS[normalized] ?? null;
}

export function hasVerifiedPelicanFixtureProfile(code: string | null | undefined): boolean {
  return Boolean(verifiedPelicanSinkProfile(code) || verifiedPelicanFaucetProfile(code));
}

export function verifiedPelicanSinkFitsCabinet(profile: VerifiedPelicanSinkProfile, cabinetWidthIn: number): boolean {
  return Number.isFinite(cabinetWidthIn) && cabinetWidthIn >= profile.minimumCabinetWidthIn;
}

/**
 * A sink base's usable opening is its nominal cabinet face width.  Its rotated
 * plan footprint may swap width/depth, but that must never turn an FSB-36 into
 * a 24-inch opening during a sink compatibility check.
 */
export function sinkBaseOpeningWidthIn(base?: { width?: number | null }): number {
  const width = Number(base?.width ?? 0);
  return Number.isFinite(width) && width > 0 ? width : 0;
}

export type PelicanSinkCandidate = { pelicanCode?: string | null; name?: string | null; description?: string | null };
export type PelicanSinkBaseKind = "farmhouse" | "standard";

/** A farmhouse base accepts only apron-front sinks; a standard SB-style base accepts standard sinks. */
export function pelicanSinkBaseKind(candidate: PelicanSinkCandidate): PelicanSinkBaseKind {
  if (verifiedPelicanSinkProfile(candidate.pelicanCode)?.sinkType === "farmhouse") return "farmhouse";
  const details = `${candidate.name ?? ""} ${candidate.description ?? ""}`.toLowerCase();
  return /\bfarm(?:house)?\b|\bapron[-\s]?front\b/.test(details) ? "farmhouse" : "standard";
}

export function isPelicanSinkCompatibleWithBase(candidate: PelicanSinkCandidate, baseKind: PelicanSinkBaseKind): boolean {
  return pelicanSinkBaseKind(candidate) === baseKind;
}
