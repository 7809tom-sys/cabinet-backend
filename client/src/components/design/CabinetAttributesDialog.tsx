import { useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Minus, Plus, DoorOpen, DoorClosed, Droplets } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  PlacedCabinet,
  hasDoorSwing,
  resolveSwing,
  placedHeight,
  isCustomWidth,
  isCustomHeight,
  isCustomDepth,
  isBlindCorner,
  blindPullRange,
} from "@/lib/design";
import { cabinetDrawingType } from "@/lib/cabinetGraphics";
import { RollOutTrayPicker } from "@/components/design/RollOutTrayPicker";
import { DoorDrawerDiagram } from "@/components/design/DoorDrawerDiagram";

// A single dimension stepper (−/value/+) used inside the dialog.
function Dim({
  label,
  value,
  custom,
  min,
  max,
  onSet,
}: {
  label: string;
  value: number;
  custom: boolean;
  min: number;
  max: number;
  onSet: (v: number) => void;
}) {
  const { t } = useLanguage();
  const full =
    label === "W" ? t("dt_ca_width") : label === "H" ? t("dt_ca_height") : t("dt_ca_depth");
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[11px] text-muted-foreground">{t("dt_ca_dim_unit", { name: full })}</Label>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          title={t("dt_ca_dim_dec", { name: full })}
          onClick={() => onSet(Math.max(min, Math.round((value - 1) * 10) / 10))}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Input
          type="number"
          step="0.25"
          min={min}
          max={max}
          value={value}
          className={cn(
            "h-8 w-20 text-center text-sm",
            custom && "font-semibold text-[var(--color-gold,#c89b3c)]"
          )}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v > 0) onSet(Math.max(min, Math.min(max, v)));
          }}
          aria-label={t("dt_ca_dim_aria", { name: full })}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          title={t("dt_ca_dim_inc", { name: full })}
          onClick={() => onSet(Math.min(max, Math.round((value + 1) * 10) / 10))}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export interface CabinetAttributesDialogProps {
  cabinet: PlacedCabinet | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customFee: number;
  onSetWidth: (uid: string, v: number) => void;
  onSetHeight: (uid: string, v: number) => void;
  onSetDepth: (uid: string, v: number) => void;
  onResetSize: (uid: string) => void;
  onSetSwing: (uid: string, swing: "left" | "right" | "double") => void;
  onSetNoDoor: (uid: string, noDoor: boolean) => void;
  onSetHandleSide: (uid: string, side: "left" | "right") => void;
  // Per-cabinet roll-out shelf add-on: the design's default door style + locked
  // line let the picker resolve the correct same-line RS shelf, and onSetRolloutQty
  // persists the (unlimited) quantity onto the cabinet.
  designStyleId: number | null;
  distributorId: number | null;
  onSetRolloutQty: (uid: string, qty: number) => void;
  // Glass door upgrade toggle
  onSetGlassDoor: (uid: string, glassDoor: boolean) => void;
  glassDoorAvailable: boolean;
  // Blind corner pull distance
  onSetBlindPull: (uid: string, pull: number) => void;
  // Waterfall countertop edge
  onSetWaterfall: (uid: string, side: "left" | "right", enabled: boolean) => void;
  // Category / subCategory override — lets the user re-classify a cabinet
  // (e.g. change Base → Vanity, or update the subCategory label).
  onSetCategory: (uid: string, category: string, subCategory: string | null) => void;
  // Oven type: single or double — only shown for oven-tall cabinets
  onSetOvenType: (uid: string, ovenType: "single" | "double") => void;
}

