import { useEffect, useState } from "react";
import { CabinetDrawing } from "@/components/CabinetDrawing";
import { cabinetAltText, type CabinetLike } from "@/lib/cabinetGraphics";

interface CabinetImageProps {
  cabinet: CabinetLike;
  /** Optional door/finish color applied only to the code-drawn fallback. */
  finishColor?: string;
  className?: string;
  /**
   * An explicitly approved distributor-line image for the selected detail view.
   * Catalog cards continue to use the canonical master image so a finish never
   * changes the structural product identity.
   */
  overrideImageUrl?: string | null;
}

/**
 * Displays the approved neutral catalog drawing assigned to the canonical master
 * code. When a detail view has an explicitly approved distributor override, that
 * selected-line drawing takes precedence. The deterministic CabinetDrawing library
 * remains the dependable fallback for a missing or failed catalog asset; it does
 * not replace approved product artwork.
 */
export function CabinetImage({ cabinet, finishColor, className, overrideImageUrl }: CabinetImageProps) {
  // The archived BEC24 thumbnail depicts a 24 × 24 two-door corner box. The
  // supplied Capital specification proves BEC24 is a 30 × 34½ × 24 one-door
  // base end cabinet with one 45-degree angled end, so its code-keyed technical
  // drawing is the approved structural image until a matching library asset is
  // assigned. An explicitly approved detail-line override remains respected.
  const code = (cabinet.masterCode ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  const needsSourceTrueDrawing = code === "BEC24" && !overrideImageUrl?.trim();
  const url = overrideImageUrl?.trim() || cabinet.catalogImageUrl?.trim() || null;
  const [failed, setFailed] = useState(false);

  // Reset the error state whenever a new master or approved image is selected.
  useEffect(() => {
    setFailed(false);
  }, [url, cabinet.masterCode]);

  if (needsSourceTrueDrawing || !url || failed) {
    return <CabinetDrawing cabinet={cabinet} finishColor={finishColor} className={className} />;
  }

  return (
    <img
      src={url}
      alt={cabinetAltText(cabinet)}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ objectFit: "contain" }}
    />
  );
}

export default CabinetImage;
