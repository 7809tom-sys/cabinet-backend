type UnknownRecord = Record<string, unknown>;

export type BundleFloorPlanSnapshot = {
  room?: { width?: unknown; depth?: unknown; persistedEntities?: { sinks?: unknown } };
  placed?: unknown;
};

function numberOr(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function escapeXml(value: unknown): string {
  return String(value ?? "").replace(/[<>&"']/g, (character) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;",
  })[character] ?? character);
}

function footprint(placement: UnknownRecord) {
  const width = numberOr(placement.width, 24);
  const depth = numberOr(placement.depth, 24);
  const rotation = Number(placement.rotation ?? 0);
  return Math.abs(rotation % 180) === 90 ? { width: depth, depth: width } : { width, depth };
}

function fillFor(placement: UnknownRecord): string {
  if (placement.placement === "appliance") return "#d7dee4";
  if (placement.placement === "wall") return "#d8e3ec";
  if (placement.placement === "tall") return "#d9c3a0";
  return "#b88f55";
}

/**
 * Produces a portable SVG floor-plan image entirely from the saved design
 * snapshot. This gives existing bundles the same source-of-truth 2D plan
 * visual without depending on a browser canvas or a manually uploaded image.
 */
export function renderBundleFloorPlanSvg(snapshot: unknown, bundleName?: string | null): string {
  const safeSnapshot = (snapshot && typeof snapshot === "object" ? snapshot : {}) as BundleFloorPlanSnapshot;
  const room = safeSnapshot.room ?? {};
  const roomWidth = numberOr(room.width, 120);
  const roomDepth = numberOr(room.depth, 120);
  const placements = Array.isArray(safeSnapshot.placed) ? safeSnapshot.placed.filter((item): item is UnknownRecord => Boolean(item && typeof item === "object")) : [];
  const sinks = Array.isArray(safeSnapshot.room?.persistedEntities?.sinks)
    ? safeSnapshot.room.persistedEntities.sinks.filter((item): item is UnknownRecord => Boolean(item && typeof item === "object"))
    : [];

  const canvasWidth = 1000;
  const canvasHeight = 720;
  const padding = 68;
  const scale = Math.min((canvasWidth - padding * 2) / roomWidth, (canvasHeight - padding * 2) / roomDepth);
  const plotWidth = roomWidth * scale;
  const plotHeight = roomDepth * scale;
  const offsetX = (canvasWidth - plotWidth) / 2;
  const offsetY = (canvasHeight - plotHeight) / 2;

  const cabinets = placements.map((placement) => {
    const size = footprint(placement);
    const x = offsetX + numberOr(placement.x, 0) * scale;
    const y = offsetY + numberOr(placement.y, 0) * scale;
    const width = size.width * scale;
    const depth = size.depth * scale;
    const masterCode = escapeXml(placement.masterCode ?? "Cabinet");
    const label = width > 34 && depth > 20
      ? `<text x="${(x + 6).toFixed(1)}" y="${(y + Math.min(depth - 5, 19)).toFixed(1)}" fill="#172536" font-family="Arial, sans-serif" font-size="${Math.max(11, Math.min(18, width / 4)).toFixed(1)}">${masterCode}</text>`
      : "";
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${depth.toFixed(1)}" fill="${fillFor(placement)}" stroke="#4a3822" stroke-width="2"/>${label}`;
  }).join("");

  const fixtureMarkers = sinks.map((sink) => {
    const x = offsetX + numberOr(sink.x, 0) * scale;
    const y = offsetY + numberOr(sink.y, 0) * scale;
    const width = numberOr(sink.width, 24) * scale;
    const depth = numberOr(sink.depth, 18) * scale;
    const faucet = sink.faucet === true
      ? `<circle cx="${(x + width / 2).toFixed(1)}" cy="${Math.max(y + 7, y + depth * 0.22).toFixed(1)}" r="${Math.max(3.5, Math.min(7, scale * 1.1)).toFixed(1)}" fill="#d4a75a" stroke="#4a3822" stroke-width="1.5"/>`
      : "";
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${width.toFixed(1)}" height="${depth.toFixed(1)}" rx="${Math.max(2, scale * 0.8).toFixed(1)}" fill="#86b9d6" stroke="#1e5f82" stroke-width="2"/><text x="${(x + 4).toFixed(1)}" y="${(y + Math.min(depth - 4, 16)).toFixed(1)}" fill="#123c56" font-family="Arial, sans-serif" font-size="${Math.max(9, Math.min(14, width / 5)).toFixed(1)}">SINK</text>${faucet}`;
  }).join("");

  const title = escapeXml(bundleName ? `${bundleName} — 2D Floor Plan` : "2D Floor Plan");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}" viewBox="0 0 ${canvasWidth} ${canvasHeight}" role="img" aria-label="${title}">
  <rect width="100%" height="100%" fill="#faf8f4"/>
  <text x="38" y="42" fill="#4a3822" font-family="Arial, sans-serif" font-size="27" font-weight="600">${title}</text>
  <rect x="${offsetX.toFixed(1)}" y="${offsetY.toFixed(1)}" width="${plotWidth.toFixed(1)}" height="${plotHeight.toFixed(1)}" fill="#ffffff" stroke="#26384b" stroke-width="10"/>
  ${cabinets}
  ${fixtureMarkers}
  <text x="38" y="${canvasHeight - 24}" fill="#526174" font-family="Arial, sans-serif" font-size="18">${roomWidth}&quot; × ${roomDepth}&quot; room · ${placements.length} placed item${placements.length === 1 ? "" : "s"}${sinks.length > 0 ? ` · ${sinks.length} sink${sinks.length === 1 ? "" : "s"}` : ""}</text>
</svg>`;
}
