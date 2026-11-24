// Per-line door style labels.
//
// An order may mix finishes from one supplier. The order-level style name is
// only a summary. Each cabinet line keeps the name, color, and finish of its
// own door_styles row. Pelican and hardware lines have no door style.

export type DoorStyleNameFields = {
  id?: number;
  distributorId?: number | null;
  ourName?: string | null;
  aliasName?: string | null;
  distributorName?: string | null;
  doorStyle?: string | null;
  color?: string | null;
  finish?: string | null;
};

export type StyleLabelLine = {
  styleId?: number | null;
  doorStyle?: string | null;
  productKind?: string | null;
  distributorId?: number | null;
};

const IMAGE_MARKUP = /<img\b[^>]*>/gi;
const IMAGE_URL = /https?:\/\/\S+/gi;

export function cleanStyleText(value: string | null | undefined): string {
  return value?.replace(IMAGE_MARKUP, " ").replace(IMAGE_URL, " ").replace(/\s+/g, " ").trim() ?? "";
}

export function isNonCabinetLine(line: { productKind?: string | null }): boolean {
  return line.productKind === "surface" || line.productKind === "hardware";
}

export function positiveStyleId(value: unknown): number | null {
  const id = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : null;
  return id != null && Number.isInteger(id) && id > 0 ? id : null;
}

/** Customer-facing name of this style. Never another style's name. */
export function doorStyleOwnName(style: DoorStyleNameFields | null | undefined): string | null {
  const name = cleanStyleText(style?.aliasName) || cleanStyleText(style?.ourName) || cleanStyleText(style?.distributorName);
  return name || null;
}

/**
 * Name, then color and finish when those words are not already in the name.
 * `nameOverride` is an affiliate brand name for this same styleId, not a
 * client-supplied label and not the order-level style.
 */
export function composeDoorStyleLabel(
  style: DoorStyleNameFields | null | undefined,
  nameOverride?: string | null,
): string | null {
  const name = cleanStyleText(nameOverride) || doorStyleOwnName(style) || cleanStyleText(style?.doorStyle);
  if (!name && !style) return null;
  const extras: string[] = [];
  for (const part of [style?.color, style?.finish]) {
    const text = cleanStyleText(part);
    if (!text) continue;
    const haystack = [name, ...extras].join(" ").toLowerCase();
    if (haystack.includes(text.toLowerCase())) continue;
    extras.push(text);
  }
  const label = [name, ...extras].filter(Boolean).join(" · ");
  return label || null;
}

/**
 * Admin color/finish. Uses this style's color and finish. When both are empty,
 * uses this style's own name. Does not accept an order-level name.
 */
export function lineColorFinishLabel(style: DoorStyleNameFields | null | undefined): string | null {
  if (!style) return null;
  const color = cleanStyleText(style.color);
  const finish = cleanStyleText(style.finish);
  if (color || finish) return [color, finish].filter(Boolean).join(" · ");
  return doorStyleOwnName(style);
}

/** Display label for one line. A styleId lookup wins over the stored client string. */
export function resolvedLineStyleLabel(
  line: StyleLabelLine,
  styles: ReadonlyMap<number, DoorStyleNameFields>,
): string | null {
  if (isNonCabinetLine(line)) return null;
  const styleId = positiveStyleId(line.styleId);
  if (styleId != null) {
    const fromStyle = composeDoorStyleLabel(styles.get(styleId));
    if (fromStyle) return fromStyle;
  }
  return cleanStyleText(line.doorStyle) || null;
}

export function checkoutLineDescription(
  line: { masterCode?: string | null; rawCode?: string | null; description?: string | null },
  styleLabel: string | null | undefined,
): string {
  const code = cleanStyleText(line.masterCode) || cleanStyleText(line.rawCode) || "Cabinet";
  const detail = cleanStyleText(line.description);
  const style = cleanStyleText(styleLabel);
  return [code, detail, style].filter(Boolean).join(" — ");
}

export function orderStyleSummary(labels: Array<string | null | undefined>, maxLength = 128): string | null {
  const distinct: string[] = [];
  for (const label of labels) {
    const text = cleanStyleText(label);
    if (!text || distinct.some((existing) => existing.toLowerCase() === text.toLowerCase())) continue;
    distinct.push(text);
  }
  if (distinct.length === 0) return null;
  const joined = distinct.join(", ");
  return joined.length <= maxLength ? joined : `${joined.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
