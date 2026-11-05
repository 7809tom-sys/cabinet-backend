import { isDesignerUtilityOrOvenBox } from "../../shared/designerEligibility";
import { isPlaceablePanel } from "../../shared/designerPanels";
import { isWallWineRackCabinet } from "../../shared/wallWineRack";

export type PaletteCandidate = {
  masterCode?: string | null;
  category: string | null;
  subCategory?: string | null;
  placementType: string | null;
  description?: string | null;
  numberOfDoors?: number | null;
  numberOfDrawers?: number | null;
};

/**
 * Does this catalog row belong to the accessories/panels query rather than the
 * drag-and-drop Base/Wall/Tall palettes?
 *
 * Two things share one surface here:
 *
 * 1. Bill-of-materials add-ons — crown, light rail, fillers, scribes, hardware,
 *    roll-out trays, separately sold glass doors. They are quantity lines and
 *    are never drawn as a box.
 * 2. Panels — end/skin/decorative panels plus base (BP) and dishwasher (DWR)
 *    return panels. They ARE drawn, but as 3/4-inch boards, so the Designer
 *    offers them from the accessory query its Panels tab reads instead of
 *    bucketing them as a base, wall, or tall box.
 *
 * Row 2 is decided by `shared/designerPanels.ts`, the same classifier Cabinet
 * Config readiness reports on, so the palette and the admin claim agree. Before
 * that shared rule existed, a "Base Panel" with no `panel` in its subCategory
 * and no `end panel`/`skin panel` in its description slipped past every trim
 * pattern here, landed in the base bucket, and the Panels tab never received it.
 *
 * Panels are checked before the trim patterns for a second reason: their
 * wording ("Dishwasher Panel") can read as trim, which previously routed them
 * to the Accessories & Trim tab as BOM items instead of the Panels tab.
 */
export function isDesignerAccessoryRow(row: PaletteCandidate): boolean {
  // Wine racks stay on the Wall picker. Auto-Design still skips them as straight uppers.
  if (isWallWineRackCabinet(row)) return false;
  // A tall oven/utility box is a real cabinet even when a supplier files it under Accessories.
  if (isDesignerUtilityOrOvenBox(row)) return false;
  if (isPlaceablePanel(row)) return true;

  const pt = (row.placementType || "").toLowerCase();
  const cat = (row.category || "").toLowerCase();
  const sub = (row.subCategory || "").toLowerCase();
  const desc = (row.description || "").toLowerCase();
  // Catch all trim/molding/filler/accessory categories across all cabinet lines.
  // DB categories include: "Accessory", "Trim and Molding", "Filler's and Panels", "Misc"
  // as well as placementType values like "accessory" and "trim".
  if (pt.includes("accessory") || pt.includes("trim")) return true;
  if (cat === "accessory") return true;
  if (cat.includes("trim") || cat.includes("molding")) return true;
  if (cat.includes("filler") || cat.includes("panel")) return true;
  if (cat === "misc") return true;
  // Many lines store trim items with category="Base" but their subCategory
  // or description reveals they are trim/molding/filler/panel items.
  if (sub.includes("moulding") || sub.includes("molding") || sub.includes("crown")) return true;
  if (sub.includes("filler") || sub.includes("panel") || sub.includes("leg") || sub.includes("scribe")) return true;
  if (sub.includes("rail") || sub.includes("rope") || sub.includes("cove") || sub.includes("skin")) return true;
  // Replacement glass doors such as PGWDC42 are priced BOM accessories, not
  // standalone cabinet boxes that can be dragged onto a wall. A complete
  // WDC42PG is different: it is the source-priced diagonal wall cabinet with
  // its plain glass door already included and must remain in the Corner palette.
  if (/^pgwdc/.test((row.masterCode ?? "").toLowerCase())) return true;
  if (/glass door.*(?:fits|for)\s+(?:only\s+)?wdc|glass door sold separately/.test(desc)) return true;
  // Description-based fallback: items whose description contains trim keywords
  // but have no subCategory (e.g. ALRM, LRM, SCR, DCM, ICM, BF-*, BEP-*, etc.)
  const trimDescPattern = /\b(molding|moulding|scribe|light rail|crown|cove|rope|filler|end panel|skin panel|decorative leg|decorative panel|island panel|bead board|fluted filler|base filler|angle molding|inside corner molding|refrigerator end panel|shoe moulding|shoe molding|flat base molding|square decorative leg|outside corner molding|touch.?up|sample door|spray paint)\b/;
  return trimDescPattern.test(desc);
}
