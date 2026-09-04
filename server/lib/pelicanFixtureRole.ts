export type PelicanFixtureRole = "sink" | "faucet";

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
const KITCHEN_DESIGNER_EXCLUDED_CODES = /^PL-3099(?:\s|$)/i;

/**
 * Recover the actual fixture family from imported Pelican text. The importer
 * has historical rows where cast-iron sinks are labelled as "Faucets" and
 * prefabricated countertops reference a faucet cut-out. The Designer must not
 * repeat those source labels as customer-facing placement rules.
 */
export function pelicanFixtureRole(source: PelicanFixtureSource): PelicanFixtureRole | null {
  // Pelican's PL-3099 is a documented porcelain vanity sink. A legacy imported
  // display name calls it "Farmhouse Reserve," so source text alone could make it
  // look like a kitchen sink. Keep its catalog record intact, but never surface it
  // in the kitchen sink-base workflow.
  if (KITCHEN_DESIGNER_EXCLUDED_CODES.test(source.pelicanCode?.trim() ?? "")) return null;
  const text = `${source.name ?? ""} ${source.description ?? ""}`;
  if (ACCESSORY.test(text) || NON_FIXTURE.test(text)) return null;
  if (SINK.test(text)) return "sink";
  if (FAUCET.test(text)) return "faucet";

  const subCategory = (source.subCategory ?? "").trim().toLowerCase();
  if (subCategory === "sinks") return "sink";
  if (subCategory === "faucets") return "faucet";
  return null;
}
