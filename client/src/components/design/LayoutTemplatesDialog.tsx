/**
 * LayoutTemplatesDialog — "Start from a template" picker for the design tool.
 *
 * Offers 5 classic kitchen layout starters:
 *   1. Single Wall   — all cabinets on the back wall
 *   2. Galley        — cabinets on back + front walls
 *   3. L-Shape       — back + left walls
 *   4. U-Shape       — back + left + right walls
 *   5. Island        — L-Shape + centre island note
 *
 * The component calls onApply(room, placed, island?) and the parent
 * (DesignTool) applies the state.
 */
import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type RoomData,
  type PlacedCabinet,
  type IslandZone,
  type WallSide,
  makeUid,
  wallPlacementAt,
  DEFAULT_CEILING_HEIGHT,
} from "@/lib/design";

// ─── Template definitions ────────────────────────────────────────────────────

export interface LayoutTemplate {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  build: () => { room: RoomData; placed: PlacedCabinet[]; island?: IslandZone | null };
}

// ─── Cabinet builder helpers ─────────────────────────────────────────────────

function makeCab(
  masterCode: string,
  description: string,
  placement: "base" | "wall",
  side: WallSide,
  along: number,
  w: number,
  h: number,
  d: number,
  room: RoomData,
  mountBottom?: number,
): PlacedCabinet {
  const spot = wallPlacementAt(along, w, d, side, room);
  return {
    uid: makeUid(),
    cabinetId: 0,
    masterCode,
    description,
    category: placement === "base" ? "Base" : "Wall",
    subCategory: null,
    placement,
    x: spot.x,
    y: spot.y,
    width: w,
    nominalWidth: w,
    depth: d,
    nominalDepth: d,
    height: h,
    nominalHeight: h,
    rotation: spot.rotation,
    mountBottom: mountBottom ?? (placement === "wall" ? 54 : null),
    styleId: null,
    numberOfDoors: null,
    numberOfDrawers: null,
    catalogImageUrl: null,
    pullMin: null,
    pullMax: null,
  };
}

function b(side: WallSide, along: number, w: number, room: RoomData): PlacedCabinet {
  return makeCab(`B${w}`, `Base ${w}"`, "base", side, along, w, 34.5, 24, room);
}

function wc(side: WallSide, along: number, w: number, room: RoomData): PlacedCabinet {
  return makeCab(`W${w}30`, `Wall ${w}"×30"`, "wall", side, along, w, 30, 12, room);
}

// ─── Layout builders ─────────────────────────────────────────────────────────

function buildSingleWall(): { room: RoomData; placed: PlacedCabinet[] } {
  const room: RoomData = { width: 144, depth: 96, ceilingHeight: DEFAULT_CEILING_HEIGHT };
  const placed: PlacedCabinet[] = [
    b("top", 0, 30, room), b("top", 30, 36, room), b("top", 66, 36, room), b("top", 102, 30, room),
    wc("top", 0, 30, room), wc("top", 30, 36, room), wc("top", 66, 36, room), wc("top", 102, 30, room),
  ];
  return { room, placed };
}

function buildGalley(): { room: RoomData; placed: PlacedCabinet[] } {
  const room: RoomData = { width: 144, depth: 120, ceilingHeight: DEFAULT_CEILING_HEIGHT };
  const placed: PlacedCabinet[] = [
    b("top", 0, 30, room), b("top", 30, 36, room), b("top", 66, 36, room), b("top", 102, 30, room),
    wc("top", 0, 30, room), wc("top", 30, 36, room), wc("top", 66, 36, room), wc("top", 102, 30, room),
    b("bottom", 0, 30, room), b("bottom", 30, 36, room), b("bottom", 66, 36, room), b("bottom", 102, 30, room),
    wc("bottom", 0, 30, room), wc("bottom", 30, 36, room), wc("bottom", 66, 36, room), wc("bottom", 102, 30, room),
  ];
  return { room, placed };
}

function buildLShape(): { room: RoomData; placed: PlacedCabinet[] } {
  const room: RoomData = { width: 144, depth: 120, ceilingHeight: DEFAULT_CEILING_HEIGHT };
  const placed: PlacedCabinet[] = [
    // Back wall
    b("top", 0, 30, room), b("top", 30, 36, room), b("top", 66, 36, room), b("top", 102, 30, room),
    wc("top", 0, 30, room), wc("top", 30, 36, room), wc("top", 66, 36, room), wc("top", 102, 30, room),
    // Left wall
    b("left", 0, 24, room), b("left", 24, 30, room), b("left", 54, 30, room),
    wc("left", 0, 24, room), wc("left", 24, 30, room), wc("left", 54, 30, room),
  ];
  return { room, placed };
}

function buildUShape(): { room: RoomData; placed: PlacedCabinet[] } {
  const room: RoomData = { width: 168, depth: 144, ceilingHeight: DEFAULT_CEILING_HEIGHT };
  const placed: PlacedCabinet[] = [
    // Back wall
    b("top", 0, 30, room), b("top", 30, 36, room), b("top", 66, 36, room), b("top", 102, 36, room), b("top", 138, 30, room),
    wc("top", 0, 30, room), wc("top", 30, 36, room), wc("top", 66, 36, room), wc("top", 102, 36, room), wc("top", 138, 30, room),
    // Left wall
    b("left", 0, 24, room), b("left", 24, 30, room), b("left", 54, 30, room),
    wc("left", 0, 24, room), wc("left", 24, 30, room), wc("left", 54, 30, room),
    // Right wall
    b("right", 0, 24, room), b("right", 24, 30, room), b("right", 54, 30, room),
    wc("right", 0, 24, room), wc("right", 24, 30, room), wc("right", 54, 30, room),
  ];
  return { room, placed };
}

