import { isPlaceablePanel, panelFamilyFor, type PanelFamily } from "@shared/designerPanels";

type PanelCandidate = {
  masterCode?: string | null;
  description?: string | null;
  subCategory?: string | null;
  category?: string | null;
  numberOfDoors?: number | null;
  numberOfDrawers?: number | null;
};

/**
 * A subset of the existing source-priced accessory query, never new products.
 *
 * The Panels tab shows exactly what the server calls a panel, using the same
 * shared classifier Cabinet Config readiness reports on. That keeps a BP
 * base/basement panel or a DWR dishwasher return panel on the Panels tab
 * instead of letting prose-only heuristics drop it while Cabinet Config still
 * advertises it as designer-ready.
 */
export function isPanelPaletteItem(item: PanelCandidate): boolean {
  return isPlaceablePanel(item);
}

export function panelPaletteFamily(item: PanelCandidate): PanelFamily | null {
  return panelFamilyFor(item);
}

/** Accordion headings for the Panels tab, in reading order. */
export const PANEL_FAMILY_LABEL: Record<PanelFamily, string> = {
  base: "Base Panels",
  wall: "Wall Panels",
  tall: "Tall Panels",
  decorative: "Decorative End Panels",
  dishwasher: "Dishwasher Panels",
  refrigerator: "Refrigerator Panels",
  skin: "Skins",
  full: "Full Panels",
  panel: "Panels",
};