// Right-click attributes editor for a single placed cabinet (email item 1):
// resize H/D/W, remove the door, change the door swing (L/R), set the handle
// position, and add roll-out trays. Everything here targets the cabinet the
// dialog was opened on (by uid), independent of keyboard selection.
export function CabinetAttributesDialog({
  cabinet,
  open,
  onOpenChange,
  customFee,
  onSetWidth,
  onSetHeight,
  onSetDepth,
  onResetSize,
  onSetSwing,
  onSetNoDoor,
  onSetHandleSide,
  designStyleId,
  distributorId,
  onSetRolloutQty,
  onSetGlassDoor,
  glassDoorAvailable,
  onSetBlindPull,
  onSetWaterfall,
  onSetCategory,
  onSetOvenType,
}: CabinetAttributesDialogProps) {
  const { t } = useLanguage();
  const swing = useMemo(() => (cabinet ? resolveSwing(cabinet) : "double"), [cabinet]);
  if (!cabinet) return null;

  const uid = cabinet.uid;
  const canSwing = hasDoorSwing(cabinet) && swing !== "double";
  const isDouble = swing === "double";
  const noDoor = !!cabinet.noDoor;
  const handleSide: "left" | "right" =
    cabinet.handleSide === "left" || cabinet.handleSide === "right"
      ? cabinet.handleSide
      : // Default the handle to the opposite of the hinge (handles sit on the
        // opening edge); double doors default to right.
        swing === "left"
        ? "right"
        : "left";
  const isBase = cabinet.placement === "base";
  const custom =
    isCustomWidth(cabinet) || isCustomHeight(cabinet) || isCustomDepth(cabinet);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-mono text-base">{cabinet.masterCode}</DialogTitle>
          <DialogDescription className="truncate">{cabinet.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Dimensions */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">{t("dt_ca_size")}</h4>
              {custom && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {t("dt_ca_custom_fee", { fee: customFee })}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] text-muted-foreground"
                    onClick={() => onResetSize(uid)}
                  >
                    {t("dt_ca_reset_catalog")}
                  </Button>
                </div>
              )}
            </div>
            <div className="flex items-end gap-3">
              <Dim
                label="W"
                value={Math.round(cabinet.width * 10) / 10}
                custom={isCustomWidth(cabinet)}
                min={6}
                max={48}
                onSet={(v) => onSetWidth(uid, v)}
              />
              <Dim
                label="H"
                value={Math.round(placedHeight(cabinet) * 10) / 10}
                custom={isCustomHeight(cabinet)}
                min={6}
                max={96}
                onSet={(v) => onSetHeight(uid, v)}
              />
              <Dim
                label="D"
                value={Math.round(cabinet.depth * 10) / 10}
                custom={isCustomDepth(cabinet)}
                min={6}
                max={36}
                onSet={(v) => onSetDepth(uid, v)}
              />
            </div>
          </section>

          {/* Oven Type — only for oven-tall cabinets */}
          {cabinetDrawingType(cabinet) === "oven-tall" && (
            <section className="space-y-3 border-t border-border pt-4">
              <h4 className="text-sm font-semibold">Oven Type</h4>
              <div className="grid grid-cols-2 gap-3">
                <button
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-colors",
                    (cabinet.ovenType ?? "single") === "single"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary"
                  )}
                  onClick={() => onSetOvenType(uid, "single")}
                >
                  <img
                    src="https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/oven-single-front-U843ihaYrWbB8xwKsMyngZ.webp"
                    alt="Single oven"
                    className="w-16 h-20 object-cover rounded-lg"
                  />
                  <span className="text-xs font-medium">Single Oven</span>
                </button>
                <button
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition-colors",
                    cabinet.ovenType === "double"
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary"
                  )}
                  onClick={() => onSetOvenType(uid, "double")}
                >
                  <img
                    src="https://d2xsxph8kpxj0f.cloudfront.net/310519663775888316/DQ7pUcbPFvKvFZ8JnyMs4M/oven-double-front-n2DaWbuTecczH4YKk7fJbo.webp"
                    alt="Double oven"
                    className="w-16 h-20 object-cover rounded-lg"
                  />
                  <span className="text-xs font-medium">Double Oven</span>
                </button>
              </div>
            </section>
          )}
          {/* Category */}
          <section className="space-y-3 border-t border-border pt-4">
            <h4 className="text-sm font-semibold">Category</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Category</Label>
                <Select
                  value={cabinet.category ?? ""}
                  onValueChange={(val) => onSetCategory(uid, val, cabinet.subCategory ?? null)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Base">Base</SelectItem>
                    <SelectItem value="Wall">Wall</SelectItem>
                    <SelectItem value="Tall">Tall</SelectItem>
                    <SelectItem value="Vanity">Vanity</SelectItem>
                    <SelectItem value="ADA">ADA</SelectItem>
                    <SelectItem value="Corner">Corner</SelectItem>
                    <SelectItem value="Accessory">Accessory</SelectItem>
                    <SelectItem value="Specialty">Specialty</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Sub-Category</Label>
                <Select
                  value={cabinet.subCategory ?? "__none__"}
                  onValueChange={(val) => onSetCategory(uid, cabinet.category ?? "Base", val === "__none__" ? null : val)}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    <SelectItem value="Sink Base">Sink Base</SelectItem>
                    <SelectItem value="Drawer Base">Drawer Base</SelectItem>
                    <SelectItem value="Corner Base">Corner Base</SelectItem>
                    <SelectItem value="Blind Corner">Blind Corner</SelectItem>
                    <SelectItem value="Lazy Susan">Lazy Susan</SelectItem>
                    <SelectItem value="Oven Base">Oven Base</SelectItem>
                    <SelectItem value="Range Base">Range Base</SelectItem>
                    <SelectItem value="Microwave">Microwave</SelectItem>
                    <SelectItem value="Refrigerator">Refrigerator</SelectItem>
                    <SelectItem value="Pantry">Pantry</SelectItem>
                    <SelectItem value="Utility">Utility</SelectItem>
                    <SelectItem value="Open Shelf">Open Shelf</SelectItem>
                    <SelectItem value="Glass Door">Glass Door</SelectItem>
                    <SelectItem value="Decorative End Panel">Decorative End Panel</SelectItem>
                    <SelectItem value="Roll-Out Tray">Roll-Out Tray</SelectItem>
                    <SelectItem value="Trim & Molding">Trim &amp; Molding</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          {/* Door */}
          <section className="space-y-3 border-t border-border pt-4">
            <h4 className="text-sm font-semibold">{t("dt_ca_door_hardware")}</h4>

            {/* Remove door */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {noDoor ? (
                  <DoorOpen className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <DoorClosed className="h-4 w-4 text-muted-foreground" />
                )}
                <div>
                  <Label className="text-sm">{t("dt_ca_remove_door")}</Label>
                  <p className="text-[11px] text-muted-foreground">
                    {t("dt_ca_remove_door_hint")}
                  </p>
                </div>
              </div>
              <Switch
                checked={noDoor}
                onCheckedChange={(v) => onSetNoDoor(uid, v)}
                aria-label={t("dt_ca_remove_door")}
              />
            </div>

            {/* Door swing */}
            <div className={cn("space-y-1.5", noDoor && "opacity-40 pointer-events-none")}>
              <Label className="text-sm">{t("dt_ca_door_swing")}</Label>
              {isDouble ? (
                <p className="text-[11px] text-muted-foreground">
                  {t("dt_ca_double_hint")}
                </p>
              ) : !hasDoorSwing(cabinet) ? (
                <p className="text-[11px] text-muted-foreground">
                  {t("dt_ca_no_hinged")}
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={swing === "left" ? "default" : "outline"}
                    size="sm"
                    className="h-8"
                    disabled={!canSwing}
                    onClick={() => onSetSwing(uid, "left")}
                  >
                    {t("dt_ca_left_hinge")}
                  </Button>
                  <Button
                    type="button"
                    variant={swing === "right" ? "default" : "outline"}
                    size="sm"
                    className="h-8"
                    disabled={!canSwing}
                    onClick={() => onSetSwing(uid, "right")}
                  >
                    {t("dt_ca_right_hinge")}
                  </Button>
                </div>
              )}
            </div>

            {/* Handle position */}
            <div className={cn("space-y-1.5", noDoor && "opacity-40 pointer-events-none")}>
              <Label className="text-sm">{t("dt_ca_handle_position")}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={handleSide === "left" ? "default" : "outline"}
                  size="sm"
                  className="h-8"
                  onClick={() => onSetHandleSide(uid, "left")}
                >
                  {t("dt_ca_left")}
                </Button>
                <Button
                  type="button"
                  variant={handleSide === "right" ? "default" : "outline"}
                  size="sm"
                  className="h-8"
                  onClick={() => onSetHandleSide(uid, "right")}
                >
                  {t("dt_ca_right")}
                </Button>
              </div>
            </div>
          </section>

          {/* Glass door upgrade */}
          {cabinet.placement === "wall" && (
            <section className="space-y-3 border-t border-border pt-4">
              <h4 className="text-sm font-semibold">{t("dt_ca_glass_door")}</h4>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm">{t("dt_ca_glass_door_toggle")}</Label>
                  <p className="text-[11px] text-muted-foreground">
                    {glassDoorAvailable
                      ? t("dt_ca_glass_door_hint")
                      : t("dt_ca_glass_door_unavail")}
                  </p>
                </div>
                <Switch
                  checked={!!cabinet.glassDoor}
                  disabled={!glassDoorAvailable}
                  onCheckedChange={(v) => onSetGlassDoor(uid, v)}
                  aria-label={t("dt_ca_glass_door_toggle")}
                />
              </div>
            </section>
          )}

          {/* Blind corner attributes */}
          {isBlindCorner(cabinet.masterCode, cabinet.description) && (() => {
            const range = blindPullRange(cabinet);
            const pullMin = range?.min ?? 3;
            const pullMax = range?.max ?? 6;
            const currentPull = cabinet.blindPull ?? pullMax;
            return (
              <section className="space-y-3 border-t border-border pt-4">
                <h4 className="text-sm font-semibold">Blind Corner</h4>

                {/* Door side */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Door Side</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Which side of the cabinet the door opens from
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={swing === "left" ? "default" : "outline"}
                      size="sm"
                      className="h-8"
                      onClick={() => onSetSwing(uid, "left")}
                    >
                      Left
                    </Button>
                    <Button
                      type="button"
                      variant={swing === "right" ? "default" : "outline"}
                      size="sm"
                      className="h-8"
                      onClick={() => onSetSwing(uid, "right")}
                    >
                      Right
                    </Button>
                  </div>
                </div>

                {/* Pull distance from wall */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Pull from Wall</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Distance (inches) the blind portion extends from the corner wall ({pullMin}–{pullMax}")
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => onSetBlindPull(uid, Math.max(pullMin, currentPull - 1))}
                      disabled={currentPull <= pullMin}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <Input
                      type="number"
                      step="1"
                      min={pullMin}
                      max={pullMax}
                      value={currentPull}
                      className="h-8 w-20 text-center text-sm"
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v)) onSetBlindPull(uid, Math.max(pullMin, Math.min(pullMax, v)));
                      }}
                      aria-label="Pull distance from wall"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => onSetBlindPull(uid, Math.min(pullMax, currentPull + 1))}
                      disabled={currentPull >= pullMax}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="text-xs text-muted-foreground ml-1">" in</span>
                  </div>
                </div>
              </section>
            );
          })()}

          {/* Waterfall countertop edge — only for base cabinets */}
          {isBase && (
            <section className="space-y-3 border-t border-border pt-4">
              <h4 className="text-sm font-semibold flex items-center gap-1.5">
                <Droplets className="h-4 w-4 text-muted-foreground" />
                Waterfall Edge
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Countertop material cascades down the side of this cabinet to the floor.
              </p>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Left Side</Label>
                <Switch
                  checked={!!cabinet.waterfallLeft}
                  onCheckedChange={(v) => onSetWaterfall(uid, "left", v)}
                  aria-label="Waterfall left side"
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Right Side</Label>
                <Switch
                  checked={!!cabinet.waterfallRight}
                  onCheckedChange={(v) => onSetWaterfall(uid, "right", v)}
                  aria-label="Waterfall right side"
                />
              </div>
            </section>
          )}

          {/* Door & Drawer Layout diagram */}
          {!noDoor && (
            <section className="rounded-xl border border-border bg-muted/30 p-3">
              <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Door &amp; Drawer Layout</div>
              <div className="flex justify-center">
                <DoorDrawerDiagram cabinet={cabinet} width={200} />
              </div>
            </section>
          )}
          {/* Add-ons: per-cabinet roll-out shelves (auto-sized, same line) */}
          <RollOutTrayPicker
            cabinet={cabinet}
            designStyleId={designStyleId}
            distributorId={distributorId}
            qty={cabinet.rolloutQty ?? 0}
            onSetQty={(q) => onSetRolloutQty(uid, q)}
          />
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            {t("dt_ca_done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