function buildIsland(): { room: RoomData; placed: PlacedCabinet[]; island: IslandZone } {
  const { room: lRoom, placed } = buildLShape();
  const room: RoomData = { ...lRoom, width: 192, depth: 168 };
  // Re-build placed with the bigger room so wall placements are correct
  const placed2: PlacedCabinet[] = [
    b("top", 0, 30, room), b("top", 30, 36, room), b("top", 66, 36, room), b("top", 102, 30, room),
    wc("top", 0, 30, room), wc("top", 30, 36, room), wc("top", 66, 36, room), wc("top", 102, 30, room),
    b("left", 0, 24, room), b("left", 24, 30, room), b("left", 54, 30, room),
    wc("left", 0, 24, room), wc("left", 24, 30, room), wc("left", 54, 30, room),
  ];
  void placed; // suppress unused warning
  const island: IslandZone = { x: 72, y: 60, width: 48, depth: 36 };
  return { room, placed: placed2, island };
}

// ─── Icon SVGs ───────────────────────────────────────────────────────────────

function SingleWallIcon() {
  return (
    <svg viewBox="0 0 80 60" className="w-full h-full" fill="none">
      <rect x="4" y="4" width="72" height="52" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <rect x="4" y="4" width="72" height="10" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="8" y="18" width="64" height="6" rx="1" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

function GalleyIcon() {
  return (
    <svg viewBox="0 0 80 60" className="w-full h-full" fill="none">
      <rect x="4" y="4" width="72" height="52" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <rect x="4" y="4" width="72" height="10" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="4" y="46" width="72" height="10" rx="1" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

function LShapeIcon() {
  return (
    <svg viewBox="0 0 80 60" className="w-full h-full" fill="none">
      <rect x="4" y="4" width="72" height="52" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <rect x="4" y="4" width="72" height="10" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="4" y="4" width="10" height="52" rx="1" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

function UShapeIcon() {
  return (
    <svg viewBox="0 0 80 60" className="w-full h-full" fill="none">
      <rect x="4" y="4" width="72" height="52" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <rect x="4" y="4" width="72" height="10" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="4" y="4" width="10" height="52" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="66" y="4" width="10" height="52" rx="1" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

function IslandIcon() {
  return (
    <svg viewBox="0 0 80 60" className="w-full h-full" fill="none">
      <rect x="4" y="4" width="72" height="52" rx="2" stroke="currentColor" strokeWidth="1.5" opacity="0.3" />
      <rect x="4" y="4" width="72" height="10" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="4" y="4" width="10" height="52" rx="1" fill="currentColor" opacity="0.7" />
      <rect x="26" y="24" width="30" height="16" rx="2" fill="currentColor" opacity="0.45" />
    </svg>
  );
}

// ─── Template list ────────────────────────────────────────────────────────────

export const LAYOUT_TEMPLATES: LayoutTemplate[] = [
  {
    id: "single-wall",
    label: "Single Wall",
    description: "All cabinets along one wall. Great for narrow kitchens.",
    icon: <SingleWallIcon />,
    build: buildSingleWall,
  },
  {
    id: "galley",
    label: "Galley",
    description: "Two parallel runs of cabinets. Efficient workflow.",
    icon: <GalleyIcon />,
    build: buildGalley,
  },
  {
    id: "l-shape",
    label: "L-Shape",
    description: "Cabinets on two adjacent walls. The most common layout.",
    icon: <LShapeIcon />,
    build: buildLShape,
  },
  {
    id: "u-shape",
    label: "U-Shape",
    description: "Cabinets on three walls. Maximum storage and counter space.",
    icon: <UShapeIcon />,
    build: buildUShape,
  },
  {
    id: "island",
    label: "L-Shape + Island",
    description: "L-shape with a centre island. Ideal for open-plan kitchens.",
    icon: <IslandIcon />,
    build: buildIsland,
  },
];

// ─── Dialog component ─────────────────────────────────────────────────────────

interface LayoutTemplatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (room: RoomData, placed: PlacedCabinet[], island?: IslandZone | null) => void;
}

export function LayoutTemplatesDialog({
  open,
  onOpenChange,
  onApply,
}: LayoutTemplatesDialogProps) {
  const [selected, setSelected] = useState<string | null>(null);

  function handleApply() {
    const tpl = LAYOUT_TEMPLATES.find((t) => t.id === selected);
    if (!tpl) return;
    const { room, placed, island } = tpl.build();
    onApply(room, placed, island);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Choose a Starter Layout</DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Pick a layout to pre-populate your room with cabinets. You can add, remove, or resize
            anything after.
          </p>
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 py-2">
          {LAYOUT_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => setSelected(tpl.id)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border-2 p-3 text-left transition-all",
                selected === tpl.id
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border hover:border-primary/50 hover:bg-muted/40",
              )}
            >
              <div className="w-16 h-12 text-primary/70">{tpl.icon}</div>
              <span className="text-sm font-medium leading-tight text-center">{tpl.label}</span>
              <span className="text-[11px] text-muted-foreground text-center leading-snug line-clamp-2">
                {tpl.description}
              </span>
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!selected} onClick={handleApply}>
            Start with this layout
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
