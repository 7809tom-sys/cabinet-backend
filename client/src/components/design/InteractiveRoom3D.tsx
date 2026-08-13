import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Camera, Download, LoaderCircle, Rotate3D, Share2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STD, type PlacedCabinet, type RoomData } from "@/lib/design";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type SceneSku = {
  distributorSkuId: number;
  cabinetId: number;
  masterCode: string;
  description: string | null;
  placementType: string | null;
  width: unknown;
  height: unknown;
  depth: unknown;
  numberOfDoors: number | null;
  numberOfDrawers: number | null;
};

export type InteractiveRoomScene = {
  roomShape: { id: string; name: string; defaultDimensions: unknown; geometryTemplate: unknown } | null;
  layout: { id: string; name: string } | null;
  suggestions: Array<{
    zone: { zoneKey: string; label: string; wallKey: string | null; sequence: number; placementType: string | null; required: boolean };
    sku: SceneSku | null;
  }>;
  materials: {
    cabinet: { publicName: string | null; name: string; color: string | null; finish: string | null; doorStyle: string | null; doorPanelType: string | null };
    defaults: { floor: string; countertop: string; backsplash: string; wall: string };
  } | null;
};

export type InteractiveRoomOrderSummary = {
  itemCount: number;
  pricedLineCount: number;
  unpricedLineCount: number;
  subtotal: number;
};

export type InteractiveRoomPresentation = {
  cabinetFinish: string;
  countertopFinish: string;
};

interface Props {
  scene: InteractiveRoomScene;
  /** Current 2D design items take precedence over starter-layout suggestions. */
  placed?: PlacedCabinet[];
  roomOverride?: RoomData;
  orderSummary?: InteractiveRoomOrderSummary;
  initialPresentation?: InteractiveRoomPresentation;
  shareContext?: { layoutPresetId: string; distributorId: number; styleId: number };
  className?: string;
}

const INCH = 1 / 12;
const BASE_DEPTH = 24;
const WALL_DEPTH = 12;
const COUNTERTOP_H = 37.5;
const WALL_BOTTOM = 54;
const CABINET_FINISHES = [
  { name: "Catalog finish", color: "catalog" },
  { name: "Soft White", color: "#f2f0ea" },
  { name: "Sage", color: "#78826b" },
  { name: "Navy", color: "#435b77" },
  { name: "Walnut", color: "#75523e" },
  { name: "Charcoal", color: "#34363a" },
] as const;
const COUNTERTOP_FINISHES = [
  { name: "Quartz", color: "#e9e7e2" },
  { name: "Carrara", color: "#d7d7d3" },
  { name: "Soapstone", color: "#3d4245" },
  { name: "Sand", color: "#c9b8a1" },
  { name: "Black", color: "#202124" },
] as const;
export const THREE_D_EXPORT_SIZE = { width: 2000, height: 1400 } as const;

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function dimensions(value: unknown) {
  const object = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    width: numberValue(object.width, 144),
    depth: numberValue(object.depth, 120),
    ceilingHeight: numberValue(object.ceilingHeight, 96),
  };
}

export function sceneCabinetColor(scene: InteractiveRoomScene) {
  const color = scene.materials?.cabinet.color?.trim() ?? "";
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  const source = `${scene.materials?.cabinet.finish ?? ""} ${color}`.toLowerCase();
  if (/(black|charcoal|obsidian|graphite)/.test(source)) return "#34363a";
  if (/(navy|blue|ocean)/.test(source)) return "#435b77";
  if (/(green|sage|forest)/.test(source)) return "#78826b";
  if (/(walnut|espresso|brown|mocha)/.test(source)) return "#75523e";
  if (/(oak|maple|honey|natural)/.test(source)) return "#c69a63";
  if (/(cream|beige|linen|almond)/.test(source)) return "#ded5c1";
  return "#f2f0ea";
}

