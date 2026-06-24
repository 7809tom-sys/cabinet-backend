// ─── Cabinet hardware (knobs / pulls) specification engine ──────────────────
// Hardware (knobs, bar pulls, cup pulls) is chosen for a design as a FINISHING
// SPEC, not as a priced catalog SKU. The catalog does not carry decorative
// hardware SKUs, so we never invent a price: the design simply records which
// hardware style the customer wants and how many pieces the layout needs, then
// lists that on the build sheet as a finishing note for the installer/shop.
//
// Counting rule (industry convention):
//   • each DOOR gets 1 knob (or 1 pull, depending on style)
//   • each DRAWER gets 1 pull (cup or bar) — knobs are uncommon on wide drawers
// Open shelving, appliances, panels/skins, and fillers carry no hardware.
//
// All logic is pure/deterministic so it can be unit-tested independently of the
// canvas and the database.

import {
  type PlacedCabinet,
  isPanelItem,
} from "./design";

// The hardware styles a customer can spec. "none" means no hardware (e.g. a
// touch-latch / push-to-open job) and produces an empty schedule.
export type HardwareStyleId = "none" | "knob" | "bar-pull" | "cup-pull" | "knob-and-pull";

export interface HardwareStyle {
  id: HardwareStyleId;
  /** Short label for the picker. */
  label: string;
  /** One-line description for tooltips / build-sheet note. */
  description: string;
  /** What goes on a door front. */
  doorPiece: "knob" | "pull" | "none";
  /** What goes on a drawer front. */
  drawerPiece: "knob" | "pull" | "cup" | "none";
}

export const HARDWARE_STYLES: HardwareStyle[] = [
  {
    id: "none",
    label: "None",
    description: "No decorative hardware (push-to-open / touch latch)",
    doorPiece: "none",
    drawerPiece: "none",
  },
  {
    id: "knob",
    label: "Knobs",
    description: "Round knob on every door and drawer",
    doorPiece: "knob",
    drawerPiece: "knob",
  },
  {
    id: "bar-pull",
    label: "Bar Pulls",
    description: "Modern bar (tube) pull on every door and drawer",
    doorPiece: "pull",
    drawerPiece: "pull",
  },
  {
    id: "cup-pull",
    label: "Cup Pulls",
    description: "Cup (bin) pulls on drawers, knobs on doors (classic mix)",
    doorPiece: "knob",
    drawerPiece: "cup",
  },
  {
    id: "knob-and-pull",
    label: "Knobs + Pulls",
    description: "Knobs on doors, bar pulls on drawers",
    doorPiece: "knob",
    drawerPiece: "pull",
  },
];

export const DEFAULT_HARDWARE_STYLE_ID: HardwareStyleId = "none";

/** Look up a hardware style by id, falling back to the default ("none"). */
export function hardwareStyle(id: HardwareStyleId | null | undefined): HardwareStyle {
  return (
    HARDWARE_STYLES.find((s) => s.id === id) ??
    HARDWARE_STYLES.find((s) => s.id === DEFAULT_HARDWARE_STYLE_ID)!
  );
}

// Cabinets that never carry decorative hardware: appliances, panels/skins, and
// unpriced synthetic items (cabinetId 0 = appliance/fixture).
function carriesHardware(p: PlacedCabinet): boolean {
  if (p.placement === "appliance") return false;
  if (p.cabinetId === 0) return false;
  if (isPanelItem(p)) return false;
  return true;
}

/**
 * Infer how many DOORS a placed cabinet shows on its front. Trust the stored
 * door count when present; otherwise fall back to the description/code:
 *  • a drawer-only base (DB-*, "drawer base") shows 0 doors
 *  • everything else shows at least 1 door
 */
export function doorCountForCabinet(p: PlacedCabinet): number {
  if (!carriesHardware(p)) return 0;
  if (typeof p.numberOfDoors === "number") return Math.max(0, p.numberOfDoors);
  const hay = `${p.description ?? ""} ${p.masterCode ?? ""}`.toLowerCase();
  if ((/\bdrawer base\b|^db|drawer\b/.test(hay)) && !/door/.test(hay)) return 0;
  return 1;
}

/**
 * Infer how many DRAWERS a placed cabinet shows. Trust the stored drawer count
 * when present; otherwise read it from the code suffix (DB-24-3 → 3 drawers) or
 * default to 0 (a plain door base has no drawers in this simplified model — the
 * single top drawer of a standard base is left out unless the code says -N).
 */
