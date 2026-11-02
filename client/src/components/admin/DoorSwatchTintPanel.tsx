import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { planDoorFinish } from "@shared/doorFinishTint";
import { analyzeSwatchPixels, type SwatchColor } from "@shared/swatchColor";

type ApprovedSwatch = {
  hex: string;
  lightHex: string;
  darkHex: string;
  finishCategory: "paint" | "stain";
};

/**
 * Upload a door swatch, read its own color, and preview the grain tint.
 * Apply only fills the editor. The style is unchanged until Save.
 */
export default function DoorSwatchTintPanel({
  styleName,
  woodSpecies,
  onApply,
}: {
  styleName: string;
  woodSpecies?: string | null;
  onApply: (color: ApprovedSwatch) => void;
}) {
  const [reading, setReading] = useState<SwatchColor | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);

  async function onFile(file: File | undefined) {
    setApplied(false);
    setError("");
    setReading(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose a photo of the door swatch.");
      return;
    }
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 240 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Could not read that photo.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      const color = analyzeSwatchPixels({ data: pixels.data, width: canvas.width, height: canvas.height, channels: 4 });
      bitmap.close();
      if (!color) {
        setError("No door face was found in that photo.");
        return;
      }
      setReading(color);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read that photo.");
    } finally {
      setBusy(false);
    }
  }

  const plan = reading
    ? planDoorFinish({
      ourName: styleName,
      woodSpecies,
      detectedHex: reading.hex,
      finishCategory: reading.finishCategory,
    })
    : null;

  return (
    <div className="space-y-3 rounded-lg border border-stone-300 bg-stone-50/70 px-3 py-3" data-testid="door-swatch-tint">
      <div>
        <Label htmlFor="door-swatch-upload">Swatch color</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Upload a picture of this door. The color read from the face becomes this door&apos;s own color and tints its grain. Paint is opaque. A stain stays translucent over the wood grain. Nothing is saved until you click Save.
        </p>
      </div>
      <input
        id="door-swatch-upload"
        type="file"
        accept="image/*"
        className="block w-full text-xs"
        onChange={(event) => void onFile(event.target.files?.[0])}
      />
      {busy && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Reading the swatch…</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
      {reading && plan && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <SwatchPreview reading={reading} opaque={plan.application === "opaque"} />
            <div className="text-xs leading-5">
              <p><span className="font-medium">{plan.finishCategory === "stain" ? "Stain" : "Paint"}</span> · {plan.application === "opaque" ? "opaque on painted grain" : "translucent over wood grain"}</p>
              <p>Own color <span className="font-mono">{plan.ownHex}</span></p>
              <p>Grain {plan.grainShade}{plan.keepsRealWoodGrain ? " · hickory keeps its real grain" : ""}</p>
              <p className="font-mono text-muted-foreground">{reading.shades.join("  ")}</p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              onApply({
                hex: plan.ownHex,
                lightHex: reading.lightHex,
                darkHex: reading.darkHex,
                finishCategory: plan.finishCategory,
              });
              setApplied(true);
            }}
          >
            {applied ? "Color is ready to save" : "Use this color"}
          </Button>
          <p className="text-xs text-muted-foreground">Use this color fills the editor only. Save writes it.</p>
        </div>
      )}
    </div>
  );
}

function SwatchPreview({ reading, opaque }: { reading: SwatchColor; opaque: boolean }) {
  const stripes = opaque
    ? reading.hex
    : `repeating-linear-gradient(90deg, ${reading.darkHex} 0 3px, ${reading.lightHex} 3px 7px)`;
  return (
    <div
      aria-label={opaque ? "Opaque paint preview" : "Stain grain preview"}
      className="h-16 w-12 rounded border border-black/10"
      style={{ background: stripes }}
    />
  );
}
