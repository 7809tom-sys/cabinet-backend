/**
 * Guided Onboarding Wizard — /start
 *
 * A 3-step wizard that helps new users pick:
 *   Step 1 — Room type (Kitchen, Bathroom, Laundry, Closet, Other)
 *   Step 2 — Door style (featured active styles with thumbnails)
 *   Step 3 — Color / finish (from the chosen style's available colors)
 *
 * On completion, writes a cd_wizard_handoff key to sessionStorage and
 * navigates to /design?style=<id>&room=<type> so the Design Tool can
 * pre-apply both choices.
 */

import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSeo } from "@/hooks/useSeo";
import {
  ChefHat,
  Bath,
  Shirt,
  Archive,
  LayoutGrid,
  ArrowLeft,
  ArrowRight,
  Check,
  Sparkles,
} from "lucide-react";
import type { RoomType } from "@/lib/design";

// ─── Wizard handoff key ───────────────────────────────────────────────────────
export const WIZARD_HANDOFF_KEY = "cd_wizard_handoff";
export type WizardHandoff = {
  roomType: RoomType;
  styleId: number;
};
export function writeWizardHandoff(h: WizardHandoff) {
  try {
    sessionStorage.setItem(WIZARD_HANDOFF_KEY, JSON.stringify(h));
  } catch {
    // ignore
  }
}
export function takeWizardHandoff(): WizardHandoff | null {
  try {
    const raw = sessionStorage.getItem(WIZARD_HANDOFF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(WIZARD_HANDOFF_KEY);
    return JSON.parse(raw) as WizardHandoff;
  } catch {
    return null;
  }
}

// ─── Room type options ────────────────────────────────────────────────────────
const ROOM_OPTIONS: {
  value: RoomType;
  label: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  bg: string;
}[] = [
  {
    value: "kitchen",
    label: "Kitchen",
    description: "Base, wall, tall & pantry cabinets",
    Icon: ChefHat,
    bg: "from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30",
  },
  {
    value: "bathroom",
    label: "Bathroom",
    description: "Vanity bases, wall & medicine cabinets",
    Icon: Bath,
    bg: "from-sky-50 to-blue-50 dark:from-sky-950/30 dark:to-blue-950/30",
  },
  {
    value: "laundry",
    label: "Laundry Room",
    description: "Utility cabinets & storage solutions",
    Icon: Shirt,
    bg: "from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30",
  },
  {
    value: "closet",
    label: "Closet",
    description: "Wardrobe, shelving & organizer units",
    Icon: Archive,
    bg: "from-emerald-50 to-green-50 dark:from-emerald-950/30 dark:to-green-950/30",
  },
  {
    value: "other",
    label: "Other",
    description: "Office, garage, or custom space",
    Icon: LayoutGrid,
    bg: "from-slate-50 to-gray-50 dark:from-slate-950/30 dark:to-gray-950/30",
  },
];

// ─── Step indicator ───────────────────────────────────────────────────────────
function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2 justify-center mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all duration-200 ${
              i + 1 < step
                ? "bg-primary text-primary-foreground"
                : i + 1 === step
                  ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {i + 1 < step ? <Check className="h-4 w-4" /> : i + 1}
          </div>
          {i < total - 1 && (
            <div
              className={`h-0.5 w-12 rounded-full transition-all duration-300 ${
                i + 1 < step ? "bg-primary" : "bg-muted"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Main wizard ──────────────────────────────────────────────────────────────
export default function GuidedWizard() {
  useSeo({ title: "Start Designing — Cabinet Dealz" });
  const [, navigate] = useLocation();

  const [step, setStep] = useState(1);
  const [roomType, setRoomType] = useState<RoomType | null>(null);
  const [styleId, setStyleId] = useState<number | null>(null);

  const { data: styles, isLoading: stylesLoading } = trpc.doorStyles.list.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
  });

  // Only show featured styles in the wizard; fall back to all active styles if none are featured
  const wizardStyles = useMemo(() => {
    if (!styles) return [];
    const featured = styles.filter((s) => s.isFeatured);
    return featured.length > 0 ? featured.sort((a, b) => (a.featuredRank ?? 999) - (b.featuredRank ?? 999)) : styles.slice(0, 12);
  }, [styles]);

  const selectedStyle = useMemo(
    () => wizardStyles.find((s) => s.id === styleId) ?? null,
    [wizardStyles, styleId]
  );

  // Unique colors/finishes for the selected style — in a real multi-style catalog
  // each style IS a color, so step 3 just confirms the selection.
  const colorOptions = useMemo(() => {
    if (!selectedStyle) return [];
    return [selectedStyle]; // single-style confirmation step
  }, [selectedStyle]);

  function handleFinish() {
    if (!roomType || !styleId) return;
    writeWizardHandoff({ roomType, styleId });
    navigate(`/design?style=${styleId}&room=${roomType}`);
  }

  const TOTAL_STEPS = 3;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/30">
      <div className="container max-w-4xl py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary mb-4">
            <Sparkles className="h-4 w-4" />
            Design Wizard
          </div>
          <h1 className="text-3xl font-bold font-serif text-foreground mb-2">
            Let's design your space
          </h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Answer a few quick questions and we'll drop you right into the Design Tool with your
            preferences pre-loaded.
          </p>
        </div>

        <StepIndicator step={step} total={TOTAL_STEPS} />

        {/* ─── Step 1: Room type ─── */}
        {step === 1 && (
          <div>
            <h2 className="text-xl font-semibold text-center mb-6">
              What kind of space are you designing?
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ROOM_OPTIONS.map((opt) => {
                const Icon = opt.Icon;
                const selected = roomType === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setRoomType(opt.value)}
                    className={`group relative flex flex-col items-center gap-3 rounded-2xl border-2 p-6 text-center transition-all duration-200 bg-gradient-to-br ${opt.bg} ${
                      selected
                        ? "border-primary shadow-lg shadow-primary/10 scale-[1.02]"
                        : "border-border hover:border-primary/40 hover:shadow-md"
                    }`}
                  >
                    {selected && (
                      <div className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="h-3.5 w-3.5" />
                      </div>
                    )}
                    <div
                      className={`flex h-14 w-14 items-center justify-center rounded-xl transition-colors ${
                        selected ? "bg-primary text-primary-foreground" : "bg-background text-foreground group-hover:bg-primary/10"
                      }`}
                    >
                      <Icon className="h-7 w-7" />
                    </div>
                    <div>
                      <div className="font-semibold text-foreground">{opt.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{opt.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end mt-8">
              <Button
                onClick={() => setStep(2)}
                disabled={!roomType}
                className="gap-2 px-6"
              >
                Next: Choose a Style
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ─── Step 2: Door style ─── */}
        {step === 2 && (
          <div>
            <h2 className="text-xl font-semibold text-center mb-2">
              Pick a door style you love
            </h2>
            <p className="text-center text-muted-foreground text-sm mb-6">
              Each style has its own cabinet lineup with trade pricing built in.
            </p>

            {stylesLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {wizardStyles.map((style) => {
                  const selected = styleId === style.id;
                  const img = style.thumbnailImageUrl || style.doorSampleImageUrl || style.roomSceneImageUrl;
                  const label = style.aliasName || style.ourName || style.styleCode;
                  return (
                    <button
                      key={style.id}
                      onClick={() => setStyleId(style.id)}
                      className={`group relative rounded-xl border-2 overflow-hidden transition-all duration-200 ${
                        selected
                          ? "border-primary shadow-lg shadow-primary/10 scale-[1.02]"
                          : "border-border hover:border-primary/40 hover:shadow-md"
                      }`}
                    >
                      {selected && (
                        <div className="absolute top-2 right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
                          <Check className="h-3.5 w-3.5" />
                        </div>
                      )}
                      {style.isFeatured && style.featuredLabel && (
                        <div className="absolute top-2 left-2 z-10">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
                            {style.featuredLabel}
                          </Badge>
                        </div>
                      )}
                      <div className="aspect-[4/3] bg-muted overflow-hidden">
                        {img ? (
                          <img
                            src={img}
                            alt={label}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">
                            No image
                          </div>
                        )}
                      </div>
                      <div className="p-2.5 bg-background">
                        <div className="font-medium text-sm text-foreground truncate">{label}</div>
                        {style.color && (
                          <div className="text-xs text-muted-foreground truncate">{style.color}</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex justify-between mt-8">
              <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={!styleId}
                className="gap-2 px-6"
              >
                Next: Confirm Style
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ─── Step 3: Confirm & launch ─── */}
        {step === 3 && (
          <div className="max-w-lg mx-auto">
            <h2 className="text-xl font-semibold text-center mb-2">
              You're ready to design!
            </h2>
            <p className="text-center text-muted-foreground text-sm mb-8">
              Review your selections below, then launch the Design Tool.
            </p>

            <div className="rounded-2xl border border-border bg-card p-6 space-y-4 mb-8">
              {/* Room type */}
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                  {(() => {
                    const opt = ROOM_OPTIONS.find((r) => r.value === roomType);
                    if (!opt) return null;
                    const Icon = opt.Icon;
                    return <Icon className="h-5 w-5" />;
                  })()}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Room type</div>
                  <div className="font-medium capitalize">{roomType}</div>
                </div>
                <button
                  onClick={() => setStep(1)}
                  className="ml-auto text-xs text-primary hover:underline"
                >
                  Change
                </button>
              </div>

              <div className="border-t border-border" />

              {/* Door style */}
              {selectedStyle && (
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg overflow-hidden bg-muted shrink-0">
                    {selectedStyle.thumbnailImageUrl || selectedStyle.doorSampleImageUrl ? (
                      <img
                        src={selectedStyle.thumbnailImageUrl || selectedStyle.doorSampleImageUrl || ""}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-muted" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">Door style</div>
                    <div className="font-medium truncate">
                      {selectedStyle.aliasName || selectedStyle.ourName || selectedStyle.styleCode}
                    </div>
                    {selectedStyle.color && (
                      <div className="text-xs text-muted-foreground">{selectedStyle.color}</div>
                    )}
                  </div>
                  <button
                    onClick={() => setStep(2)}
                    className="text-xs text-primary hover:underline"
                  >
                    Change
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="outline" onClick={() => setStep(2)} className="gap-2 sm:w-auto">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
              <Button
                onClick={handleFinish}
                disabled={!roomType || !styleId}
                className="gap-2 flex-1 sm:flex-none sm:px-8"
                size="lg"
              >
                <Sparkles className="h-4 w-4" />
                Launch Design Tool
              </Button>
            </div>

            <p className="text-center text-xs text-muted-foreground mt-4">
              You can change the style, room type, and dimensions at any time inside the Design Tool.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
