/**
 * Supplier-verified bathroom catalog identities used only by the regular
 * Designer's bathroom fixture palette. These are display-image references,
 * not material textures or 3D geometry evidence.
 *
 * Source record: /home/ubuntu/pelican-official-bathroom-source-notes-2026-10-07.md
 * Source collection: https://buildpelican.com/collections/toilets?system_tags=toilets
 *                    https://buildpelican.com/collections/bathtubs
 *                    https://buildpelican.com/collections/sinks/Bathroom?system_tags=bathroom
 */

const OFFICIAL_BATHROOM_IMAGE_BY_CODE: Readonly<Record<string, string>> = {
  "PL-12005": "/manus-storage/toilet-pl-12005_48351c94.png",
  "PL-12005 MB": "/manus-storage/toilet-pl-12005-mb_d1aee8fc.png",
  "PL-12305": "/manus-storage/toilet-pl-12305_6babd796.png",
  "PL-12305 MB": "/manus-storage/toilet-pl-12305-mb_ee911a75.png",
  "PL-A249 ADA": "/manus-storage/toilet-pl-a249-ada_8194d474.png",
  "PL-02138": "/manus-storage/tub-pl-02138_3a1f6461.png",
  "PL-02141": "/manus-storage/tub-pl-02141_44be67ae.png",
  "PL-02146": "/manus-storage/tub-pl-02146_56111d69.png",
  "PL-02562": "/manus-storage/tub-pl-02562_c46a03ce.png",
  "PL-02563": "/manus-storage/tub-pl-02563_9ccec2a0.png",
  "PL-02849L": "/manus-storage/tub-pl-02849-left_d193333e.png",
  "PL-02849R": "/manus-storage/tub-pl-02849-right_fea70939.png",
  "PL-02851L": "/manus-storage/tub-pl-02851-left_3a77bb55.png",
  "PL-02851R": "/manus-storage/tub-pl-02851-right_11c4fbb3.png",
};

const SOURCE_VERIFIED_TUB_BASE_CODES = new Set([
  "PL-02138",
  "PL-02141",
  "PL-02146",
  "PL-02562",
  "PL-02563",
]);

const SOURCE_VERIFIED_ALCOVE_TUB_CODES = new Set([
  "PL-02849L",
  "PL-02849R",
  "PL-02850L",
  "PL-02850R",
  "PL-02851L",
  "PL-02851R",
]);

const SOURCE_VERIFIED_TOILET_OR_BIDET_CODES = new Set([
  "PL-12005",
  "PL-12005 MB",
  "PL-12011",
  "PL-12027",
  "PL-12044",
  "PL-12044 MB",
  "PL-12050",
  "PL-12210",
  "PL-12228",
  "PL-12230",
  "PL-12248",
  "PL-12249",
  "PL-12305",
  "PL-12305 MB",
  "PL-12318",
  "PL-12335",
  "PL-12382",
  "PL-A249 ADA",
]);

/** Normalize only cosmetic whitespace; catalog SKU identity stays otherwise exact. */
export function normalizedPelicanBathroomCatalogCode(code: string | null | undefined): string {
  return (code ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

/**
 * This fixed collection snapshot intentionally rejects accessory sets,
 * special-order commercial valves, and an imported `PL-12243` row that is not
 * in Pelican's current collection or source search. The latter remains in the
 * underlying catalog in conflict status until its official source is supplied.
 */
export function isSourceVerifiedPelicanToiletOrBidet(code: string | null | undefined): boolean {
  return SOURCE_VERIFIED_TOILET_OR_BIDET_CODES.has(normalizedPelicanBathroomCatalogCode(code));
}

/**
 * Current Pelican tubs are represented by older catalog rows. Only these exact
 * model/side codes may appear as bathtubs; drain assemblies, trim kits and NSO/
 * BSO accessory codes are never tub choices.
 */
export function isSourceVerifiedPelicanBathtub(code: string | null | undefined): boolean {
  const normalized = normalizedPelicanBathroomCatalogCode(code);
  const sizeVariant = normalized.match(/^(PL-\d{5}) (?:59|67)"$/);
  return Boolean(
    (sizeVariant && SOURCE_VERIFIED_TUB_BASE_CODES.has(sizeVariant[1]!))
    || SOURCE_VERIFIED_ALCOVE_TUB_CODES.has(normalized),
  );
}

/**
 * Prefer a downloaded, source-verified official card photo when one is mapped.
 * Preserve the imported image for valid supplier records whose live product
 * page could not yield a gallery URL during this audit (currently PL-02850).
 */
export function officialPelicanBathroomCatalogImage(
  code: string | null | undefined,
  storedImageUrl: string | null | undefined,
): string | null {
  const normalized = normalizedPelicanBathroomCatalogCode(code);
  const sizeVariant = normalized.match(/^(PL-\d{5}) (?:59|67)"$/);
  return OFFICIAL_BATHROOM_IMAGE_BY_CODE[normalized]
    ?? (sizeVariant ? OFFICIAL_BATHROOM_IMAGE_BY_CODE[sizeVariant[1]!] : undefined)
    ?? storedImageUrl
    ?? null;
}
