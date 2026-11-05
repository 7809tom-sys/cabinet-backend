import { designerCatalogCode, isDesignerFiller, isDesignerUtilityOrOvenBox, isDesignerValance } from "./designerEligibility";

/**
 * One panel identity for the Designer palette, the storefront catalog, and
 * Cabinet Config readiness.
 *
 * Panels are sold as flat stock rather than cabinet boxes: base/wall/tall end
 * panels, decorative door panels, refrigerator and dishwasher panels, skins,
 * and full sheets. The Designer offers them on the Panels tab and drops them as
 * 3/4-inch boards, so every layer that decides "is this a panel?" has to agree.
 * `design.placeableCabinets` uses this module to keep panels out of the
 * Base/Wall/Tall palettes and inside the accessory query the Panels tab reads,
 * and `server/lib/designerCabinetReadiness.ts` uses it to report the tab an
 * item will actually appear on.
 *
 * Two prefixes are deliberately ambiguous and need more than the code:
 * - `BP` is a base/basement panel in the lines that sell one, but the same
 *   prefix is a Base Peninsula cabinet (BP45L) in others.
 * - `DWR` is the dishwasher return panel (alternate code of BEP(DWR)3) in the
 *   lines that sell one, but `DWR-3` is a 3-inch drawer front elsewhere.
 * Both are accepted only with confirming catalog wording, a dimensioned stock
 * code, or a row that has no door and no drawer front.
 */
export type PanelFamily =
  | "base"
  | "wall"
  | "tall"
  | "decorative"
  | "dishwasher"
  | "refrigerator"
  | "skin"
  | "full"
  | "panel";

export type PanelShape = {
  masterCode?: string | null;
  description?: string | null;
  category?: string | null;
  subCategory?: string | null;
  placementType?: string | null;
  numberOfDoors?: number | string | null;
  numberOfDrawers?: number | string | null;
};

/** Panel codes that identify flat stock without relying on catalog prose. */
const PANEL_CODE = /^(?:BDEP|TDEP|VDEP|WDEP|BEP|WEP|TEP|REPV?|DEP|IEP|FEP|PNL|BPS|WPS|TPS|DWP|DWEP|FPL|FPV|SDBP)\d/;
/** Codes that are a panel only with confirming wording or a flat board. */
const AMBIGUOUS_PANEL_CODE = /^(?:BP|DWR|DWP)\d/;
/** Cabinet families that share a prefix with a panel family and must win. */
const CABINET_CODE = /^(?:BPP|BPC|BPL|BPO|BPF|BT|BFH)\d/;

/** Loose stock priced by the linear foot or attached inside a run. */
const LOOSE_TRIM_TEXT = /\b(?:moulding|molding|toe ?kick|toekick|scribe|batten|light rail|valance|roll[- ]?out|pull[- ]?out|tray|sample door|touch-?up|spray paint|hardware|hinge|knob|glass door|sink front)\b/;
const FILLER_TEXT = /\bfiller\b|\bfluted filler\b|\bbase filler\b/;
/** Qualified panel wording. A bare "panel" can describe a cabinet's own door. */
const QUALIFIED_PANEL_LABEL = /\b(?:end|skin|decorative|door|finished|island|side|full|back|return|base|basement|wall|tall)\s+panels?\b|\b(?:dishwasher|refrigerator|fridge)\b[^,;]{0,24}\bpanels?\b|\bskins?\b|flat\s+finished\s+panel/i;
const CABINET_TEXT = /\bcabinets?\b|\bpeninsula\b|\bpantry\b/;
const DISHWASHER_TEXT = /dishwasher|\bdw\s*[-_ ]?(?:end\s*)?panel\b/;
const REFRIGERATOR_TEXT = /refrigerator|\bfridge\b/;
const DRAWER_FRONT_TEXT = /\bdrawer\s*(?:front|face)\b|\bdrawerfront\b/;
const FLAT_BOARD_TEXT = /plywood\s+edge[-\s]?banded\s+board/i;

/** Drop marketing prose such as `Looks like: raised panel doors`. */
export function panelProductText(shape: PanelShape): string {
  const product = (shape.description ?? "").split(/looks\s+like\s*:/i)[0];
  return `${shape.subCategory ?? ""} ${product}`.toLowerCase().replace(/\s+/g, " ").trim();
}

export function panelCode(shape: PanelShape): string {
  return designerCatalogCode(shape.masterCode);
}

