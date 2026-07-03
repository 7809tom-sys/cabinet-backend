import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Box, RotateCcw, X, Sparkles } from "lucide-react";
import { buildRoomBoxes, type Box3D, type SurfacePickLike } from "@/lib/room3d";
import type { PlacedCabinet, RoomData, WallSide } from "@/lib/design";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  room: RoomData;
  placed: PlacedCabinet[];
  surfaces?: SurfacePickLike[] | null;
  finishText?: string | null;
  secondFinishText?: string | null;
  /** The wall the user was editing; the camera opens facing it. */
  activeWall?: WallSide;
  /** Optional: open the AI photoreal preview instead. */
  onOpenAiPreview?: () => void;
};

// Inches → world units. We render in feet (÷12) so camera distances are sane.
const U = 1 / 12;

const LEGEND: { color: string; label: string }[] = [
  { color: "#c08a4e", label: "Cabinets (door style)" },
  { color: "#e9e7e2", label: "Countertop" },
  { color: "#d9d5cc", label: "Backsplash" },
  { color: "#b89778", label: "Floor" },
  { color: "#c9ccd1", label: "Appliances" },
];

// Camera azimuth (radians) to look toward a given wall, so the 3D opens roughly
// matching the elevation the user was just editing.
function cameraOffsetFor(wall: WallSide | undefined, W: number, D: number): THREE.Vector3 {
  const cx = W / 2;
  const cz = D / 2;
  const dist = Math.max(W, D) * 0.95 + 6;
  const up = Math.max(W, D) * 0.55 + 4;
  switch (wall) {
    // Looking AT the back wall → camera sits toward the front (+z), raised.
    case "top":
      return new THREE.Vector3(cx, up, cz + dist);
    case "bottom":
      return new THREE.Vector3(cx, up, cz - dist);
    case "left":
      return new THREE.Vector3(cx + dist, up, cz);
    case "right":
      return new THREE.Vector3(cx - dist, up, cz);
    default:
      // Default three-quarter view from the front-right.
      return new THREE.Vector3(cx + dist * 0.7, up, cz + dist * 0.8);
  }
}

