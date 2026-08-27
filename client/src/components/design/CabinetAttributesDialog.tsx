import { useMemo, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Minus, Plus, DoorOpen, DoorClosed, Droplets, GitMerge, Link2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  type CabinetHardwarePosition,
  hasDoorSwing,
  resolveSwing,
  resolveCabinetHardwarePosition,
  placedHeight,
  isCustomWidth,
  isCustomHeight,
  isCustomDepth,
  isBlindCorner,
  blindPullRange,
  fillerWidthRange,
} from "@/lib/design";
import { cabinetDrawingType } from "@/lib/cabinetGraphics";
import { CUSTOM_CABINET_PROFILES } from "@/lib/customCabinetProfiles";
import { RollOutTrayPicker } from "@/components/design/RollOutTrayPicker";
import { DoorDrawerDiagram } from "@/components/design/DoorDrawerDiagram";
import { CABINET_ATTRIBUTES_DIALOG_CLASS } from "@/lib/cabinetAttributesDialogLayout";
import { cabinetEditConfigLink } from "@/lib/cabinetEditConfigLink";
import { trpc } from "@/lib/trpc";

// A single dimension stepper (−/value/+) used inside the dialog.
function Dim({
  label,
  value,
  custom,
  min,
  max,
  step = 1,
  inputStep = 0.25,
  snapTypedValue = false,
  onSet,
}: {
  label: string;
  value: number;
  custom: boolean;
  min: number;
  max: number;
  step?: number;
  inputStep?: number;
  snapTypedValue?: boolean;
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
          onClick={() => onSet(Math.max(min, Math.round((value - step) / step) * step))}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <Input
          type="number"
          step={inputStep}
          min={min}
          max={max}
          value={value}
          className={cn(
            "h-8 w-20 text-center text-sm",
            custom && "font-semibold text-[var(--color-gold,#c89b3c)]"
          )}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v) && v > 0) {
              const next = snapTypedValue ? Math.round(v / step) * step : v;
              onSet(Math.max(min, Math.min(max, next)));
            }
          }}
          aria-label={t("dt_ca_dim_aria", { name: full })}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          title={t("dt_ca_dim_inc", { name: full })}
          onClick={() => onSet(Math.min(max, Math.round((value + step) / step) * step))}
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
  mountBottom?: number | null;
  maxMountBottom?: number;
  onSetMountBottom?: (uid: string, v: number) => void;
  onMoveInOut?: (uid: string, direction: "in" | "out") => void;
  onResetSize: (uid: string) => void;
  onSetSwing: (uid: string, swing: "left" | "right" | "double") => void;
  onSetNoDoor: (uid: string, noDoor: boolean) => void;
  onSetHandleSide: (uid: string, side: CabinetHardwarePosition) => void;
  onApplyHandleSideToAll?: (side: CabinetHardwarePosition) => void;
  hardwareApplyCount?: number;
  // Per-cabinet roll-out shelf add-on: the design's default door style + locked
  // line let the picker resolve the correct same-line RS shelf, and onSetRolloutQty
  // persists the (unlimited) quantity onto the cabinet.
  designStyleId: number | null;
  distributorId: number | null;
  onSetRolloutQty: (uid: string, qty: number) => void;
  // Glass door upgrade toggle
  onSetGlassDoor: (uid: string, glassDoor: boolean) => void;
  onSetDecorativeEnd: (uid: string, treatment: "none" | "left" | "right" | "both") => void;
  glassDoorAvailable: boolean;
  // Glass door add-on: add the separate glass door SKU to the cart
  onAddGlassDoorToCart: (uid: string) => void;
  // Blind corner pull distance
  onSetBlindPull: (uid: string, pull: number) => void;
  // Waterfall countertop edge
  onSetWaterfall: (uid: string, side: "left" | "right", enabled: boolean) => void;
  // Category / subCategory override — lets the user re-classify a cabinet
  // (e.g. change Base → Vanity, or update the subCategory label).
  onSetCategory: (uid: string, category: string, subCategory: string | null) => void;
  // Per-design drawing-profile override for non-standard and end cabinets.
  onSetCustomProfile: (uid: string, profile: string | null) => void;
  // Owner-only link to the persistent Cabinet Config record for this SKU.
  masterConfigHref?: string;
  // Persists the selected design's category and drawing rule to its master SKU.
  onSaveMasterConfig?: (cabinet: PlacedCabinet) => void;
  savingMasterConfig?: boolean;
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
  mountBottom,
  maxMountBottom,
  onSetMountBottom,
  onMoveInOut,
  onResetSize,
  onSetSwing,
  onSetNoDoor,
  onSetHandleSide,
  onApplyHandleSideToAll,
  hardwareApplyCount = 0,
  designStyleId,
  distributorId,
  onSetRolloutQty,
  onSetGlassDoor,
  onSetDecorativeEnd,
  glassDoorAvailable,
  onAddGlassDoorToCart,
  onSetBlindPull,
  onSetWaterfall,
  onSetCategory,
  onSetCustomProfile,
  masterConfigHref,
  onSaveMasterConfig,
  savingMasterConfig,
  onSetOvenType,
}: CabinetAttributesDialogProps) {
  const { t } = useLanguage();
  const [pendingMasterId, setPendingMasterId] = useState<number | null>(null);
  const swing = useMemo(() => (cabinet ? resolveSwing(cabinet) : "double"), [cabinet]);
  const masterCode = cabinet?.masterCode ?? "";
  const cabinetId = cabinet?.cabinetId ?? 0;
  const isMasterAdmin = Boolean(masterConfigHref && cabinet?.cabinetId);
  const editConfigLink = cabinetEditConfigLink(masterConfigHref);
  const aliasesQuery = trpc.masterSku.getAliasesForCabinet.useQuery(
    { masterCode },
    { enabled: isMasterAdmin }
  );
  const similarQuery = trpc.masterSku.similarForCabinet.useQuery(
    { cabinetId },
    { enabled: isMasterAdmin }
  );
  const utils = trpc.useUtils();
  const mergeMutation = trpc.masterSku.confirmCabinetLink.useMutation({
    onSuccess: () => {
      setPendingMasterId(null);
      utils.masterSku.getAliasesForCabinet.invalidate({ masterCode });
      utils.masterSku.similarForCabinet.invalidate({ cabinetId });
    },
  });

  if (!cabinet) return null;

  const uid = cabinet.uid;
  const canSwing = hasDoorSwing(cabinet) && swing !== "double";
  const isDouble = swing === "double";
  const noDoor = !!cabinet.noDoor;
  const hardwarePosition = resolveCabinetHardwarePosition(cabinet);
  const isBase = cabinet.placement === "base";
  const canMoveMount = cabinet.placement === "wall" && typeof mountBottom === "number" && typeof onSetMountBottom === "function";
  const canMoveInOut = typeof onMoveInOut === "function";
  const custom =
    isCustomWidth(cabinet) || isCustomHeight(cabinet) || isCustomDepth(cabinet);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={CABINET_ATTRIBUTES_DIALOG_CLASS}>
        <DialogHeader>
          <DialogTitle className="font-mono text-base">{cabinet.masterCode}</DialogTitle>
          <DialogDescription className="truncate">{cabinet.description}</DialogDescription>
          {editConfigLink && (
            <a
              href={editConfigLink.href}
              target={editConfigLink.target}
              rel={editConfigLink.rel}
              className="w-fit text-xs font-medium text-amber-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-amber-400"
            >
              Edit Config ↗
            </a>
          )}
        </DialogHeader>

        <div className="space-y-5 py-1">
          {(cabinet.placement === "base" || cabinet.placement === "wall" || cabinet.placement === "tall") && (
            <section className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <div>
                <h4 className="text-sm font-semibold text-[#6e531d]">End Panel Treatment</h4>
                <p className="text-[11px] text-muted-foreground">Plain finished ends are standard. Add a decorative panel only where you want one.</p>
              </div>
              <Select value={cabinet.decorativeEnd ?? "none"} onValueChange={(value) => onSetDecorativeEnd(uid, value as "none" | "left" | "right" | "both")}>
                <SelectTrigger className="h-9 bg-background text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Plain finished ends</SelectItem>
                  <SelectItem value="left">Decorative panel — left end</SelectItem>
                  <SelectItem value="right">Decorative panel — right end</SelectItem>
                  <SelectItem value="both">Decorative panels — both ends</SelectItem>
                </SelectContent>
              </Select>
            </section>
          )}

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
            {(() => {
              const fillerRange = fillerWidthRange(cabinet);
              return <div className="flex items-end gap-3">
              <Dim
                label="W"
                value={fillerRange ? Math.round(cabinet.width * 8) / 8 : Math.round(cabinet.width * 10) / 10}
                custom={isCustomWidth(cabinet)}
                min={fillerRange?.min ?? 6}
                max={fillerRange?.max ?? 48}
                step={fillerRange ? 0.125 : 1}
                inputStep={fillerRange ? 0.125 : 0.25}
                snapTypedValue={Boolean(fillerRange)}
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
            </div>;
            })()}
          </section>

          {canMoveMount && (
            <section className="space-y-2 border-t border-border pt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold">Elevation position</h4>
                  <p className="text-[11px] text-muted-foreground">Move this wall cabinet up or down from the floor.</p>
                </div>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => onSetMountBottom?.(uid, 54)}>
                  Reset 54″
                </Button>
              </div>
              <div className="flex items-center gap-1">
                <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" title="Move down one inch" onClick={() => onSetMountBottom?.(uid, Math.max(0, (mountBottom ?? 0) - 1))}>
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <Input
                  type="number"
                  min={0}
                  max={maxMountBottom ?? 120}
                  step={1}
                  value={Math.round(mountBottom ?? 0)}
                  className="h-8 w-20 text-center text-sm"
                  aria-label="Cabinet mounting height from floor"
                  onChange={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isFinite(next)) onSetMountBottom?.(uid, Math.max(0, Math.min(maxMountBottom ?? 120, next)));
                  }}
                />
                <span className="text-xs text-muted-foreground">in. from floor</span>
                <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" title="Move up one inch" onClick={() => onSetMountBottom?.(uid, Math.min(maxMountBottom ?? 120, (mountBottom ?? 0) + 1))}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </section>
          )}

          {canMoveInOut && (
            <section className="space-y-2 border-t border-border pt-4">
              <div>
                <h4 className="text-sm font-semibold">Depth position</h4>
                <p className="text-[11px] text-muted-foreground">Move this cabinet one inch toward the wall or into the room.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" title="Move out one inch toward the wall" onClick={() => onMoveInOut?.(uid, "out")}>Move Out 1″</Button>
                <Button type="button" variant="outline" size="sm" title="Move in one inch into the room" onClick={() => onMoveInOut?.(uid, "in")}>Move In 1″</Button>
              </div>
            </section>
          )}

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

          {/* Custom drawing rule */}
          <section className="space-y-3 border-t border-border pt-4">
            <div>
              <h4 className="text-sm font-semibold">Drawing Rule</h4>
              <p className="text-[11px] text-muted-foreground">
                Choose how this cabinet draws in plan and elevation. End cabinets remain independent from corner-cabinet rules.
              </p>
            </div>
            <Select
              value={cabinet.customProfile ?? "standard"}
              onValueChange={(value) => onSetCustomProfile(uid, value === "standard" ? null : value)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Standard cabinet" />
              </SelectTrigger>
              <SelectContent>
                {CUSTOM_CABINET_PROFILES.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>{profile.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cabinet.customProfile && cabinet.customProfile !== "standard" && !cabinet.genericDrawingUrl && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                This profile has no generic drawing image yet. It will use its vector fallback until one is saved in Cabinet Config.
              </p>
            )}
            {masterConfigHref && (
              <a
                href={masterConfigHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex text-[11px] font-medium text-amber-700 hover:underline dark:text-amber-400"
              >
                Open Master Cabinet Config to save this rule and generic image ↗
              </a>
            )}
            {onSaveMasterConfig && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                disabled={savingMasterConfig}
                onClick={() => onSaveMasterConfig(cabinet)}
              >
                {savingMasterConfig ? "Saving master configuration…" : "Save category and drawing rule to this cabinet SKU"}
              </Button>
            )}
          </section>

          {isMasterAdmin && (
            <section className="space-y-3 border-t border-border pt-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="flex items-center gap-1.5 text-sm font-semibold"><Link2 className="h-4 w-4" /> Master &amp; linked variants</h4>
                  <p className="text-[11px] text-muted-foreground">The confirmed master owns shared cabinet configuration. Supplier pricing and availability remain on source records.</p>
                </div>
                <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">{cabinet.masterCode}</Badge>
              </div>
              {aliasesQuery.data && aliasesQuery.data.length > 0 ? (
                <div className="rounded-lg border bg-muted/30 p-2 text-xs">
                  <div className="mb-1 font-medium">Connected variants ({aliasesQuery.data.length})</div>
                  <div className="flex flex-wrap gap-1">{aliasesQuery.data.map((alias) => <Badge key={alias.id} variant="outline" className="font-mono text-[10px]">{alias.aliasCode}</Badge>)}</div>
                </div>
              ) : <p className="text-[11px] text-muted-foreground">No linked variants yet.</p>}
              {similarQuery.data && similarQuery.data.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-2.5 dark:border-amber-800 dark:bg-amber-950/20">
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-200"><AlertTriangle className="h-3.5 w-3.5" /> Similar candidates — confirm the master before linking</div>
                  <div className="space-y-2">
                    {similarQuery.data.map((candidate) => (
                      <div key={candidate.id} className="flex items-center justify-between gap-2 rounded border border-amber-200 bg-background/80 px-2 py-1.5 text-xs dark:border-amber-900">
                        <div className="min-w-0"><div className="truncate font-mono font-semibold">{candidate.masterCode}</div><div className="truncate text-muted-foreground">{candidate.description} · {candidate.similarity}% code match</div></div>
                        {pendingMasterId === candidate.id ? (
                          <Button type="button" size="sm" className="h-7 text-[11px]" disabled={mergeMutation.isPending} onClick={() => mergeMutation.mutate({ masterCabinetId: candidate.id, aliasCabinetId: cabinet.cabinetId! })}>{mergeMutation.isPending ? "Linking…" : "Confirm master"}</Button>
                        ) : <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => setPendingMasterId(candidate.id)}><GitMerge className="mr-1 h-3 w-3" /> Link</Button>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

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

            {/* Hardware position */}
            <div className={cn("space-y-1.5", noDoor && "opacity-40 pointer-events-none")}>
              <div>
                <Label className="text-sm">Hardware placement</Label>
                <p className="text-[11px] text-muted-foreground">Choose where this cabinet’s door pull or knob appears. This changes only this cabinet; every drawer pull stays centered automatically.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Button
                  type="button"
                  variant={hardwarePosition === "auto" ? "default" : "outline"}
                  size="sm"
                  className="h-8"
                  disabled={noDoor}
                  onClick={() => onSetHandleSide(uid, "auto")}
                >
                  Automatic
                </Button>
                <Button
                  type="button"
                  variant={hardwarePosition === "left" ? "default" : "outline"}
                  size="sm"
                  className="h-8"
                  disabled={noDoor}
                  onClick={() => onSetHandleSide(uid, "left")}
                >
                  {t("dt_ca_left")}
                </Button>
                <Button
                  type="button"
                  variant={hardwarePosition === "center" ? "default" : "outline"}
                  size="sm"
                  className="h-8"
                  disabled={noDoor}
                  onClick={() => onSetHandleSide(uid, "center")}
                >
                  Center
                </Button>
                <Button
                  type="button"
                  variant={hardwarePosition === "right" ? "default" : "outline"}
                  size="sm"
                  className="h-8"
                  disabled={noDoor}
                  onClick={() => onSetHandleSide(uid, "right")}
                >
                  {t("dt_ca_right")}
                </Button>
              </div>
              {isDouble && (
                <Button
                  type="button"
                  variant={hardwarePosition === "paired" ? "default" : "outline"}
                  size="sm"
                  className="h-8 w-full"
                  disabled={noDoor}
                  onClick={() => onSetHandleSide(uid, "paired")}
                >
                  Paired doors — pulls at the center meeting edge
                </Button>
              )}
              {onApplyHandleSideToAll && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-9 w-full"
                      disabled={noDoor || hardwareApplyCount === 0}
                    >
                      Apply to All Cabinets
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Apply this door hardware position to all cabinets?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will apply {hardwarePosition === "auto" ? "Automatic" : hardwarePosition === "paired" ? "Paired doors" : hardwarePosition[0]!.toUpperCase() + hardwarePosition.slice(1)} to {hardwareApplyCount} eligible cabinet{hardwareApplyCount === 1 ? "" : "s"}. Open cabinets, appliances, panels, and drawer-only cabinets are skipped. Every drawer pull remains centered automatically.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onApplyHandleSideToAll(hardwarePosition)}>
                        Apply to {hardwareApplyCount} cabinet{hardwareApplyCount === 1 ? "" : "s"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
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
              {/* Glass door add-on: add the separate glass door SKU to the cart */}
              {cabinet.glassDoorAddonCode && (
                <div className="pt-2">
                  <p className="text-[11px] text-muted-foreground mb-2">
                    Glass door sold separately ({cabinet.glassDoorAddonCode}). Add it to your cart as a separate line item.
                  </p>
                  <button
                    type="button"
                    className="w-full text-sm font-medium py-2 px-3 rounded-md border border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950 transition-colors"
                    onClick={() => onAddGlassDoorToCart(uid)}
                  >
                    + Add Glass Door to Cart ({cabinet.glassDoorAddonCode})
                  </button>
                </div>
              )}
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
