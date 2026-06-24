import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import {
  Upload,
  ScanLine,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  ImageIcon,
  ShoppingCart,
} from "lucide-react";

type MatchRow = {
  rawCode: string;
  quantity: number;
  matched: boolean;
  confidence: "exact" | "normalized" | "fuzzy" | "none";
  cabinetId: number | null;
  masterCode: string | null;
  description: string | null;
  category: string | null;
  candidates: string[];
};

const MAX_BYTES = 8 * 1024 * 1024; // 8MB

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

export default function PhotoToCart() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { addItem, lockedStyleId, lockedStyleLabel, clear } = useCart();
  const fileRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview] = useState<string | null>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string>("");
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [styleId, setStyleId] = useState<string>("");
  const [tier, setTier] = useState<"wholesale" | "contractor">("contractor");

  const stylesQuery = trpc.doorStyles.list.useQuery(undefined);
  const styleOptions = useMemo(
    () =>
      (stylesQuery.data ?? []).map((s: any) => ({
        id: s.id as number,
        label: [s.ourName, s.doorStyle, s.color].filter(Boolean).join(" · "),
      })),
    [stylesQuery.data],
  );

  const extractMut = trpc.ocr.extractFromImage.useMutation({
    onSuccess: (res) => {
      setRows(res.matches as MatchRow[]);
      const { matched, unmatched } = res.summary;
      if (matched === 0) {
        toast.error("No cabinet codes recognized", {
          description: "Try a clearer photo or a typed list.",
        });
      } else {
        toast.success(`Read ${matched} item${matched === 1 ? "" : "s"}`, {
          description: unmatched > 0 ? `${unmatched} need your review` : "All matched to the catalog",
        });
      }
    },
    onError: (err) => {
      toast.error("Couldn't read the image", { description: err.message });
    },
  });

  async function onPick(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (photo or scan).");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Image is too large", { description: "Max 8MB. Try a smaller photo." });
      return;
    }
    const url = await readFileAsDataUrl(file);
    setPreview(url);
    setDataUrl(url);
    setFilename(file.name);
    setRows(null);
  }

  function runExtraction() {
    if (!dataUrl) return;
    extractMut.mutate({ imageDataUrl: dataUrl, filename: filename || undefined });
  }

  function updateQty(idx: number, qty: number) {
    setRows((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], quantity: Math.max(1, Math.floor(qty || 1)) };
      return next;
    });
  }

  function removeRow(idx: number) {
    setRows((prev) => (prev ? prev.filter((_, i) => i !== idx) : prev));
  }

  const matched = rows?.filter((r) => r.matched) ?? [];
  const unmatched = rows?.filter((r) => !r.matched) ?? [];
  const selectedStyle = styleOptions.find((s) => String(s.id) === styleId);

  function addAllToCart() {
    if (!selectedStyle) {
      toast.error("Choose a door style first", {
        description: "All items in one order share a single door style.",
      });
      return;
    }
    if (matched.length === 0) {
      toast.error("Nothing matched to add yet.");
      return;
    }
    // Family-lock: the cart can only hold ONE door style. If it already holds a
    // different family, adding would be rejected line-by-line, so prompt to
    // clear-and-add instead of silently dropping everything.
    if (lockedStyleId != null && lockedStyleId !== selectedStyle.id) {
      toast.warning(`Your cart is locked to ${lockedStyleLabel}`, {
        description: `Clear the cart to start a new order in ${selectedStyle.label}?`,
        action: {
          label: "Clear cart & add",
          onClick: () => {
            clear();
            setTimeout(() => {
              for (const r of matched) {
                addItem({
                  masterCode: r.masterCode!,
                  name: r.description ?? r.masterCode!,
                  styleId: selectedStyle.id,
                  styleLabel: selectedStyle.label,
                  distributorId: null,
                  tier,
                  unitPrice: null,
                  qty: r.quantity,
                });
              }
              toast.success(`Added ${matched.length} item${matched.length === 1 ? "" : "s"} to cart`, {
                description: `Door style: ${selectedStyle.label}`,
              });
              navigate("/cart");
            }, 0);
          },
        },
      });
      return;
    }
    for (const r of matched) {
      addItem({
        masterCode: r.masterCode!,
        name: r.description ?? r.masterCode!,
        styleId: selectedStyle.id,
        styleLabel: selectedStyle.label,
        distributorId: null,
        tier,
        unitPrice: null, // priced at quote/review (keeps family-lock + tier handling consistent)
        qty: r.quantity,
      });
    }
    toast.success(`Added ${matched.length} item${matched.length === 1 ? "" : "s"} to cart`, {
      description: `Door style: ${selectedStyle.label}`,
    });
    navigate("/cart");
  }

  // ── Auth gate ──────────────────────────────────────────────────────────────
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="container max-w-2xl py-16 text-center">
        <ScanLine className="h-12 w-12 mx-auto mb-4 text-primary" />
        <h1 className="font-serif text-3xl font-bold mb-2">Photo to Cart</h1>
        <p className="text-muted-foreground mb-6">
          Sign in to upload a cabinet list or floor plan and let us build your cart automatically.
        </p>
        <Button onClick={() => (window.location.href = getLoginUrl())}>Sign in to continue</Button>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-bold flex items-center gap-2">
          <ScanLine className="h-7 w-7 text-primary" />
          Photo to Cart
        </h1>
        <p className="text-muted-foreground mt-1">
          Upload a photo or scan of your cabinet list, quote, or floor plan. We'll read the cabinet
          codes and build your cart for review.
        </p>
      </div>

      {/* Upload */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">1. Upload your list</CardTitle>
        </CardHeader>
        <CardContent>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0])}
          />
          {!preview ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="w-full border-2 border-dashed border-border rounded-xl py-12 flex flex-col items-center justify-center gap-3 hover:border-primary/60 hover:bg-muted/40 transition-colors"
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                Click to choose a photo or scan (JPG/PNG, max 8MB)
              </span>
            </button>
          ) : (
            <div className="space-y-4">
              <div className="relative rounded-xl overflow-hidden border bg-muted/30">
                <img src={preview} alt="Uploaded list" className="max-h-80 w-full object-contain" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => fileRef.current?.click()}>
                  <ImageIcon className="h-4 w-4 mr-1.5" /> Choose another
                </Button>
                <Button onClick={runExtraction} disabled={extractMut.isPending}>
                  {extractMut.isPending ? (
                    <>
                      <Spinner className="h-4 w-4 mr-1.5" /> Reading…
                    </>
                  ) : (
                    <>
                      <ScanLine className="h-4 w-4 mr-1.5" /> Read cabinet codes
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {rows && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <span>2. Review what we found</span>
              <span className="text-sm font-normal text-muted-foreground">
                {matched.length} matched · {unmatched.length} to review
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {matched.length > 0 && (
              <div className="space-y-2">
                {matched.map((r, i) => {
                  const idx = rows.indexOf(r);
                  return (
                    <div
                      key={`${r.masterCode}-${i}`}
                      className="flex items-center gap-3 rounded-lg border p-3"
                    >
                      <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium">
                          {r.masterCode}{" "}
                          {r.confidence === "fuzzy" && (
                            <Badge variant="outline" className="ml-1 text-xs">
                              best guess
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {r.description} · {r.category}
                        </div>
                      </div>
                      <Input
                        type="number"
                        min={1}
                        value={r.quantity}
                        onChange={(e) => updateQty(idx, Number(e.target.value))}
                        className="w-20"
                        aria-label={`Quantity for ${r.masterCode}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeRow(idx)}
                        aria-label={`Remove ${r.masterCode}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {unmatched.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  Couldn't match these — check the code or add manually later
                </div>
                {unmatched.map((r, i) => (
                  <div
                    key={`${r.rawCode}-${i}`}
                    className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3"
                  >
                    <span className="font-mono text-sm">{r.rawCode}</span>
                    {r.candidates.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        Did you mean: {r.candidates.join(", ")}?
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="ml-auto"
                      onClick={() => removeRow(rows.indexOf(r))}
                      aria-label={`Dismiss ${r.rawCode}`}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {matched.length === 0 && unmatched.length === 0 && (
              <p className="text-sm text-muted-foreground">No items. Try a clearer image.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Style + add */}
      {rows && matched.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">3. Pick a door style &amp; add to cart</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Every order ships in one door style. Choose the style for this list — pricing is
              confirmed on your quote.
            </p>
            <div className="grid sm:grid-cols-2 gap-3">
              <Select value={styleId} onValueChange={setStyleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a door style" />
                </SelectTrigger>
                <SelectContent>
                  {styleOptions.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={tier} onValueChange={(v) => setTier(v as "wholesale" | "contractor")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contractor">Contractor pricing</SelectItem>
                  <SelectItem value="wholesale">Wholesale pricing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="lg" onClick={addAllToCart} disabled={!selectedStyle}>
              <ShoppingCart className="h-4 w-4 mr-2" />
              Add {matched.length} item{matched.length === 1 ? "" : "s"} to cart
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
