/**
 * Returns the public-facing display name for a door style.
 *
 * Priority: aliasName → ourName → styleCode
 * When seriesName is provided (and displayMode is "series"), appends it in
 * parentheses: "Lumina White (Ashford)"
 *
 * - aliasName:   the white-label name set in CD_STANDARDS (e.g. "Lumina White").
 *                When set, it is the COMPLETE public name — seriesName is NOT appended.
 * - ourName:     the internal platform name (e.g. "Lumina White")
 * - styleCode:   fallback code (e.g. "ASP")
 * - seriesName:  the series name for the distributor (e.g. "Ashford", "Madison")
 * - displayMode: when "series" (or null), the seriesName is appended — but only
 *                when aliasName is absent.
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
  // When an aliasName is explicitly set, it is the complete public name — do NOT
  // append the series name, as the alias already encodes the desired branding.
  if (style.aliasName?.trim()) return base;
  // For styles without an alias, append series name in parentheses when
  // displayMode is "series" (or null, which defaults to series mode).
  if (style.seriesName && (style.displayMode === "series" || style.displayMode == null)) {
    return `${base} (${style.seriesName})`;
  }
  return base;
}
