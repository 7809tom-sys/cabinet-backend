// ─── Closet Designer parts catalog ──────────────────────────────────────────
// A Sauder-style closet system is built from modular parts: vertical panels,
// shelves, hanging rods, drawer towers, and accessories. These are PLACEHOLDER
// products with placeholder prices — they will be replaced by the user's real
// closet product list + trade pricing once provided.
//
// Like the synthetic APPLIANCES array, closet parts are not DB cabinet rows.
// They carry id = 0 so the cabinet pricing engine skips them; the closet build
// sheet prices them from `priceUsd` here instead.
//
// All dimensions are in inches. `placement` reuses the existing buckets so the
// parts flow through the same canvas / footprint / elevation pipeline:
//   - "tall"  → full-height vertical panels & drawer towers (floor to top)
//   - "base"  → floor-based units (shoe shelves, lower drawer banks)
//   - "wall"  → wall-hung / track-mounted sections (rods, upper shelves)

import type { DesignCabinet, Placement } from "./design";

export interface ClosetPartDef {
  key: string;
  masterCode: string;
  description: string;
  category: string;       // palette grouping (Panels, Shelves, Hanging, Drawers, Accessories)
  width: number;
  depth: number;
  height: number;
  placement: Placement;
  numberOfDoors: number;
  numberOfDrawers: number;
  priceUsd: number;       // placeholder unit price
}

// Standard closet panel depth and system height (placeholder defaults).
export const CLOSET_PANEL_DEPTH = 14;
export const CLOSET_SYSTEM_HEIGHT = 84;

export const CLOSET_PARTS: ClosetPartDef[] = [
  // ── Vertical panels (the uprights that divide the system into sections) ──
  { key: "panel-84", masterCode: "CL-PNL-1484", description: 'Closet Panel 14"D × 84"H', category: "Panels", width: 1, depth: CLOSET_PANEL_DEPTH, height: 84, placement: "tall", numberOfDoors: 0, numberOfDrawers: 0, priceUsd: 39 },
  { key: "panel-72", masterCode: "CL-PNL-1472", description: 'Closet Panel 14"D × 72"H', category: "Panels", width: 1, depth: CLOSET_PANEL_DEPTH, height: 72, placement: "tall", numberOfDoors: 0, numberOfDrawers: 0, priceUsd: 34 },
  { key: "panel-16-84", masterCode: "CL-PNL-1684", description: 'Closet Panel 16"D × 84"H', category: "Panels", width: 1, depth: 16, height: 84, placement: "tall", numberOfDoors: 0, numberOfDrawers: 0, priceUsd: 44 },

  // ── Shelves (fixed / adjustable) ──
  { key: "shelf-24", masterCode: "CL-SHF-24", description: 'Closet Shelf 24"W', category: "Shelves", width: 24, depth: CLOSET_PANEL_DEPTH, height: 1, placement: "wall", numberOfDoors: 0, numberOfDrawers: 0, priceUsd: 14 },
  { key: "shelf-30", masterCode: "CL-SHF-30", description: 'Closet Shelf 30"W', category: "Shelves", width: 30, depth: CLOSET_PANEL_DEPTH, height: 1, placement: "wall", numberOfDoors: 0, numberOfDrawers: 0, priceUsd: 16 },
  { key: "shelf-36", masterCode: "CL-SHF-36", description: 'Closet Shelf 36"W', category: "Shelves", width: 36, depth: CLOSET_PANEL_DEPTH, height: 1, placement: "wall", numberOfDoors: 0, numberOfDrawers: 0, priceUsd: 19 },

  // ── Hanging rods (single / double hang sections) ──
  { key: "rod-single-30", masterCode: "CL-ROD-S30", description: 'Single Hang Rod Section 30"W', category: "Hanging", width: 30, depth: CLOSET_PANEL_DEPTH, height: 42, placement: "wall", numberOfDoors: 0, numberOfDrawers: 0, priceUsd: 22 },
  { key: "rod-double-30", masterCode: "CL-ROD-D30", description: 'Double Hang Rod Section 30"W', category: "Hanging", width: 30, depth: CLOSET_PANEL_DEPTH, height: 60, placement: "wall", numberOfDoors: 0, numberOfDrawers: 0, priceUsd: 28 },
  { key: "rod-single-36", masterCode: "CL-ROD-S36", description: 'Single Hang Rod Section 36"W', category: "Hanging", width: 36, depth: CLOSET_PANEL_DEPTH, height: 42, placement: "wall", numberOfDoors: 0, numberOfDrawers: 0, priceUsd: 25 },

  // ── Drawer towers / banks (floor-based) ──
  { key: "drawer-3", masterCode: "CL-DWR-3", description: '3-Drawer Tower 24"W', category: "Drawers", width: 24, depth: CLOSET_PANEL_DEPTH, height: 30, placement: "base", numberOfDoors: 0, numberOfDrawers: 3, priceUsd: 119 },
  { key: "drawer-5", masterCode: "CL-DWR-5", description: '5-Drawer Tower 24"W', category: "Drawers", width: 24, depth: CLOSET_PANEL_DEPTH, height: 48, placement: "base", numberOfDoors: 0, numberOfDrawers: 5, priceUsd: 169 },

  // ── Accessories ──
  { key: "hamper", masterCode: "CL-HMP-18", description: 'Tilt-Out Hamper 18"W', category: "Accessories", width: 18, depth: CLOSET_PANEL_DEPTH, height: 30, placement: "base", numberOfDoors: 1, numberOfDrawers: 0, priceUsd: 89 },
  { key: "shoe-30", masterCode: "CL-SHOE-30", description: 'Angled Shoe Shelf 30"W', category: "Accessories", width: 30, depth: CLOSET_PANEL_DEPTH, height: 12, placement: "base", numberOfDoors: 0, numberOfDrawers: 0, priceUsd: 32 },
  { key: "valet", masterCode: "CL-VLT", description: "Pull-Out Valet Rod", category: "Accessories", width: 12, depth: CLOSET_PANEL_DEPTH, height: 2, placement: "wall", numberOfDoors: 0, numberOfDrawers: 0, priceUsd: 18 },
];

