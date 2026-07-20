import { useState, useEffect } from "react";
import { CabinetDrawing } from "@/components/CabinetDrawing";
import { cabinetAltText, type CabinetLike } from "@/lib/cabinetGraphics";

interface CabinetImageProps {
  cabinet: CabinetLike;
  /** Optional override of the door/finish color, used only by the drawing fallback. */
  finishColor?: string;
  className?: string;
  /** Line-specific image URL that takes priority over cabinet.catalogImageUrl */
  overrideImageUrl?: string | null;
}

/**
 * Renders a cabinet's catalog line-art image (from the 20/20 catalogs) when one
 * is mapped to the master code. If the image is missing or fails to load, it
 * gracefully falls back to the accurate, to-scale code-drawn `CabinetDrawing`.
 *
 * The catalog images are keyed to the CABINET (master code), not a distributor,
 * so every supply line that carries the same cabinet shares the same artwork via
 * the cross-reference. Finish-specific behavior (recolor) is only available on
 * the drawing fallback; the catalog renders are neutral grayscale line art.
 */
export function CabinetImage({ cabinet, finishColor, className, overrideImageUrl }: CabinetImageProps) {
  const url = overrideImageUrl?.trim() || cabinet.catalogImageUrl?.trim() || null;
  const [failed, setFailed] = useState(false);

  // Reset the error state if the cabinet (and thus the image) changes.
  useEffect(() => {
    setFailed(false);
  }, [url]);

  if (!url || failed) {
    return (
      <CabinetDrawing cabinet={cabinet} finishColor={finishColor} className={className} />
    );
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
