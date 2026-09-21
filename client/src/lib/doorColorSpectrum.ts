import { resolveSwatch, type DoorStyleLike } from "@/components/DoorStyleSwatch";

/** Minimum number of styles visible together in the storefront color rail. */
export const DOOR_COLOR_SPECTRUM_PAGE_SIZE = 6;

export type DoorColorSpectrumStyle = DoorStyleLike & {
  id: number;
  featuredRank?: number | null;
};

function hexLuminance(hex: string): number {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized.length === 3
    ? normalized.split("").map((part) => `${part}${part}`).join("")
    : normalized, 16);
  if (!Number.isFinite(value)) return 0;
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
}

/**
 * Orders the actual door samples from lightest to darkest. Featured rank only
 * breaks ties, so the admin can still order nearly identical white, gray, or
 * black finishes without defeating the customer-facing white-to-black flow.
 */
export function orderDoorStylesByColor<T extends DoorColorSpectrumStyle>(styles: readonly T[]): T[] {
  return [...styles].sort((left, right) => {
    const lightnessDifference = hexLuminance(resolveSwatch(right).face) - hexLuminance(resolveSwatch(left).face);
    if (Math.abs(lightnessDifference) > 0.02) return lightnessDifference;
    const rankDifference = Number(left.featuredRank ?? 0) - Number(right.featuredRank ?? 0);
    if (rankDifference !== 0) return rankDifference;
    return (left.ourName ?? left.aliasName ?? left.styleCode ?? "").localeCompare(
      right.ourName ?? right.aliasName ?? right.styleCode ?? "",
    );
  });
}

/** Returns the representative finish color used for a rail marker. */
export function doorStyleColorHex(style: DoorStyleLike): string {
  return resolveSwatch(style).face;
}

/** Creates a continuous white-to-dark color line from the ordered samples. */
export function doorColorSpectrumGradient(styles: readonly DoorStyleLike[]): string {
  if (styles.length === 0) return "linear-gradient(90deg, #f4f2ec, #2a2a2c)";
  if (styles.length === 1) {
    const color = doorStyleColorHex(styles[0]);
    return `linear-gradient(90deg, ${color}, ${color})`;
  }
  const stops = styles.map((style, index) => {
    const offset = Math.round((index / (styles.length - 1)) * 100);
    return `${doorStyleColorHex(style)} ${offset}%`;
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

export function doorColorSpectrumPageCount(styles: readonly DoorStyleLike[]): number {
  return Math.max(1, Math.ceil(styles.length / DOOR_COLOR_SPECTRUM_PAGE_SIZE));
}

export function doorColorSpectrumPage<T extends DoorStyleLike>(styles: readonly T[], page: number): T[] {
  const pageCount = doorColorSpectrumPageCount(styles);
  const boundedPage = Math.max(0, Math.min(pageCount - 1, page));
  const start = boundedPage * DOOR_COLOR_SPECTRUM_PAGE_SIZE;
  return styles.slice(start, start + DOOR_COLOR_SPECTRUM_PAGE_SIZE);
}