export function drawerCountForCabinet(p: PlacedCabinet): number {
  if (!carriesHardware(p)) return 0;
  if (typeof p.numberOfDrawers === "number") return Math.max(0, p.numberOfDrawers);
  const code = `${p.masterCode ?? ""}`.toUpperCase();
  const hay = `${p.description ?? ""} ${p.masterCode ?? ""}`.toLowerCase();
  // Drawer base codes encode the stack count as a trailing -N (DB-24-3 → 3).
  if (/^db/i.test(code) || /\bdrawer base\b/.test(hay)) {
    const m = code.match(/-(\d+)\s*$/);
    if (m) return Math.max(1, parseInt(m[1], 10));
    return 3; // unspecified drawer base defaults to a 3-drawer stack
  }
  return 0;
}

export interface HardwarePieceCount {
  /** Round knobs. */
  knobs: number;
  /** Bar / tube pulls. */
  barPulls: number;
  /** Cup (bin) pulls. */
  cupPulls: number;
  /** Total of all pieces. */
  total: number;
}

const EMPTY_COUNT: HardwarePieceCount = { knobs: 0, barPulls: 0, cupPulls: 0, total: 0 };

/**
 * Count the hardware pieces a single placed cabinet needs under a given style.
 * Doors take the style's door piece; drawers take the style's drawer piece.
 */
export function hardwareForCabinet(
  p: PlacedCabinet,
  styleId: HardwareStyleId | null | undefined,
): HardwarePieceCount {
  const style = hardwareStyle(styleId);
  if (style.id === "none") return { ...EMPTY_COUNT };
  if (!carriesHardware(p)) return { ...EMPTY_COUNT };

  const doors = doorCountForCabinet(p);
  const drawers = drawerCountForCabinet(p);

  let knobs = 0;
  let barPulls = 0;
  let cupPulls = 0;

  const add = (piece: HardwareStyle["doorPiece"] | HardwareStyle["drawerPiece"], qty: number) => {
    if (qty <= 0) return;
    if (piece === "knob") knobs += qty;
    else if (piece === "pull") barPulls += qty;
    else if (piece === "cup") cupPulls += qty;
  };

  add(style.doorPiece, doors);
  add(style.drawerPiece, drawers);

  return { knobs, barPulls, cupPulls, total: knobs + barPulls + cupPulls };
}

export interface HardwareSchedule extends HardwarePieceCount {
  styleId: HardwareStyleId;
  styleLabel: string;
  /** How many cabinets contribute at least one piece. */
  cabinetsWithHardware: number;
}

/**
 * Aggregate the whole layout into one hardware schedule (totals by piece type)
 * for the build sheet. Returns a zeroed schedule when the style is "none".
 */
export function hardwareSchedule(
  placed: PlacedCabinet[],
  styleId: HardwareStyleId | null | undefined,
): HardwareSchedule {
  const style = hardwareStyle(styleId);
  let knobs = 0;
  let barPulls = 0;
  let cupPulls = 0;
  let cabinetsWithHardware = 0;

  if (style.id !== "none") {
    for (const p of placed) {
      const c = hardwareForCabinet(p, style.id);
      if (c.total > 0) cabinetsWithHardware += 1;
      knobs += c.knobs;
      barPulls += c.barPulls;
      cupPulls += c.cupPulls;
    }
  }

  return {
    styleId: style.id,
    styleLabel: style.label,
    knobs,
    barPulls,
    cupPulls,
    total: knobs + barPulls + cupPulls,
    cabinetsWithHardware,
  };
}

/**
 * Build a single human-readable build-sheet line for the hardware schedule, or
 * null when there is nothing to list (style "none" or an empty layout). The
 * line is a finishing NOTE — it carries no price because decorative hardware is
 * not a priced catalog SKU.
 */
export function hardwareScheduleNote(schedule: HardwareSchedule): string | null {
  if (schedule.total <= 0) return null;
  const parts: string[] = [];
  if (schedule.knobs > 0) parts.push(`${schedule.knobs} knob${schedule.knobs === 1 ? "" : "s"}`);
  if (schedule.barPulls > 0) parts.push(`${schedule.barPulls} bar pull${schedule.barPulls === 1 ? "" : "s"}`);
  if (schedule.cupPulls > 0) parts.push(`${schedule.cupPulls} cup pull${schedule.cupPulls === 1 ? "" : "s"}`);
  return `Hardware (${schedule.styleLabel}): ${parts.join(", ")} — ${schedule.total} pieces total`;
}
