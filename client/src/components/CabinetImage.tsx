import { CabinetDrawing } from "@/components/CabinetDrawing";
import { type CabinetLike } from "@/lib/cabinetGraphics";

interface CabinetImageProps {
  cabinet: CabinetLike;
  /** Optional door/finish color applied only to the neutral structural drawing. */
  finishColor?: string;
  className?: string;
  /**
   * Retained for caller compatibility. Distributor image URLs are deliberately
   * not used for catalog product art: a master code has one structural drawing
   * across every distributor, finish, and door style.
   */
  overrideImageUrl?: string | null;
}

/**
 * Renders the code-keyed CabinetDealz technical line-art library. The drawing is
 * deterministic from master code, dimensions, and authored cabinet structure;
 * legacy catalogImageUrl and distributor override thumbnails cannot replace it
 * with finish-specific or structurally mismatched imagery.
 */
export function CabinetImage({ cabinet, finishColor, className }: CabinetImageProps) {
  return <CabinetDrawing cabinet={cabinet} finishColor={finishColor} className={className} />;
}

export default CabinetImage;