function roomPolygon(geometryTemplate: unknown, width: number, depth: number) {
  const geometry = geometryTemplate && typeof geometryTemplate === "object" && !Array.isArray(geometryTemplate)
    ? geometryTemplate as Record<string, unknown>
    : {};
  const raw = Array.isArray(geometry.vertices) ? geometry.vertices : [];
  const points = raw
    .map((vertex) => vertex && typeof vertex === "object" ? vertex as Record<string, unknown> : {})
    .map((vertex) => new THREE.Vector2(
      Math.max(0, Math.min(width, numberValue(vertex.x, 0) * width)) * INCH,
      -Math.max(0, Math.min(depth, numberValue(vertex.y, 0) * depth)) * INCH,
    ));
  return points.length >= 3
    ? points
    : [new THREE.Vector2(0, 0), new THREE.Vector2(width * INCH, 0), new THREE.Vector2(width * INCH, -depth * INCH), new THREE.Vector2(0, -depth * INCH)];
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose?.();
  });
}

function addCabinet(
  root: THREE.Group,
  sku: SceneSku,
  wallKey: string | null,
  cursor: Record<string, number>,
  roomWidth: number,
  roomDepth: number,
  color: string,
  counterColor: string,
  transform?: { x: number; z: number; rotation: number; bottom?: number },
) {
  const placement = (sku.placementType ?? "base").toLowerCase();
  const isWall = placement === "wall";
  const isTall = placement === "tall";
  const widthIn = numberValue(sku.width, 24);
  const depthIn = numberValue(sku.depth, isWall ? WALL_DEPTH : BASE_DEPTH);
  const heightIn = numberValue(sku.height, isWall ? 30 : isTall ? 84 : 34.5);
  const key = wallKey === "left" ? "left" : wallKey === "right" ? "right" : wallKey === "front" ? "front" : "back";
  const along = cursor[key] ?? 3;
  cursor[key] = along + widthIn + 1.5;

  let x = along + widthIn / 2;
  let z = depthIn / 2;
  let rotation = 0;
  if (key === "front") { z = roomDepth - depthIn / 2; rotation = Math.PI; }
  if (key === "left") { x = depthIn / 2; z = along + widthIn / 2; rotation = Math.PI / 2; }
  if (key === "right") { x = roomWidth - depthIn / 2; z = along + widthIn / 2; rotation = -Math.PI / 2; }
  if (transform) ({ x, z, rotation } = transform);

  const bodyWidth = (key === "left" || key === "right" ? depthIn : widthIn) * INCH;
  const bodyDepth = (key === "left" || key === "right" ? widthIn : depthIn) * INCH;
  const bodyHeight = heightIn * INCH;
  const bottom = transform?.bottom ?? (isWall ? WALL_BOTTOM : 0);
  const cabinet = new THREE.Group();
  cabinet.position.set(x * INCH, (bottom + heightIn / 2) * INCH, z * INCH);
  cabinet.rotation.y = rotation;
  cabinet.userData = { distributorSkuId: sku.distributorSkuId, masterCode: sku.masterCode, label: sku.description ?? sku.masterCode };

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth),
    new THREE.MeshStandardMaterial({ color: "#c6b9a7", roughness: 0.72 }),
  );
  cabinet.add(body);

  const faceMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.46, metalness: 0.02 });
  const faceDepth = bodyDepth / 2 + 0.015;
  const doorCount = Math.max(1, sku.numberOfDoors ?? (isWall || isTall ? 2 : 1));
  const drawerCount = Math.max(0, sku.numberOfDrawers ?? 0);
  const usableHeight = bodyHeight - 0.08;
  const drawerHeight = drawerCount ? Math.min(usableHeight * 0.35, drawerCount * 0.3) : 0;
  const doorHeight = Math.max(0.2, usableHeight - drawerHeight);
  const frontGroup = new THREE.Group();
  frontGroup.position.z = faceDepth;
  for (let i = 0; i < doorCount; i++) {
    const doorWidth = (bodyWidth - 0.08) / doorCount;
    const door = new THREE.Mesh(new THREE.BoxGeometry(doorWidth - 0.03, doorHeight, 0.045), faceMaterial);
    door.position.set(-bodyWidth / 2 + 0.04 + doorWidth * (i + 0.5), -bodyHeight / 2 + 0.04 + doorHeight / 2, 0);
    frontGroup.add(door);
  }
  for (let i = 0; i < drawerCount; i++) {
    const drawer = new THREE.Mesh(new THREE.BoxGeometry(bodyWidth - 0.08, drawerHeight / drawerCount - 0.025, 0.048), faceMaterial);
    drawer.position.set(0, bodyHeight / 2 - 0.04 - (drawerHeight / drawerCount) * (i + 0.5), 0.004);
    frontGroup.add(drawer);
  }
  cabinet.add(frontGroup);
  cabinet.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(bodyWidth, bodyHeight, bodyDepth)), new THREE.LineBasicMaterial({ color: "#332d25", transparent: true, opacity: 0.34 })));
  root.add(cabinet);

  if (!isWall && !isTall && placement !== "accessory") {
    const counter = new THREE.Mesh(
      new THREE.BoxGeometry(bodyWidth + 0.12, 1.5 * INCH, bodyDepth + 0.12),
      new THREE.MeshStandardMaterial({ color: counterColor, roughness: 0.33, metalness: 0.03 }),
    );
    counter.position.copy(cabinet.position);
    counter.rotation.y = rotation;
    counter.position.y = COUNTERTOP_H * INCH;
    root.add(counter);
  }
}

