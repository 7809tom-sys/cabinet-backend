import { useMemo } from "react";
import { Minus, Plus, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { PlacedCabinet, effectiveStyleId, isCornerCabinet } from "@/lib/design";
import { isRollOutEligible, targetWidth } from "@/lib/rollOutTrayMatch";

export interface RollOutTrayPickerProps {
  cabinet: PlacedCabinet;
  /** The design's default door style (per-cabinet override wins via effectiveStyleId). */
  designStyleId: number | null;
  /** Locked distributor line, when the design has one. */
  distributorId: number | null;
  /** Current quantity persisted on the cabinet. */
  qty: number;
  /** Persist a new quantity (>= 0, no upper cap) onto the cabinet. */
  onSetQty: (qty: number) => void;
}

/**
 * Per-cabinet roll-out shelf add-on. Auto-resolves the correct same-line RS
 * shelf sized to this cabinet (largest shelf width <= the cabinet's nominal
 * width) and exposes an unlimited quantity stepper. Renders nothing for
 * cabinets that can't take a roll-out (walls, tall, corners, drawer-only,
 * fillers) or when the locked line carries no shelf that fits.
 */
export function RollOutTrayPicker({
  cabinet,
  designStyleId,
  distributorId,
  qty,
  onSetQty,
}: RollOutTrayPickerProps) {
  const { t } = useLanguage();

  // PlacedCabinet doesn't carry the catalog corner flag; derive it so corner
  // bases (lazy susans, blind corners) are reliably excluded.
  const eligible = isRollOutEligible({
    placement: cabinet.placement,
    category: cabinet.category,
    subCategory: cabinet.subCategory,
    masterCode: cabinet.masterCode,
    numberOfDoors: cabinet.numberOfDoors,
    isCornerCabinet: isCornerCabinet(cabinet.masterCode, cabinet.description),
    nominalWidth: cabinet.nominalWidth ?? null,
    width: cabinet.width,
  });
  const sid = effectiveStyleId(cabinet, designStyleId);
  const width = targetWidth(cabinet);

  const trayQuery = trpc.design.resolveRollOutTray.useQuery(
    { styleId: sid ?? 0, width, distributorId: distributorId ?? undefined },
    { enabled: eligible && sid != null && width > 0, retry: false, staleTime: 60_000 },
  );

  const tray = trayQuery.data ?? null;

  const safeQty = useMemo(() => (Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 0), [qty]);

  // Not an eligible cabinet → render nothing (no section at all).
  if (!eligible || sid == null || width <= 0) return null;

  // Loading: keep the section quiet (no flash) until we know if a shelf fits.
  if (trayQuery.isLoading) return null;

  // No shelf fits in this line → graceful empty state message.
  if (!tray) {
    return (
      <section className="space-y-2 border-t border-border pt-4">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <PackagePlus className="h-4 w-4 text-muted-foreground" />
          {t("dt_ca_addons")}
        </h4>
        <p className="text-[11px] text-muted-foreground">{t("dt_ca_rollout_none_size")}</p>
      </section>
    );
  }

  const each = tray.contractorPrice ?? tray.wholesalePrice ?? tray.listPrice ?? null;
  const eachNum = each != null ? Number(each) : null;

  return (
    <section className="space-y-2 border-t border-border pt-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <PackagePlus className="h-4 w-4 text-muted-foreground" />
        {t("dt_ca_addons")}
      </h4>

      <div className="rounded-xl border border-border bg-muted/30 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-foreground">{t("dt_ca_rollout_title")}</div>
            <p className="text-[11px] text-muted-foreground">
              {t("dt_ca_rollout_hint", { size: Math.round(tray.width) })}
            </p>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span className="font-mono">{tray.masterCode}</span>
              {eachNum != null && Number.isFinite(eachNum) && (
                <span>
                  · ${eachNum.toFixed(2)} {t("dt_ca_rollout_each")}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={safeQty <= 0}
              aria-label={`${t("dt_ca_rollout_qty")} −`}
              onClick={() => onSetQty(Math.max(0, safeQty - 1))}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Input
              type="number"
              min={0}
              step={1}
              value={safeQty}
              className="h-8 w-14 text-center text-sm"
              aria-label={t("dt_ca_rollout_qty")}
              onChange={(e) => {
                const v = Math.floor(Number(e.target.value));
                onSetQty(Number.isFinite(v) && v > 0 ? v : 0);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              aria-label={`${t("dt_ca_rollout_qty")} +`}
              onClick={() => onSetQty(safeQty + 1)}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
