/**
 * Returns the public-facing display name for a door style.
 *
 * Priority: aliasName → ourName → styleCode
 * When seriesName is provided (and displayMode is "series"), appends it in
 * parentheses: "Lumina White (Ashford)"
 *
 * - aliasName:   the white-label name set in CD_STANDARDS (e.g. "Lumina White")
 * - ourName:     the internal platform name (e.g. "Lumina White")
 * - styleCode:   fallback code (e.g. "ASP")
 * - seriesName:  the series name for the distributor (e.g. "Ashford", "Madison")
 * - displayMode: when "series", the seriesName is appended
 *
 * Use this everywhere a door style name is shown to customers or in the designer.
 * Admin panels may show ourName directly for clarity.
 */
export function styleDisplayName(style: {
  aliasName?: string | null;
  ourName?: string | null;
  styleCode?: string | null;
  seriesName?: string | null;
  displayMode?: string | null;
}): string {
  const base = style.aliasName || style.ourName || style.styleCode || "";
  if (!base) return "";
  // Append series name in parentheses when displayMode is "series" and seriesName is set
  if (style.seriesName && (style.displayMode === "series" || style.displayMode == null)) {
    return `${base} (${style.seriesName})`;
  }
  return base;
}
