/**
 * Confirmed door color source choice for a door style (Tom, Nov 12 2026).
 *
 * The door editor selector (cabinet-frontend PR 389) has four mutually exclusive
 * options. Only an explicit, confirmed choice is stored:
 *
 *   original-image      supplier-uploaded door photo
 *   approved-ai-image   the accepted AI render
 *   sherwin-williams    a confirmed Sherwin-Williams chip (code, name, hex, …)
 *   hex                 a confirmed hand-picked hex
 *
 * NULL columns mean "nothing chosen": the door keeps its current color order.
 * This module never starts or changes AI image generation.
 */
import { z } from "zod";

export const DOOR_COLOR_SOURCES = ["original-image", "approved-ai-image", "sherwin-williams", "hex"] as const;
export type DoorColorSourceOption = (typeof DOOR_COLOR_SOURCES)[number];

const HEX = /^#[0-9a-f]{6}$/i;

function normalizeHex(value: string): string {
  return value.toLowerCase();
}

const sherwinColorSchema = z.object({
  finish: z.enum(["stain", "paint"]),
  code: z.string(),
  label: z.string(),
  hex: z.string().regex(HEX).transform(normalizeHex),
  woodSpecies: z.string().nullable(),
  grainDirection: z.enum(["horizontal", "vertical", "none"]),
  profileImageUrl: z.string().nullable(),
});

/** Admin write payload. Unconfirmed Sherwin-Williams or Hex picks are rejected. */
export const doorColorSourceSelectionInput = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("original-image"),
    chosenAt: z.string().optional(),
  }),
  z.object({
    source: z.literal("approved-ai-image"),
    chosenAt: z.string().optional(),
  }),
  z.object({
    source: z.literal("hex"),
    confirmed: z.literal(true),
    chosenAt: z.string().optional(),
    hex: z.string().regex(HEX).transform(normalizeHex),
  }),
  z.object({
    source: z.literal("sherwin-williams"),
    confirmed: z.literal(true),
    chosenAt: z.string().optional(),
    color: sherwinColorSchema,
  }),
]);

export type DoorColorSourceSelection = z.infer<typeof doorColorSourceSelectionInput>;

export type DoorColorSourceColumns = {
  doorColorSource: DoorColorSourceOption | null;
  doorColorSourceValue: Record<string, unknown> | null;
  doorColorSourceUpdatedAt: Date | null;
};

/** All three columns NULL: the style has no explicit choice. */
export const EMPTY_DOOR_COLOR_SOURCE_COLUMNS: DoorColorSourceColumns = {
  doorColorSource: null,
  doorColorSourceValue: null,
  doorColorSourceUpdatedAt: null,
};

export function parseDoorColorSourceSelection(raw: unknown): DoorColorSourceSelection | null {
  const parsed = doorColorSourceSelectionInput.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function toIso(value: Date | string | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return "";
}

function toDate(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

/**
 * Build the TypeScript selection from the three stored columns.
 * Malformed or unknown modes read as "nothing chosen" (null), never throw.
 */
export function selectionFromColumns(row: {
  doorColorSource?: string | null;
  doorColorSourceValue?: unknown;
  doorColorSourceUpdatedAt?: Date | string | null;
} | null | undefined): DoorColorSourceSelection | null {
  if (!row || row.doorColorSource == null || row.doorColorSource === "") return null;
  const chosenAt = toIso(row.doorColorSourceUpdatedAt);
  switch (row.doorColorSource) {
    case "original-image":
    case "approved-ai-image":
      return parseDoorColorSourceSelection({ source: row.doorColorSource, chosenAt });
    case "hex": {
      const value = row.doorColorSourceValue;
      const hex = typeof value === "string"
        ? value
        : value && typeof value === "object" && !Array.isArray(value)
          ? (value as { hex?: unknown }).hex
          : undefined;
      return parseDoorColorSourceSelection({ source: "hex", confirmed: true, chosenAt, hex });
    }
    case "sherwin-williams":
      return parseDoorColorSourceSelection({
        source: "sherwin-williams",
        confirmed: true,
        chosenAt,
        color: row.doorColorSourceValue,
      });
    default:
      return null;
  }
}

/** Map a confirmed selection onto the three columns. */
export function selectionToColumns(
  selection: DoorColorSourceSelection,
  now: Date = new Date(),
): DoorColorSourceColumns {
  const updatedAt = toDate(selection.chosenAt, now);
  if (selection.source === "hex") {
    return {
      doorColorSource: "hex",
      doorColorSourceValue: { hex: selection.hex },
      doorColorSourceUpdatedAt: updatedAt,
    };
  }
  if (selection.source === "sherwin-williams") {
    return {
      doorColorSource: "sherwin-williams",
      doorColorSourceValue: { ...selection.color },
      doorColorSourceUpdatedAt: updatedAt,
    };
  }
  return {
    doorColorSource: selection.source,
    doorColorSourceValue: null,
    doorColorSourceUpdatedAt: updatedAt,
  };
}
