/**
 * AR Tape Measure
 *
 * Two modes:
 *  1. WebXR hit-test (Android Chrome + ARCore) — live AR ruler overlay
 *  2. Photo reference measurement (all browsers) — upload/capture photo with a
 *     known reference object (credit card, dollar bill, etc.) and tap two points
 *     to measure real-world distance.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { ArrowLeft, Camera, Ruler, RefreshCw, Info, CheckCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

type Mode = "detecting" | "webxr" | "photo";
type PhotoStep = "capture" | "ref-point-1" | "ref-point-2" | "meas-point-1" | "meas-point-2" | "result";

interface Point { x: number; y: number }

// Known reference object sizes in mm
const REFERENCE_OBJECTS = [
  { label: "Credit Card (width)", mm: 85.6 },
  { label: "Credit Card (height)", mm: 53.98 },
  { label: "US Dollar Bill (length)", mm: 156 },
  { label: "US Dollar Bill (width)", mm: 66.3 },
  { label: "US Quarter (diameter)", mm: 24.26 },
  { label: "iPhone 15 (height)", mm: 147.6 },
  { label: "Standard Brick (length)", mm: 194 },
];

// ─── WebXR AR Mode ────────────────────────────────────────────────────────────

function WebXRMeasure({ onExit }: { onExit: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"starting" | "ready" | "measuring" | "error">("starting");
  const [measurements, setMeasurements] = useState<{ label: string; value: string }[]>([]);
  const [pointCount, setPointCount] = useState(0);
  const sessionRef = useRef<XRSession | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const hitTestSourceRef = useRef<XRHitTestSource | null>(null);
  const pointsRef = useRef<XRRigidTransform[]>([]);
  const rafRef = useRef<number>(0);
  const reticleRef = useRef<Float32Array | null>(null);

  const stopSession = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (hitTestSourceRef.current) { hitTestSourceRef.current.cancel(); hitTestSourceRef.current = null; }
    if (sessionRef.current) { sessionRef.current.end().catch(() => {}); sessionRef.current = null; }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function startAR() {
      try {
        const nav = navigator as Navigator & { xr?: XRSystem };
        if (!nav.xr) { setStatus("error"); return; }
        const supported = await nav.xr.isSessionSupported("immersive-ar");
        if (!supported || cancelled) { setStatus("error"); return; }

        const session = await nav.xr.requestSession("immersive-ar", {
          requiredFeatures: ["hit-test"],
          optionalFeatures: ["dom-overlay"],
          domOverlay: canvasRef.current?.parentElement
            ? { root: canvasRef.current.parentElement }
            : undefined,
        } as XRSessionInit);

        if (cancelled) { session.end(); return; }
        sessionRef.current = session;

        const canvas = canvasRef.current!;
        const gl = canvas.getContext("webgl", { xrCompatible: true }) as WebGLRenderingContext;
        glRef.current = gl;

        await gl.makeXRCompatible?.();
        const baseLayer = new XRWebGLLayer(session, gl);
        await session.updateRenderState({ baseLayer });

        const refSpace = await session.requestReferenceSpace("local");
        const viewerSpace = await session.requestReferenceSpace("viewer");
        const hitTestSource = await session.requestHitTestSource!({ space: viewerSpace });
        hitTestSourceRef.current = hitTestSource ?? null;

        setStatus("ready");

        const onFrame = (_time: number, frame: XRFrame) => {
          if (!sessionRef.current) return;
          rafRef.current = session.requestAnimationFrame(onFrame);

          const pose = frame.getViewerPose(refSpace);
          if (!pose) return;

          const ht = hitTestSourceRef.current;
          if (ht) {
            const hits = frame.getHitTestResults(ht);
            if (hits.length > 0) {
              const hitPose = hits[0].getPose(refSpace);
              if (hitPose) reticleRef.current = hitPose.transform.matrix as unknown as Float32Array;
            }
          }

          // Minimal WebGL clear so the AR camera passthrough is visible
          gl.bindFramebuffer(gl.FRAMEBUFFER, baseLayer.framebuffer);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        };

        rafRef.current = session.requestAnimationFrame(onFrame);

        session.addEventListener("end", () => {
          setStatus("starting");
          hitTestSourceRef.current = null;
          sessionRef.current = null;
        });
      } catch (e) {
        console.error("WebXR error:", e);
        if (!cancelled) setStatus("error");
      }
    }

    startAR();
    return () => {
      cancelled = true;
      stopSession();
    };
  }, [stopSession]);

  function handleTap() {
    if (status !== "ready" && status !== "measuring") return;
    if (!reticleRef.current) { toast.info("Point your camera at a flat surface first"); return; }

    const matrix = reticleRef.current;
    const transform = new XRRigidTransform(
      { x: matrix[12], y: matrix[13], z: matrix[14], w: 1 },
      { x: 0, y: 0, z: 0, w: 1 }
    );
    pointsRef.current.push(transform);
    const count = pointsRef.current.length;
    setPointCount(count);

    if (count % 2 === 0) {
      // Calculate distance between last two points
      const a = pointsRef.current[count - 2];
      const b = pointsRef.current[count - 1];
      const dx = b.position.x - a.position.x;
      const dy = b.position.y - a.position.y;
      const dz = b.position.z - a.position.z;
      const meters = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const inches = meters * 39.3701;
      const feet = Math.floor(inches / 12);
      const remIn = (inches % 12).toFixed(1);
      const label = `Measurement ${Math.floor(count / 2)}`;
      const value = feet > 0
        ? `${feet}′ ${remIn}″  (${(meters * 100).toFixed(1)} cm)`
        : `${inches.toFixed(1)}″  (${(meters * 100).toFixed(1)} cm)`;
      setMeasurements((prev) => [...prev, { label, value }]);
      setStatus("ready");
      toast.success(`${value}`);
    } else {
      setStatus("measuring");
    }
  }

  function clearAll() {
    pointsRef.current = [];
    setPointCount(0);
    setMeasurements([]);
    setStatus("ready");
  }

  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f1929] text-white px-6 text-center gap-6">
        <AlertTriangle className="h-16 w-16 text-amber-400" />
        <h2 className="text-2xl font-bold">AR Not Available</h2>
        <p className="text-[#8a9bb8] max-w-sm">
          WebXR AR requires Android Chrome with ARCore installed. Your device or browser doesn't support it.
        </p>
        <Button onClick={onExit} variant="outline" className="border-white/30 text-white">
          Use Photo Measurement Instead
        </Button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden" onClick={handleTap}>
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Overlay UI */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-safe-top pt-4 pointer-events-auto">
          <button
            onClick={(e) => { e.stopPropagation(); stopSession(); onExit(); }}
            className="flex items-center gap-1.5 bg-black/50 backdrop-blur rounded-full px-3 py-2 text-white text-sm"
          >
            <ArrowLeft className="h-4 w-4" /> Exit AR
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); clearAll(); }}
            className="bg-black/50 backdrop-blur rounded-full p-2 text-white"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        {/* Reticle crosshair */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 border-2 border-white/80 rounded-full" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-white/80 -translate-y-1/2" />
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-white/80 -translate-x-1/2" />
          </div>
        </div>

        {/* Status */}
        <div className="absolute bottom-32 left-0 right-0 flex justify-center">
          <div className="bg-black/60 backdrop-blur rounded-2xl px-5 py-3 text-white text-center max-w-xs">
            {status === "starting" && <p className="text-sm">Initializing AR…</p>}
            {status === "ready" && <p className="text-sm">Tap to place <strong>Point {pointCount + 1}</strong></p>}
            {status === "measuring" && <p className="text-sm">Tap to place <strong>Point 2</strong> to complete measurement</p>}
          </div>
        </div>

        {/* Measurements list */}
        {measurements.length > 0 && (
          <div className="absolute bottom-4 left-4 right-4 space-y-1 pointer-events-auto">
            {measurements.slice(-3).map((m, i) => (
              <div key={i} className="bg-black/70 backdrop-blur rounded-xl px-4 py-2 flex justify-between text-white text-sm">
                <span className="text-white/60">{m.label}</span>
                <span className="font-bold">{m.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Photo Reference Mode ─────────────────────────────────────────────────────

function PhotoMeasure() {
  const [step, setStep] = useState<PhotoStep>("capture");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [refObjIdx, setRefObjIdx] = useState(0);
  const [refPoints, setRefPoints] = useState<[Point, Point] | null>(null);
  const [measPoints, setMeasPoints] = useState<[Point, Point] | null>(null);
  const [result, setResult] = useState<{ inches: number; cm: number; feet: string } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Tap handler on the image
  function handleImageTap(e: React.MouseEvent<HTMLImageElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const pt: Point = { x, y };

    if (step === "ref-point-1") {
      setRefPoints([pt, pt]);
      setStep("ref-point-2");
    } else if (step === "ref-point-2") {
      setRefPoints((prev) => [prev![0], pt]);
      setStep("meas-point-1");
    } else if (step === "meas-point-1") {
      setMeasPoints([pt, pt]);
      setStep("meas-point-2");
    } else if (step === "meas-point-2") {
      setMeasPoints((prev) => {
        const updated: [Point, Point] = [prev![0], pt];
        compute(updated);
        return updated;
      });
      setStep("result");
    }
  }

  function compute(mp: [Point, Point]) {
    if (!refPoints || !imgRef.current) return;
    const img = imgRef.current;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    const refPx = Math.sqrt(
      Math.pow((refPoints[1].x - refPoints[0].x) * w, 2) +
      Math.pow((refPoints[1].y - refPoints[0].y) * h, 2)
    );
    const measPx = Math.sqrt(
      Math.pow((mp[1].x - mp[0].x) * w, 2) +
      Math.pow((mp[1].y - mp[0].y) * h, 2)
    );
    const refMm = REFERENCE_OBJECTS[refObjIdx].mm;
    const measMm = (measPx / refPx) * refMm;
    const cm = measMm / 10;
    const inches = measMm / 25.4;
    const feet = Math.floor(inches / 12);
    const remIn = (inches % 12).toFixed(1);
    const feetStr = feet > 0 ? `${feet}′ ${remIn}″` : `${inches.toFixed(1)}″`;
    setResult({ inches, cm, feet: feetStr });
  }

  function reset() {
    setStep("capture");
    setImageUrl(null);
    setRefPoints(null);
    setMeasPoints(null);
    setResult(null);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    setStep("ref-point-1");
  }

  // Draw overlay dots and lines on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imageUrl) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      canvas.width = img.offsetWidth;
      canvas.height = img.offsetHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      function dot(p: Point, color: string, label: string) {
        const x = p.x * canvas!.width;
        const y = p.y * canvas!.height;
        ctx!.beginPath();
        ctx!.arc(x, y, 8, 0, Math.PI * 2);
        ctx!.fillStyle = color;
        ctx!.fill();
        ctx!.strokeStyle = "white";
        ctx!.lineWidth = 2;
        ctx!.stroke();
        ctx!.fillStyle = "white";
        ctx!.font = "bold 11px sans-serif";
        ctx!.fillText(label, x + 12, y + 4);
      }

      function line(a: Point, b: Point, color: string) {
        ctx!.beginPath();
        ctx!.moveTo(a.x * canvas!.width, a.y * canvas!.height);
        ctx!.lineTo(b.x * canvas!.width, b.y * canvas!.height);
        ctx!.strokeStyle = color;
        ctx!.lineWidth = 2;
        ctx!.setLineDash([6, 3]);
        ctx!.stroke();
        ctx!.setLineDash([]);
      }

      if (refPoints) {
        dot(refPoints[0], "#d4a75a", "R1");
        if (step !== "ref-point-2") dot(refPoints[1], "#d4a75a", "R2");
        if (step !== "ref-point-2") line(refPoints[0], refPoints[1], "#d4a75a");
      }
      if (measPoints) {
        dot(measPoints[0], "#4ade80", "M1");
        if (step === "result") dot(measPoints[1], "#4ade80", "M2");
        if (step === "result") line(measPoints[0], measPoints[1], "#4ade80");
      }
    };

    draw();
  }, [step, refPoints, measPoints, imageUrl]);

  const stepInstructions: Record<PhotoStep, string> = {
    capture: "Take a photo or upload one that includes a known reference object",
    "ref-point-1": `Tap the LEFT edge of your reference object (${REFERENCE_OBJECTS[refObjIdx].label})`,
    "ref-point-2": `Tap the RIGHT edge of your reference object`,
    "meas-point-1": "Tap the START of what you want to measure",
    "meas-point-2": "Tap the END of what you want to measure",
    result: "Measurement complete!",
  };

  return (
    <div className="min-h-screen bg-[#0f1929] text-white">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#0f1929]/95 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="text-white hover:bg-white/10 -ml-1">
          <Link href="/app"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-sm font-bold">Photo Measurement</h1>
          <p className="text-[10px] text-[#8a9bb8]">iPhone / Safari</p>
        </div>
        {step !== "capture" && (
          <Button onClick={reset} variant="ghost" size="sm" className="text-white hover:bg-white/10">
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* Instruction banner */}
        <div className="bg-[#1a2744] border border-[#2a3a5c] rounded-xl px-4 py-3 flex items-start gap-3">
          <Info className="h-4 w-4 text-[#d4a75a] shrink-0 mt-0.5" />
          <p className="text-sm text-[#c8d4e8] leading-relaxed">{stepInstructions[step]}</p>
        </div>

        {/* Reference object selector */}
        {(step === "capture" || step === "ref-point-1") && (
          <div>
            <label className="block text-xs font-semibold text-[#8a9bb8] mb-2 uppercase tracking-wider">
              Reference Object
            </label>
            <div className="grid grid-cols-1 gap-2">
              {REFERENCE_OBJECTS.map((obj, i) => (
                <button
                  key={obj.label}
                  onClick={() => setRefObjIdx(i)}
                  className={[
                    "flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm text-left transition-colors",
                    refObjIdx === i
                      ? "border-[#d4a75a] bg-[#d4a75a]/10 text-white"
                      : "border-[#2a3a5c] text-[#8a9bb8] hover:border-[#d4a75a]/50",
                  ].join(" ")}
                >
                  <span>{obj.label}</span>
                  <span className="font-mono text-xs">{obj.mm} mm</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Capture button */}
        {step === "capture" && (
          <div className="space-y-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFile}
            />
            <Button
              onClick={() => fileRef.current?.click()}
              className="w-full bg-[#d4a75a] text-[#1a2744] hover:bg-[#e0b86a] font-bold gap-2 h-14 text-base"
            >
              <Camera className="h-5 w-5" />
              Take Photo with Camera
            </Button>
            <Button
              onClick={() => {
                if (fileRef.current) {
                  fileRef.current.removeAttribute("capture");
                  fileRef.current.click();
                  setTimeout(() => fileRef.current?.setAttribute("capture", "environment"), 500);
                }
              }}
              variant="outline"
              className="w-full border-[#2a3a5c] text-white hover:bg-white/10 gap-2"
            >
              Upload Existing Photo
            </Button>
          </div>
        )}

        {/* Image with tap overlay */}
        {imageUrl && step !== "capture" && (
          <div className="relative rounded-xl overflow-hidden border border-[#2a3a5c]">
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Measurement photo"
              className="w-full block select-none"
              onClick={handleImageTap}
              draggable={false}
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none"
            />
            {step !== "result" && (
              <div className="absolute bottom-2 left-2 right-2 bg-black/60 backdrop-blur rounded-lg px-3 py-2 text-xs text-white text-center">
                Tap on the image above
              </div>
            )}
          </div>
        )}

        {/* Result */}
        {step === "result" && result && (
          <div className="bg-[#1e2e4a] border border-[#d4a75a]/40 rounded-2xl p-6 text-center space-y-4">
            <CheckCircle className="h-10 w-10 text-[#d4a75a] mx-auto" />
            <div>
              <div className="text-4xl font-extrabold text-white">{result.feet}</div>
              <div className="text-lg text-[#d4a75a] font-semibold mt-1">{result.cm.toFixed(1)} cm</div>
              <div className="text-sm text-[#8a9bb8] mt-1">{result.inches.toFixed(2)} inches</div>
            </div>
            <div className="text-xs text-[#6a7a9a]">
              Based on {REFERENCE_OBJECTS[refObjIdx].label} ({REFERENCE_OBJECTS[refObjIdx].mm} mm)
            </div>
            <div className="flex gap-3">
              <Button onClick={reset} variant="outline" className="flex-1 border-[#2a3a5c] text-white hover:bg-white/10">
                New Measurement
              </Button>
              <Button
                onClick={() => {
                  setStep("meas-point-1");
                  setMeasPoints(null);
                  setResult(null);
                }}
                className="flex-1 bg-[#d4a75a] text-[#1a2744] hover:bg-[#e0b86a] font-bold"
              >
                Measure Again
              </Button>
            </div>
          </div>
        )}

        {/* Tips */}
        {step === "capture" && (
          <div className="bg-[#1a2744] border border-[#2a3a5c] rounded-xl p-4 space-y-2">
            <h3 className="text-sm font-bold text-[#d4a75a]">Tips for Accurate Results</h3>
            <ul className="text-xs text-[#8a9bb8] space-y-1.5">
              <li>• Place the reference object on the same flat surface as what you're measuring</li>
              <li>• Take the photo straight-on, not at an angle</li>
              <li>• Make sure both the reference object and measurement target are clearly visible</li>
              <li>• Good lighting helps — avoid shadows across the reference object</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ARMeasure() {
  const [mode, setMode] = useState<Mode>("detecting");

  useEffect(() => {
    async function detect() {
      const nav = navigator as Navigator & { xr?: XRSystem };
      if (nav.xr) {
        try {
          const supported = await nav.xr.isSessionSupported("immersive-ar");
          if (supported) { setMode("webxr"); return; }
        } catch {
          // fall through
        }
      }
      setMode("photo");
    }
    detect();
  }, []);

  if (mode === "detecting") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0f1929] text-white">
        <div className="text-center space-y-4">
          <Ruler className="h-12 w-12 text-[#d4a75a] mx-auto animate-pulse" />
          <p className="text-[#8a9bb8]">Checking AR capabilities…</p>
        </div>
      </div>
    );
  }

  if (mode === "webxr") {
    return <WebXRMeasure onExit={() => setMode("photo")} />;
  }

  return <PhotoMeasure />;
}
