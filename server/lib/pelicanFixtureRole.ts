export type PelicanFixtureRole = "sink" | "faucet" | "pot-filler";

type PelicanFixtureSource = {
  pelicanCode?: string | null;
  name: string | null;
  description: string | null;
  subCategory: string | null;
};

const ACCESSORY = /\b(clip|strainer|\bgrid\b|template|mounting|drain assembly|flange|cutting board|colander|bottom grid|rinse basket)\b/i;
const NON_FIXTURE = /\b(countertop|prefab|slab|backsplash|tile|molding|trim)\b/i;
const SINK = /\b(sink|basin|farmhouse|undermount|drop[ -]?in|workstation|apron[ -]?front|lavatory)\b/i;
const FAUCET = /\b(faucet|pot filler|kitchen tap|bar tap|shower faucet)\b/i;
const KITCHEN_DESIGNER_EXCLUDED_CODES = /^(?:PL-3099|PL-3608|PL-8112)(?:\s|$)/i;

/** Exact source-backed bathroom vanity sink records, independent of imported product text. */
export function isPelicanVanitySinkCode(code: string | null | undefined): boolean {
  return /^(?:PL-3099|PL-3608)(?:\s|$)/i.test(code?.trim() ?? "");
}

/** Exact source-backed bathroom vanity faucet records, independent of imported product text. */
export function isPelicanVanityFaucetCode(code: string | null | undefined): boolean {
  return /^PL-8112\s+(?:BN|CHR)$/i.test(code?.trim() ?? "");
}

/**
 * Recover the actual fixture family from imported Pelican text. The importer
 * has historical rows where cast-iron sinks are labelled as "Faucets" and
 * prefabricated countertops reference a faucet cut-out. The Designer must not
 * repeat those source labels as customer-facing placement rules.
 */
export function pelicanFixtureRole(source: PelicanFixtureSource): PelicanFixtureRole | null {
  // Pelican's PL-3099 and PL-3608 are documented porcelain vanity sinks and
  // PL-8112 is a documented vanity faucet. Legacy imported labels may call
  // PL-3099 a farmhouse sink, so text alone could make the bathroom fixtures
  // look like kitchen products. Keep their catalog records intact, but surface
  // them only through the bathroom vanity workflow.
  if (KITCHEN_DESIGNER_EXCLUDED_CODES.test(source.pelicanCode?.trim() ?? "")) return null;
  const text = `${source.name ?? ""} ${source.description ?? ""}`;
  if (ACCESSORY.test(text) || NON_FIXTURE.test(text)) return null;
  if (SINK.test(text)) return "sink";
  // A pot filler has a dedicated wall/range association and must never flow
  // into the sink-mounted faucet placement route just because both are faucets.
  if (/\bpot filler\b/i.test(text)) return "pot-filler";
  if (FAUCET.test(text)) return "faucet";

  const subCategory = (source.subCategory ?? "").trim().toLowerCase();
  if (subCategory === "sinks") return "sink";
  if (subCategory === "faucets") return "faucet";
  return null;
}