function openingCount(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** True when the row describes flat board: no door and no drawer front. */
function isFlatStock(shape: PanelShape): boolean {
  return openingCount(shape.numberOfDoors) === 0 && openingCount(shape.numberOfDrawers) === 0;
}

/**
 * True for a physical panel/skin a user would look for on the Panels tab.
 * Fillers, moldings, toe kicks, valances, roll-out trays, sink fronts, and
 * loose hardware are excluded even when their wording mentions a panel.
 */
export function isPlaceablePanel(shape: PanelShape): boolean {
  if (isDesignerFiller(shape) || isDesignerValance(shape) || isDesignerUtilityOrOvenBox(shape)) return false;
  const code = panelCode(shape);
  const text = panelProductText(shape);
  // An explicit "…Panel"/"…Skin" label is what the catalog sells, so it can win
  // over a genuine mis-filing under a Filler subCategory (USV-24-96 is a skin
  // panel stored as "Filler"). It never wins over molding, tray, toe-kick,
  // valance, glass-door, or hardware wording.
  const qualified = QUALIFIED_PANEL_LABEL.test(text);
  const explicitFlatBoard = FLAT_BOARD_TEXT.test(`${shape.subCategory ?? ""} ${shape.description ?? ""}`);
  const looseTrim = LOOSE_TRIM_TEXT.test(text);
  const fillerOnly = !looseTrim && FILLER_TEXT.test(text);
  if (!explicitFlatBoard && (looseTrim || (fillerOnly && !qualified))) return false;
  if (CABINET_CODE.test(code)) return false;
  // Explicit field-cut board stock is a panel by name.
  if (explicitFlatBoard) return true;
  const dishwasherOrFridge = DISHWASHER_TEXT.test(text) || REFRIGERATOR_TEXT.test(text);
  if (DRAWER_FRONT_TEXT.test(text) && !dishwasherOrFridge && !qualified) return false;
  if (PANEL_CODE.test(code)) return true;
  if (AMBIGUOUS_PANEL_CODE.test(code)) {
    // Confirming wording, or a row with no door and no drawer front, is the
    // only evidence accepted. The code alone is never enough: the same prefix
    // is a Base Peninsula cabinet in other lines. Unconfigured rows (unknown
    // door/drawer counts) stay cabinets rather than guessing.
    if (qualified) return true;
    if (CABINET_TEXT.test(text) && !dishwasherOrFridge) return false;
    return isFlatStock(shape);
  }
  if (!qualified) return false;
  return isFlatStock(shape) || !CABINET_TEXT.test(text);
}

/** The Designer panel family an item belongs to, or null for a non-panel. */
export function panelFamilyFor(shape: PanelShape): PanelFamily | null {
  if (!isPlaceablePanel(shape)) return null;
  const code = panelCode(shape);
  const text = panelProductText(shape);
  if (isDishwasherPanelPart(shape)) return "dishwasher";
  if (REFRIGERATOR_TEXT.test(text)) return "refrigerator";
  if (/\bskins?\b/.test(text) || /^(?:BPS|WPS|TPS)\d/.test(code)) return "skin";
  if (/^(?:FPL|FPV)\d/.test(code) || /\bfull\b/.test(text)) return "full";
  if (/decorative/.test(text) || /^(?:BDEP|TDEP|VDEP|WDEP)\d/.test(code)) return "decorative";
  if (/^(?:WEP|WPS|WBP)\d/.test(code) || /\bwall\b/.test(text)) return "wall";
  if (/^(?:TEP|TDEP)\d/.test(code) || /\btall\b/.test(text)) return "tall";
  if (/^(?:BEP|BPS|BP)\d/.test(code) || /\bbase\b/.test(text)) return "base";
  return "panel";
}

/**
 * True only for a dishwasher panel. `DWR`/`DWP` and the loose `BP` family are
 * dishwasher panels only when the catalog says so; a drawer front such as
 * `DWR-3` is never one.
 */
export function isDishwasherPanelPart(shape: PanelShape): boolean {
  if (!isPlaceablePanel(shape)) return false;
  const code = panelCode(shape);
  if (DISHWASHER_TEXT.test(panelProductText(shape))) return true;
  return /^(?:DWP|DWEP|BDWP|BDWEP)\d?$/.test(code);
}

/**
 * Where the Designer offers the item. Panels go to the Panels palette, which
 * the client reads from the accessory query; they are never mixed into the
 * drag-and-drop Base/Wall/Tall boxes.
 */
export function designerOfferSlot(shape: PanelShape): "base" | "wall" | "tall" | "panels" | "accessory" {
  if (isPlaceablePanel(shape)) return "panels";
  const placement = (shape.placementType ?? "").trim().toLowerCase();
  if (placement === "base" || placement === "wall" || placement === "tall") return placement;
  if (placement.includes("accessory") || placement.includes("trim")) return "accessory";
  if (placement.includes("wall")) return "wall";
  if (placement.includes("tall") || placement.includes("pantry") || placement.includes("oven") || placement.includes("utility")) return "tall";
  if (placement) return "base";
  const category = (shape.category ?? "").trim().toLowerCase();
  if (category.includes("wall")) return "wall";
  if (category.includes("tall")) return "tall";
  if (category === "accessory" || category.includes("trim") || category.includes("molding") || category === "misc") return "accessory";
  return "base";
}
