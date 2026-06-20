// ─── Kitchen Floor-Plan Package definitions ─────────────────────────────────
// Each package is a standard kitchen layout sold as a single bundle. The BOM
// lists the cabinet master codes + quantity; the `layout` describes where each
// cabinet sits on the design-tool canvas (inches, x/y from the back-left corner)
// so a member can load the whole kitchen into the designer with one click.
//
// Spec note: we deliberately match how online competitors build their
// advertised "10x10 kitchen" — a budget configuration with a Blind Corner Base
// (BBC-36), 30" walls, minimal drawers — so our price is a true apples-to-apples
// comparison. Cabinet Dealz packages are available ASSEMBLED or FLAT-PACK (RTA):
// flat-pack ships denser with lower damage risk and freight, while assembled saves
// on-site install labor. Pricing below includes the +$30/cabinet assembly option so
// the comparison stays conservative.

export type PackagePlacement = "base" | "wall" | "tall";

export interface PackageLayoutItem {
  masterCode: string;
  placement: PackagePlacement;
  x: number; // inches from left wall
  y: number; // inches from back wall
  rotation: number; // 0 | 90 | 180 | 270
}

export interface PackageBomItem {
  masterCode: string;
  qty: number;
  role: string;
}

export interface KitchenPackage {
  slug: string;
  name: string;
  shape: string;
  blurb: string;
  cabinetCount: number;
  room: { width: number; depth: number }; // inches
  bom: PackageBomItem[];
  layout: PackageLayoutItem[];
  // Competitor assembled white-shaker package prices (snapshot benchmark)
  competitors: { name: string; price: number }[];
  // Suggested affiliate retail factor applied to competitor average (e.g. 0.97)
  retailFactor: number;
  cornerUpgrade?: { masterCode: string; label: string; note: string };
}

// Competitor snapshots (assembled white shaker). They run frequent sales; these
// are planning benchmarks, not live quotes.
const L_COMPS = [
  { name: "RTA Store", price: 3210 },
  { name: "Lily Ann", price: 3450 },
  { name: "Cabinet Kings", price: 3640 },
];
const U_COMPS = [
  { name: "RTA Store", price: 3850 },
  { name: "Lily Ann", price: 4150 },
  { name: "Cabinet Kings", price: 4380 },
];
const G_COMPS = [
  { name: "RTA Store", price: 2180 },
  { name: "Lily Ann", price: 2360 },
  { name: "Cabinet Kings", price: 2480 },
];

