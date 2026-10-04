import type { RoomData, WallOpening } from "./design";

/** Planning-room dimensions only; these are not manufacturer cabinet or door SKUs. */
export interface ReachInClosetPreset {
  id: string;
  label: string;
  widthIn: number;
  depthIn: number;
  nominalBifoldOpeningIn: number;
  description: string;
}

export const REACH_IN_CLOSET_PRESETS: readonly ReachInClosetPreset[] = [
  {
    id: "reach-in-72-24-bifold-60",
    label: "Classic bedroom reach-in",
    widthIn: 72,
    depthIn: 24,
    nominalBifoldOpeningIn: 60,
    description: "6 ft wide × 24 in deep · 60 in bi-fold opening",
  },
  {
    id: "reach-in-78-30-bifold-60",
    label: "Roomy bedroom reach-in",
    widthIn: 78,
    depthIn: 30,
    nominalBifoldOpeningIn: 60,
    description: "6½ ft wide × 30 in deep · 60 in bi-fold opening",
  },
  {
    id: "reach-in-84-30-bifold-72",
    label: "Wide bedroom reach-in",
    widthIn: 84,
    depthIn: 30,
    nominalBifoldOpeningIn: 72,
    description: "7 ft wide × 30 in deep · 72 in bi-fold opening",
  },
] as const;

/** The front/bottom wall has a generic architectural door opening, not a sellable closet door SKU. */
export function roomFromReachInPreset(preset: ReachInClosetPreset, openingUid: string): {
  room: RoomData;
  openings: WallOpening[];
} {
  if (!Number.isFinite(preset.widthIn) || !Number.isFinite(preset.depthIn)
    || !Number.isFinite(preset.nominalBifoldOpeningIn)
    || preset.depthIn < 24 || preset.nominalBifoldOpeningIn < 24
    || preset.nominalBifoldOpeningIn >= preset.widthIn || !openingUid) {
    throw new Error("A reach-in room requires a valid width, depth, opening and opening identifier.");
  }
  const room: RoomData = { width: preset.widthIn, depth: preset.depthIn, ceilingHeight: 96 };
  const opening: WallOpening = {
    uid: openingUid,
    kind: "door",
    doorStyle: "bifold",
    label: `Bi-fold closet opening ${preset.nominalBifoldOpeningIn}\" (planning size)`,
    side: "bottom",
    offset: (preset.widthIn - preset.nominalBifoldOpeningIn) / 2,
    width: preset.nominalBifoldOpeningIn,
    height: 80,
    sill: 0,
  };
  return { room, openings: [opening] };
}