export function Room3DView({
  open,
  onOpenChange,
  room,
  placed,
  surfaces,
  finishText,
  secondFinishText,
  activeWall,
  onOpenAiPreview,
}: Props) {
  const [mountEl, setMountEl] = useState<HTMLDivElement | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const homeRef = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const [empty, setEmpty] = useState(false);

  const resetView = useCallback(() => {
    const cam = cameraRef.current;
    const controls = controlsRef.current;
    const home = homeRef.current;
    if (!cam || !controls || !home) return;
    cam.position.copy(home.pos);
    controls.target.copy(home.target);
    controls.update();
  }, []);

  useEffect(() => {
    if (!open) return;
    const mount = mountEl;
    if (!mount) return;

    const hasCabinets = Array.isArray(placed) && placed.length > 0;
    setEmpty(!hasCabinets);

    const W = Math.max(1, room?.width ?? 144);
    const D = Math.max(1, room?.depth ?? 120);

    // ── Scene ────────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#f4f2ee");

    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 500;
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);

    // ── Lights ───────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(W * U * 0.6, Math.max(W, D) * U * 1.2, D * U * 1.1);
    key.castShadow = true;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-W * U * 0.5, Math.max(W, D) * U, -D * U * 0.5);
    scene.add(fill);

    // ── Build meshes from the pure geometry model ─────────────────────────────
    const boxes: Box3D[] = buildRoomBoxes({ room, placed, surfaces, finishText, secondFinishText });
    // Center the model on the origin so orbiting feels natural.
    const cx = W / 2;
    const cz = D / 2;
    const group = new THREE.Group();
    for (const b of boxes) {
      const geo = new THREE.BoxGeometry(b.size[0] * U, b.size[1] * U, b.size[2] * U);
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(b.color),
        transparent: (b.opacity ?? 1) < 1,
        opacity: b.opacity ?? 1,
        roughness: b.kind === "countertop" || b.kind === "sink" ? 0.35 : 0.8,
        metalness: b.kind === "sink" ? 0.4 : 0.05,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((b.center[0] - cx) * U, b.center[1] * U, (b.center[2] - cz) * U);
      mesh.castShadow = b.kind !== "floor" && b.kind !== "wall-structure";
      mesh.receiveShadow = b.kind === "floor" || b.kind === "countertop";
      group.add(mesh);
      // Edge lines for crisp definition on solid boxes.
      if (b.edge && (b.opacity ?? 1) >= 0.9 && b.kind !== "floor") {
        const edges = new THREE.EdgesGeometry(geo);
        const line = new THREE.LineSegments(
          edges,
          new THREE.LineBasicMaterial({ color: new THREE.Color(b.edge) }),
        );
        line.position.copy(mesh.position);
        group.add(line);
      }
    }
    scene.add(group);

    // ── Camera + controls ──────────────────────────────────────────────────────
    const offset = cameraOffsetFor(activeWall, W, D);
    camera.position.set((offset.x - cx) * U, offset.y * U, (offset.z - cz) * U);
    const target = new THREE.Vector3(0, Math.min(48, (room?.ceilingHeight ?? 96) * 0.35) * U, 0);
    camera.lookAt(target);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.copy(target);
    controls.maxPolarAngle = Math.PI / 2.05; // don't dip under the floor
    controls.minDistance = 2;
    controls.maxDistance = Math.max(W, D) * U * 3 + 20;
    controls.update();
    controlsRef.current = controls;
    homeRef.current = { pos: camera.position.clone(), target: target.clone() };

    // ── Render loop ────────────────────────────────────────────────────────────
    let raf = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(animate);
    };
    animate();

    // ── Resize handling ──────────────────────────────────────────────────────
    const onResize = () => {
      const w = mount.clientWidth || width;
      const h = mount.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    // ── Cleanup ────────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = (m as THREE.Mesh).material;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else if (mat) (mat as THREE.Material).dispose();
      });
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
    };
  }, [open, mountEl, room, placed, surfaces, finishText, secondFinishText, activeWall]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden gap-0">
        <DialogHeader className="px-6 pt-6 pb-3">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Box className="h-5 w-5 text-[#1a2744]" /> 3D View
          </DialogTitle>
          <DialogDescription>
            A true-to-layout 3D model built directly from your design — walls, cabinets, countertop,
            backsplash and floor. Drag to orbit, scroll to zoom.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pb-6">
          <div className="relative w-full aspect-[16/10] overflow-hidden rounded-xl border border-border bg-muted/30">
            <div ref={setMountEl} className="absolute inset-0" />
            {empty && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
                <Box className="h-8 w-8 text-muted-foreground" />
                <div className="text-sm font-medium text-foreground">Your room is empty</div>
                <div className="text-xs text-muted-foreground max-w-xs">
                  Place at least one cabinet to see it in 3D. The walls and floor are shown so you can
                  get your bearings.
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {LEGEND.map((l) => (
              <div key={l.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className="inline-block h-3 w-3 rounded-sm border border-black/10"
                  style={{ backgroundColor: l.color }}
                />
                {l.label}
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="bg-background">
              <X className="mr-1.5 h-4 w-4" /> Close
            </Button>
            <Button variant="outline" onClick={resetView} className="bg-background">
              <RotateCcw className="mr-1.5 h-4 w-4" /> Reset view
            </Button>
            {onOpenAiPreview && (
              <Button
                onClick={() => {
                  onOpenChange(false);
                  onOpenAiPreview();
                }}
                className="bg-[#1a2744] hover:bg-[#2d3f66]"
              >
                <Sparkles className="mr-1.5 h-4 w-4" /> AI Preview
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