// Shape a closet part as a DesignCabinet so it flows through the existing
// palette / placement / build-sheet pipeline. id = 0 so the cabinet pricing
// engine skips it (we price closets from priceUsd separately).
export function closetPartAsDesignCabinet(part: ClosetPartDef): DesignCabinet {
  return {
    id: 0,
    masterCode: part.masterCode,
    description: part.description,
    category: part.category,
    subCategory: null,
    width: String(part.width),
    height: String(part.height),
    depth: String(part.depth),
    placement: part.placement,
    numberOfDoors: part.numberOfDoors,
    numberOfDrawers: part.numberOfDrawers,
    isCornerCabinet: false,
  };
}

export function closetPaletteByCategory(): { category: string; items: DesignCabinet[] }[] {
  const order = ["Panels", "Shelves", "Hanging", "Drawers", "Accessories"];
  const groups = new Map<string, DesignCabinet[]>();
  for (const p of CLOSET_PARTS) {
    const list = groups.get(p.category) ?? [];
    list.push(closetPartAsDesignCabinet(p));
    groups.set(p.category, list);
  }
  return order
    .filter((c) => groups.has(c))
    .map((category) => ({ category, items: groups.get(category)! }));
}

// Look up a closet part's placeholder unit price by master code.
export function closetPartPrice(masterCode: string): number {
  const part = CLOSET_PARTS.find((p) => p.masterCode === masterCode);
  return part ? part.priceUsd : 0;
}

export function isClosetPart(masterCode: string): boolean {
  return CLOSET_PARTS.some((p) => p.masterCode === masterCode);
}