export function existingCabinetTransform(cabinet: PlacedCabinet) {
  const width = numberValue(cabinet.width, 24);
  const depth = numberValue(cabinet.depth, BASE_DEPTH);
  const savedRotation = Number(cabinet.rotation);
  const rotation = Number.isFinite(savedRotation) ? savedRotation * Math.PI / 180 : 0;
  const bottom = cabinet.placement === "wall"
    ? numberValue(cabinet.mountBottom, WALL_BOTTOM)
    : cabinet.placement === "baseTop"
      ? STD.BASE_HEIGHT - numberValue(cabinet.height, 6)
      : cabinet.placement === "underCabinet"
        ? WALL_BOTTOM - numberValue(cabinet.height, 6)
        : 0;
  return { x: cabinet.x + width / 2, z: cabinet.y + depth / 2, rotation, bottom };
}

function existingCabinetSku(cabinet: PlacedCabinet): SceneSku {
  return {
    distributorSkuId: -(Math.abs(cabinet.cabinetId) || 1),
    cabinetId: cabinet.cabinetId,
    masterCode: cabinet.masterCode,
    description: cabinet.description,
    placementType: cabinet.placement,
    width: cabinet.width,
    height: cabinet.height ?? (cabinet.placement === "wall" ? STD.WALL_HEIGHT : cabinet.placement === "tall" ? STD.TALL_HEIGHT : STD.BASE_HEIGHT),
    depth: cabinet.depth,
    numberOfDoors: cabinet.numberOfDoors ?? null,
    numberOfDrawers: cabinet.numberOfDrawers ?? null,
  };
}