export const KITCHEN_PACKAGES: KitchenPackage[] = [
  {
    slug: "l-shape-10x10",
    name: "L-Shape 10×10 Kitchen",
    shape: "L-Shape",
    blurb:
      "The industry-standard 10×10 kitchen, built on an L-shaped run with a corner — the benchmark every competitor advertises. Ships your way: assembled or flat-pack.",
    cabinetCount: 11,
    room: { width: 120, depth: 120 },
    bom: [
      { masterCode: "BBC-36", qty: 1, role: "Blind Corner Base (budget corner)" },
      { masterCode: "SB-36", qty: 1, role: 'Sink Base 36"' },
      { masterCode: "B-24", qty: 1, role: 'Base 24" (1-drawer)' },
      { masterCode: "B-18", qty: 1, role: 'Base 18"' },
      { masterCode: "W-30-30", qty: 2, role: "Wall 30×30" },
      { masterCode: "W-24-30", qty: 1, role: "Wall 24×30" },
      { masterCode: "W-18-30", qty: 1, role: "Wall 18×30" },
      { masterCode: "WBC-24-30", qty: 1, role: "Wall Blind/Diagonal Corner" },
      { masterCode: "W-36-15", qty: 1, role: "Wall 36×15 (over fridge)" },
      { masterCode: "W-30-15", qty: 1, role: "Wall 30×15 (over range)" },
    ],
    // Back wall run (y=0) + left wall run (x=0) forming the L.
    layout: [
      // Back wall bases (left → right)
      { masterCode: "BBC-36", placement: "base", x: 0, y: 0, rotation: 0 },
      { masterCode: "SB-36", placement: "base", x: 36, y: 0, rotation: 0 },
      { masterCode: "B-24", placement: "base", x: 72, y: 0, rotation: 0 },
      { masterCode: "B-18", placement: "base", x: 96, y: 0, rotation: 0 },
      // Back wall uppers
      { masterCode: "WBC-24-30", placement: "wall", x: 0, y: 0, rotation: 0 },
      { masterCode: "W-30-15", placement: "wall", x: 24, y: 0, rotation: 0 },
      { masterCode: "W-30-30", placement: "wall", x: 54, y: 0, rotation: 0 },
      { masterCode: "W-18-30", placement: "wall", x: 84, y: 0, rotation: 0 },
      { masterCode: "W-36-15", placement: "wall", x: 102, y: 0, rotation: 0 },
      // Left wall run (rotated 90°, marching down from corner)
      { masterCode: "W-30-30", placement: "wall", x: 0, y: 30, rotation: 90 },
      { masterCode: "W-24-30", placement: "wall", x: 0, y: 60, rotation: 90 },
    ],
    competitors: L_COMPS,
    retailFactor: 0.97,
    cornerUpgrade: {
      masterCode: "LSB36",
      label: "Lazy Susan ER36 corner upgrade",
      note: "Swap the blind corner for a full 36\" Lazy Susan (Easy-Reach) corner — adds approx. $257 to landed cost.",
    },
  },
  {
    slug: "u-shape-10x12",
    name: "U-Shape 10×12 Kitchen",
    shape: "U-Shape",
    blurb:
      "A roomier U-shaped kitchen with three runs and a corner — more storage and counter space, still priced as one bundle. Assembled or flat-pack, your choice.",
    cabinetCount: 12,
    room: { width: 120, depth: 144 },
    bom: [
      { masterCode: "BBC-36", qty: 1, role: "Blind Corner Base (budget corner)" },
      { masterCode: "SB-36", qty: 1, role: 'Sink Base 36"' },
      { masterCode: "B-30", qty: 1, role: 'Base 30"' },
      { masterCode: "B-24", qty: 1, role: 'Base 24"' },
      { masterCode: "B-18", qty: 1, role: 'Base 18"' },
      { masterCode: "W-30-30", qty: 2, role: "Wall 30×30" },
      { masterCode: "W-24-30", qty: 1, role: "Wall 24×30" },
      { masterCode: "W-18-30", qty: 1, role: "Wall 18×30" },
      { masterCode: "WBC-24-30", qty: 1, role: "Wall Corner" },
      { masterCode: "W-36-15", qty: 1, role: "Wall 36×15" },
      { masterCode: "W-30-15", qty: 1, role: "Wall 30×15" },
    ],
    layout: [
      { masterCode: "BBC-36", placement: "base", x: 0, y: 0, rotation: 0 },
      { masterCode: "SB-36", placement: "base", x: 36, y: 0, rotation: 0 },
      { masterCode: "B-30", placement: "base", x: 72, y: 0, rotation: 0 },
      { masterCode: "B-24", placement: "base", x: 0, y: 30, rotation: 90 },
      { masterCode: "B-18", placement: "base", x: 102, y: 0, rotation: 0 },
      { masterCode: "WBC-24-30", placement: "wall", x: 0, y: 0, rotation: 0 },
      { masterCode: "W-30-15", placement: "wall", x: 24, y: 0, rotation: 0 },
      { masterCode: "W-30-30", placement: "wall", x: 54, y: 0, rotation: 0 },
      { masterCode: "W-18-30", placement: "wall", x: 84, y: 0, rotation: 0 },
      { masterCode: "W-36-15", placement: "wall", x: 102, y: 0, rotation: 0 },
      { masterCode: "W-30-30", placement: "wall", x: 0, y: 30, rotation: 90 },
      { masterCode: "W-24-30", placement: "wall", x: 0, y: 60, rotation: 90 },
    ],
    competitors: U_COMPS,
    retailFactor: 0.97,
    cornerUpgrade: {
      masterCode: "LSB36",
      label: "Lazy Susan ER36 corner upgrade",
      note: "Swap the blind corner for a full 36\" Lazy Susan (Easy-Reach) corner — adds approx. $257 to landed cost.",
    },
  },
  {
    slug: "galley-10x10",
    name: "Galley / One-Wall 10×10 Kitchen",
    shape: "Galley",
    blurb:
      "A compact, no-corner single-wall (or galley) layout — our most affordable package, great for apartments, rentals, and ADUs. Assembled or flat-pack.",
    cabinetCount: 7,
    room: { width: 120, depth: 96 },
    bom: [
      { masterCode: "SB-36", qty: 1, role: 'Sink Base 36"' },
      { masterCode: "B-24", qty: 1, role: 'Base 24"' },
      { masterCode: "B-18", qty: 1, role: 'Base 18"' },
      { masterCode: "W-30-30", qty: 2, role: "Wall 30×30" },
      { masterCode: "W-18-30", qty: 1, role: "Wall 18×30" },
      { masterCode: "W-36-15", qty: 1, role: "Wall 36×15" },
    ],
    layout: [
      { masterCode: "SB-36", placement: "base", x: 0, y: 0, rotation: 0 },
      { masterCode: "B-24", placement: "base", x: 36, y: 0, rotation: 0 },
      { masterCode: "B-18", placement: "base", x: 60, y: 0, rotation: 0 },
      { masterCode: "W-30-30", placement: "wall", x: 0, y: 0, rotation: 0 },
      { masterCode: "W-30-30", placement: "wall", x: 30, y: 0, rotation: 0 },
      { masterCode: "W-18-30", placement: "wall", x: 60, y: 0, rotation: 0 },
      { masterCode: "W-36-15", placement: "wall", x: 78, y: 0, rotation: 0 },
    ],
    competitors: G_COMPS,
    retailFactor: 0.97,
  },
];

export function getPackage(slug: string): KitchenPackage | undefined {
  return KITCHEN_PACKAGES.find((p) => p.slug === slug);
}

export function competitorAvg(p: KitchenPackage): number {
  return p.competitors.reduce((s, c) => s + c.price, 0) / p.competitors.length;
}