export function InteractiveRoom3D({ scene, placed = [], roomOverride, orderSummary, initialPresentation, shareContext, className }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const [autoRotate, setAutoRotate] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [cabinetFinish, setCabinetFinish] = useState(initialPresentation?.cabinetFinish ?? "catalog");
  const [countertopFinish, setCountertopFinish] = useState(initialPresentation?.countertopFinish ?? scene.materials?.defaults.countertop ?? "#e9e7e2");
  const [materialTransitioning, setMaterialTransitioning] = useState(false);
  const validSuggestions = useMemo(() => scene.suggestions.filter((entry) => entry.sku), [scene.suggestions]);
  const renderExistingDesign = placed.length > 0;
  const catalogFinish = sceneCabinetColor(scene);
  const resolvedCabinetFinish = cabinetFinish === "catalog" ? catalogFinish : cabinetFinish;
  const cabinetFinishLabel = CABINET_FINISHES.find((option) => option.color === cabinetFinish)?.name ?? "Custom finish";
  const countertopFinishLabel = COUNTERTOP_FINISHES.find((option) => option.color === countertopFinish)?.name ?? "Custom countertop";
  const shareMutation = trpc.roomLayouts.createShare.useMutation();

  useEffect(() => {
    setCabinetFinish(initialPresentation?.cabinetFinish ?? "catalog");
    setCountertopFinish(initialPresentation?.countertopFinish ?? scene.materials?.defaults.countertop ?? "#e9e7e2");
  }, [scene.materials?.cabinet.color, scene.materials?.cabinet.finish, scene.materials?.defaults.countertop, initialPresentation?.cabinetFinish, initialPresentation?.countertopFinish]);

  useEffect(() => {
    setMaterialTransitioning(true);
    const timer = window.setTimeout(() => setMaterialTransitioning(false), 340);
    return () => window.clearTimeout(timer);
  }, [cabinetFinish, countertopFinish]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || (!scene.roomShape && !roomOverride)) return;
    const room = roomOverride
      ? { width: roomOverride.width, depth: roomOverride.depth, ceilingHeight: roomOverride.ceilingHeight ?? STD.WALL_HEIGHT + WALL_BOTTOM }
      : dimensions(scene.roomShape?.defaultDimensions);
    const canvasWidth = Math.max(280, mount.clientWidth);
    const canvasHeight = Math.max(280, mount.clientHeight || 420);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance", preserveDrawingBuffer: true });
    } catch {
      setWebglUnavailable(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(canvasWidth, canvasHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    mount.replaceChildren(renderer.domElement);

    const threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color("#f6f3ed");
    const camera = new THREE.PerspectiveCamera(42, canvasWidth / canvasHeight, 0.1, 100);
    const maxSpan = Math.max(room.width, room.depth) * INCH;
    camera.position.set(maxSpan * 1.15, maxSpan * 0.92, maxSpan * 1.25);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(room.width * INCH * 0.5, 3.1, room.depth * INCH * 0.45);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.enablePan = true;
    controls.screenSpacePanning = true;
    controls.rotateSpeed = 0.68;
    controls.zoomSpeed = 0.84;
    controls.panSpeed = 0.72;
    controls.minPolarAngle = 0.2;
    controls.maxPolarAngle = Math.PI / 2.02;
    controls.minDistance = 3;
    controls.maxDistance = Math.max(14, maxSpan * 3.4);
    controls.autoRotate = autoRotate;
    controls.autoRotateSpeed = 1.1;
    controls.update();

    threeScene.add(new THREE.HemisphereLight("#fff8eb", "#526174", 2.2));
    const keyLight = new THREE.DirectionalLight("#fff6e8", 3.1);
    keyLight.position.set(maxSpan, maxSpan * 1.8, maxSpan * 0.8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 0.1;
    keyLight.shadow.camera.far = maxSpan * 4;
    threeScene.add(keyLight);
    const fillLight = new THREE.DirectionalLight("#b7d1ef", 1.05);
    fillLight.position.set(-maxSpan, maxSpan, maxSpan);
    threeScene.add(fillLight);
    const wallHeight = room.ceilingHeight * INCH;
    const warmLight = new THREE.PointLight("#ffdca6", 18, maxSpan * 3.2, 2);
    warmLight.position.set(room.width * INCH * 0.52, wallHeight * 0.76, room.depth * INCH * 0.48);
    threeScene.add(warmLight);

    const materialDefaults = { ...(scene.materials?.defaults ?? { floor: "#b89778", countertop: "#e9e7e2", backsplash: "#d9d5cc", wall: "#efece6" }), countertop: countertopFinish };
    const polygon = roomPolygon(
      roomOverride?.vertices?.length ? { vertices: roomOverride.vertices } : scene.roomShape?.geometryTemplate,
      room.width,
      room.depth,
    );
    const floorShape = new THREE.Shape(polygon);
    const floor = new THREE.Mesh(
      new THREE.ExtrudeGeometry(floorShape, { depth: 0.08, bevelEnabled: false }),
      new THREE.MeshStandardMaterial({ color: materialDefaults.floor, roughness: 0.78 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.08;
    floor.receiveShadow = true;
    threeScene.add(floor);

    const wallMaterial = new THREE.MeshStandardMaterial({ color: materialDefaults.wall, roughness: 0.92, side: THREE.DoubleSide });
    polygon.forEach((start, index) => {
      const end = polygon[(index + 1) % polygon.length];
      const dx = end.x - start.x;
      const dz = -(end.y - start.y);
      const length = Math.hypot(dx, dz);
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(length, wallHeight), wallMaterial.clone());
      wall.position.set((start.x + end.x) / 2, wallHeight / 2, (-start.y + -end.y) / 2);
      wall.rotation.y = Math.atan2(dz, dx);
      if (index > 1) (wall.material as THREE.MeshStandardMaterial).transparent = true, (wall.material as THREE.MeshStandardMaterial).opacity = 0.18;
      threeScene.add(wall);
    });
    const grid = new THREE.GridHelper(Math.max(room.width, room.depth) * INCH, 12, "#d9d3c8", "#e7e1d8");
    grid.position.set(room.width * INCH / 2, 0.01, room.depth * INCH / 2);
    threeScene.add(grid);

    const catalogRoot = new THREE.Group();
    const cursor = { back: 3, left: 3, right: 3, front: 3 };
    const finish = resolvedCabinetFinish;
    if (renderExistingDesign) {
      for (const cabinet of placed) {
        const sku = existingCabinetSku(cabinet);
        addCabinet(catalogRoot, sku, null, cursor, room.width, room.depth, finish, materialDefaults.countertop, existingCabinetTransform(cabinet));
      }
    } else {
      for (const suggestion of validSuggestions) {
        if (!suggestion.sku) continue;
        addCabinet(catalogRoot, suggestion.sku, suggestion.zone.wallKey, cursor, room.width, room.depth, finish, materialDefaults.countertop);
      }
    }
    threeScene.add(catalogRoot);
    rendererRef.current = renderer;
    sceneRef.current = threeScene;
    cameraRef.current = camera;

    let frame = 0;
    const render = () => {
      frame = requestAnimationFrame(render);
      controls.update();
      renderer.render(threeScene, camera);
    };
    render();
    const resizeObserver = new ResizeObserver(() => {
      const width = Math.max(280, mount.clientWidth);
      const height = Math.max(280, mount.clientHeight || 420);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    });
    resizeObserver.observe(mount);
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.dispose();
      disposeObject(threeScene);
      renderer.dispose();
      renderer.domElement.remove();
      if (rendererRef.current === renderer) rendererRef.current = null;
      if (sceneRef.current === threeScene) sceneRef.current = null;
      if (cameraRef.current === camera) cameraRef.current = null;
    };
  }, [scene, validSuggestions, placed, roomOverride, renderExistingDesign, autoRotate, resetKey, resolvedCabinetFinish, countertopFinish]);

  const downloadImage = () => {
    const renderer = rendererRef.current;
    const threeScene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !threeScene || !camera) return;
    const currentSize = new THREE.Vector2();
    renderer.getSize(currentSize);
    const currentPixelRatio = renderer.getPixelRatio();
    const { width: exportWidth, height: exportHeight } = THREE_D_EXPORT_SIZE;
    renderer.setPixelRatio(1);
    renderer.setSize(exportWidth, exportHeight, false);
    camera.aspect = exportWidth / exportHeight;
    camera.updateProjectionMatrix();
    renderer.render(threeScene, camera);
    const download = document.createElement("a");
    download.href = renderer.domElement.toDataURL("image/png");
    download.download = `cabinet-dealz-3d-room-${Date.now()}.png`;
    download.click();
    renderer.setPixelRatio(currentPixelRatio);
    renderer.setSize(currentSize.x, currentSize.y, false);
    camera.aspect = currentSize.x / currentSize.y;
    camera.updateProjectionMatrix();
  };

  const shareConfiguration = async () => {
    if (!shareContext || !roomOverride) {
      toast.error("Add your room and choose an active catalog door style before sharing.");
      return;
    }
    try {
      const { token } = await shareMutation.mutateAsync({
        ...shareContext,
        room: { ...roomOverride },
        placed,
        presentation: { cabinetFinish, countertopFinish },
        orderSummary,
      });
      const url = `${window.location.origin}/3d/${token}`;
      if (navigator.share) {
        await navigator.share({ title: "Cabinet Dealz 3D Room", text: "View this Cabinet Dealz 3D room configuration.", url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Share link copied to your clipboard.");
      }
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") toast.error("Could not create the share link. Please try again.");
    }
  };

  if ((!scene.roomShape && !roomOverride) || !scene.materials) {
    return <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed bg-muted/30 px-6 text-center text-sm text-muted-foreground">Choose an active distributor door style and a seeded room layout to generate a real catalog 3D preview.</div>;
  }
  if (webglUnavailable) {
    return <div className="flex min-h-[320px] items-center justify-center rounded-xl border border-dashed bg-muted/30 px-6 text-center text-sm text-muted-foreground">This device cannot start the interactive 3D view. Your 2D plan and elevation preview remain available.</div>;
  }

  return (
    <section className={className} aria-label="Interactive three-dimensional room preview">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Interactive 3D Preview</p>
          <p className="text-xs text-muted-foreground">{renderExistingDesign ? `${placed.length} cabinet${placed.length === 1 ? "" : "s"} from your current design` : `${scene.layout?.name} · ${validSuggestions.length} real catalog cabinet suggestion${validSuggestions.length === 1 ? "" : "s"}`}</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => setAutoRotate((current) => !current)}><Rotate3D className="mr-1.5 h-3.5 w-3.5" />{autoRotate ? "Pause" : "Rotate"}</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => setResetKey((current) => current + 1)}><Camera className="mr-1.5 h-3.5 w-3.5" />Reset</Button>
          <Button type="button" size="sm" variant="outline" onClick={downloadImage}><Download className="mr-1.5 h-3.5 w-3.5" />Download</Button>
          <Button type="button" size="sm" onClick={shareConfiguration} disabled={!shareContext || !roomOverride || shareMutation.isPending}>{shareMutation.isPending ? <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Share2 className="mr-1.5 h-3.5 w-3.5" />}{shareMutation.isPending ? "Creating" : "Share"}</Button>
        </div>
      </div>
      <div className="mb-3 grid gap-3 rounded-xl border bg-muted/25 p-3 sm:grid-cols-2">
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold"><Sparkles className="h-3.5 w-3.5 text-[#a87f33]" />Cabinet finish preview</p>
          <div className="flex flex-wrap gap-1.5">
            {CABINET_FINISHES.map((option) => {
              const color = option.color === "catalog" ? catalogFinish : option.color;
              return <button key={option.name} type="button" onClick={() => setCabinetFinish(option.color)} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors ${cabinetFinish === option.color ? "border-[#a87f33] bg-[#fff7e8]" : "border-border bg-background hover:bg-muted"}`}>
                <span className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: color }} />{option.name}
              </button>;
            })}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold">Countertop preview</p>
          <div className="flex flex-wrap gap-1.5">
            {COUNTERTOP_FINISHES.map((option) => <button key={option.name} type="button" onClick={() => setCountertopFinish(option.color)} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors ${countertopFinish === option.color ? "border-[#a87f33] bg-[#fff7e8]" : "border-border bg-background hover:bg-muted"}`}>
              <span className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: option.color }} />{option.name}
            </button>)}
          </div>
        </div>
        <p className="sm:col-span-2 text-[11px] text-muted-foreground">Preview materials change this image only. Your active catalog door style and order remain unchanged.</p>
      </div>
      {orderSummary && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#d9c196] bg-[#fffaf1] px-3 py-2.5">
          <div>
            <p className="text-xs font-semibold text-[#4b3a20]">Current design pricing</p>
            <p className="text-[11px] text-[#6e5d42]">{orderSummary.itemCount} item{orderSummary.itemCount === 1 ? "" : "s"} · {orderSummary.pricedLineCount} priced line{orderSummary.pricedLineCount === 1 ? "" : "s"}{orderSummary.unpricedLineCount ? ` · ${orderSummary.unpricedLineCount} awaiting price` : ""}</p>
            <p className="mt-1 text-[11px] text-[#6e5d42]">3D preview: {cabinetFinishLabel} cabinets · {countertopFinishLabel} countertop</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold tabular-nums text-[#382710]">${orderSummary.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            <p className="text-[10px] text-[#6e5d42]">Actual catalog-priced subtotal</p>
          </div>
          <p className="w-full text-[11px] text-[#6e5d42]">Preview finish and countertop changes do not alter this order subtotal. Choose a catalog-backed material in the 2D design to update order pricing.</p>
        </div>
      )}
      <div className={`relative h-[360px] overflow-hidden rounded-xl border bg-[#f6f3ed] shadow-inner transition-opacity duration-300 sm:h-[440px] touch-none ${materialTransitioning ? "opacity-75" : "opacity-100"}`}>
        <div ref={mountRef} className="h-full w-full" />
        {materialTransitioning && <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/25 backdrop-blur-[1px]"><span className="inline-flex items-center gap-2 rounded-full bg-background/95 px-3 py-1.5 text-xs font-medium shadow-sm"><LoaderCircle className="h-3.5 w-3.5 animate-spin text-[#a87f33]" />Updating preview</span></div>}
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">Drag to orbit or pan · Scroll or pinch to zoom · Download exports a {THREE_D_EXPORT_SIZE.width} × {THREE_D_EXPORT_SIZE.height} PNG · Cabinet geometry comes from the active distributor catalog</p>
    </section>
  );
}
