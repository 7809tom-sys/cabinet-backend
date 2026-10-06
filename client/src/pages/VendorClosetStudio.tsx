import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, CircleHelp, Download, FileText, Layers3, Move3D, Plus, RotateCcw, Ruler, ShoppingBag, Trash2, WandSparkles } from "lucide-react";
import { VendorClosetScene } from "@/components/vendor/VendorClosetScene";
import {
  addStudioBay, canStageStudioPart, createStudioDesign, createStudioReviewDemo, MODE_RECOMMENDATIONS, moveStudioItem,
  restoreStudioDesign, snapStudioPart, STUDIO_FINISHES, STUDIO_MODES, STUDIO_PART_KINDS, STUDIO_WALLS,
  studioCollision, studioFixedBottom, studioFixedTop, studioItemHeight, studioPartReferences, studioTakeoff, studioWallLength, studioWidth,
  type StudioDesign, type StudioItem, type StudioKind, type StudioMode, type StudioWall,
} from "@/lib/vendorClosetStudio";

const STORAGE_KEY = "vendor-closet-studio:v1";
const card: Record<StudioKind, { title: string; subtitle: string; icon: string }> = {
  shelf: { title: "Adjustable shelf", subtitle: "An easy place for anything", icon: "▰" },
  rod: { title: "Hanging rod", subtitle: "Hang what you reach for", icon: "─" },
  drawer: { title: "Small slab drawer", subtitle: "Matching MasterTrac front + box", icon: "▤" },
  shoe: { title: "Shoe organizer", subtitle: "See every pair", icon: "⌄" },
};
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const wallNames: Record<StudioWall, string> = { back: "Back wall", left: "Left wall", right: "Right wall", front: "Front wall" };
const modeNames: Record<StudioMode, string> = { closet: "Closet", pantry: "Pantry", mudroom: "Mudroom" };
const finishSwatch: Record<StudioDesign["finish"], string> = {
  "Glacier White": "#f1f0eb", "Slate Rift": "#555553", "Spiced Mahogany": "#774d3a",
};
function WallPicker({ value, onChange }: { value: StudioWall; onChange: (wall: StudioWall) => void }) {
  return <div className="relative mx-auto h-28 w-36 rounded-[5px] border border-[#bcb8ae] bg-[#f8f6f2]" role="group" aria-label="Choose a wall in the room">
    {STUDIO_WALLS.map((wall) => <button key={wall} type="button" aria-label={`Select ${wallNames[wall]}`} aria-pressed={value === wall} onClick={() => onChange(wall)}
      className={`absolute rounded-full border-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#b77c4b] ${value === wall ? "border-[#bd864f] bg-[#d7a46c] text-[#2d2620]" : "border-[#dfdcd4] bg-white text-[#857c70] hover:border-[#c3a47b]"} ${wall === "back" ? "left-7 right-7 top-[-6px] h-4" : wall === "front" ? "bottom-[-6px] left-7 right-7 h-4" : wall === "left" ? "left-[-7px] top-6 bottom-6 w-4" : "right-[-7px] top-6 bottom-6 w-4"}`} />)}
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] font-semibold tracking-[0.2em] text-[#b0aba2]">ROOM</span>
  </div>;
}
function Reference({ design, onClose }: { design: StudioDesign; onClose: () => void }) {
  const bill = useMemo(() => studioTakeoff(design), [design]);
  const download = () => {
    const lines = ["MASTERTRAC · MATERIAL REFERENCE ONLY", "March 1, 2022 customer List · not a checkout quote", `${modeNames[design.mode]} · ${design.finish} · ${design.mount} · ${wallNames[design.wall]}`, "", "SKU,Description,Quantity,2022 List unit,2022 List extended"];
    bill.lines.forEach((line) => lines.push([line.sku, `"${line.label.replaceAll('"', '""')}"`, line.qty, line.unitUsd.toFixed(2), (line.qty * line.unitUsd).toFixed(2)].join(",")));
    lines.push("", `Historical List reference total,,,,${bill.subtotalUsd.toFixed(2)}`, "", "UNVERIFIED: " + bill.missing.join(" | "));
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "mastertrac-2022-list-reference.csv"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };
  return <aside className="flex h-full min-h-0 flex-col border-l border-[#e0dbd2] bg-[#fcfaf6]" data-testid="vendor-reference-panel">
    <div className="flex items-start justify-between gap-2 border-b border-[#e5dfd5] p-5">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#ae7950]">Material reference</p><h2 className="mt-1 font-serif text-2xl text-[#282e32]">Every piece, accounted for.</h2><p className="mt-2 text-xs leading-relaxed text-[#776f64]">March 1, 2022 customer List. Historical reference only—<strong>not checkout pricing</strong>.</p></div>
      <button onClick={onClose} className="rounded-lg border border-[#dfd7cc] px-2 py-1 text-xs lg:hidden">Close</button>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      {(["cleat", "panel", "shelf", "accessory", "hardware"] as const).map((section) => {
        const items = bill.lines.filter((line) => line.section === section);
        if (!items.length) return null;
        const heading = { cleat: "01 · Start with the cleat", panel: "02 · Uprights / shared sides", shelf: "03 · Shelves", accessory: "04 · Placed accessories", hardware: "05 · Verified hardware" }[section];
        return <section key={section} className="mb-6"><h3 className="mb-3 border-b border-[#eae4da] pb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-[#837565]">{heading}</h3>
          <div className="space-y-3">{items.map((item) => <div key={`${section}-${item.sku}`} className="flex gap-3 text-xs">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#eae7df] font-semibold text-[#5e5449]">{item.qty}×</span>
            <div className="min-w-0 flex-1"><p className="font-semibold leading-snug text-[#343b3d]">{item.label}</p><p className="text-[11px] text-[#918779]">SKU {item.sku}{item.packNote ? ` · ${item.packNote}` : ""}</p></div>
            <span className="shrink-0 font-semibold tabular-nums text-[#343b3d]">{money(item.qty * item.unitUsd)}</span>
          </div>)}</div></section>;
      })}
      <div className="rounded-xl border border-[#e6d6bd] bg-[#fff6e6] p-3 text-[11px] leading-relaxed text-[#6c5b41]"><strong>Not an installation-ready bill.</strong> {bill.missing.join(" ")}</div>
    </div>
    <div className="border-t border-[#e5dfd5] bg-white p-5"><div className="flex items-baseline justify-between gap-4"><span className="text-xs font-semibold uppercase tracking-wider text-[#766a5d]">2022 List reference</span><strong className="font-serif text-3xl tabular-nums text-[#24322e]" data-testid="vendor-reference-total">{money(bill.subtotalUsd)}</strong></div><button type="button" onClick={download} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-[#243b32] text-xs font-bold text-white hover:bg-[#385348]"><Download className="h-4 w-4" /> Download material reference</button></div>
  </aside>;
}

export default function VendorClosetStudio() {
  const [isReviewDemo] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "mixed");
  const [design, setDesign] = useState<StudioDesign>(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === "mixed"
    ? createStudioReviewDemo() : restoreStudioDesign(typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null) ?? createStudioDesign());
  const [step, setStep] = useState<"start" | "studio">(isReviewDemo ? "studio" : "start");
  const [selectedBay, setSelectedBay] = useState(isReviewDemo ? 1 : 0);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [partToPlace, setPartToPlace] = useState<StudioKind | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showReference, setShowReference] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showRoom, setShowRoom] = useState(false);
  const [extraPart, setExtraPart] = useState<StudioKind | "">("");
  const [savedDraft] = useState(() => typeof window !== "undefined" && Boolean(restoreStudioDesign(localStorage.getItem(STORAGE_KEY))));
  useEffect(() => { if (!isReviewDemo) localStorage.setItem(STORAGE_KEY, JSON.stringify(design)); }, [design, isReviewDemo]);
  const bay = design.bays[selectedBay] ?? design.bays[0];
  const currentItem = bay.items.find((item) => item.id === selectedItem);
  const recommendation = MODE_RECOMMENDATIONS[design.mode];
  const updateDesign = (next: StudioDesign) => { setDesign(next); setNotice(null); };
  const place = (bayIndex: number, bottomIn: number, kind: StudioKind) => {
    const result = snapStudioPart(design, bayIndex, kind, bottomIn, crypto.randomUUID());
    if (!result.ok) { setNotice(result.reason); return; }
    updateDesign(result.design); setSelectedBay(bayIndex); setSelectedItem(result.item.id); setPartToPlace(null);
  };
  const changeElevation = (item: StudioItem, bottomIn: number) => {
    const result = moveStudioItem(design, selectedBay, item.id, bottomIn);
    if (!result.ok) { setNotice(result.reason); return; }
    updateDesign(result.design);
  };
  const removeItem = (item: StudioItem) => { updateDesign({ ...design, bays: design.bays.map((b, index) => index === selectedBay ? { ...b, items: b.items.filter((part) => part.id !== item.id) } : b) }); setSelectedItem(null); };
  const addNeighbor = () => {
    const result = addStudioBay(design);
    if (!result.ok) { setNotice(result.reason); return; }
    updateDesign(result.design); setSelectedBay(result.design.bays.length - 1); setSelectedItem(null);
  };
  const pickPart = (kind: StudioKind) => { setPartToPlace(kind); setSelectedItem(null); setNotice(`Now tap Tower ${selectedBay + 1} in 3D, or drag the part into any tower bay. Its height will snap to a free position.`); };
  const selectedWidth = (widthIn: 18 | 24 | 30) => {
    if (bay.widthIn === widthIn) return;
    const candidate: StudioDesign = { ...design, bays: design.bays.map((b, index) => index === selectedBay ? { ...b, widthIn } : b) };
    if (studioWidth(candidate) > studioWallLength(candidate)) { setNotice("This tower would exceed the selected wall. Choose a narrower bay or a longer wall."); return; }
    for (const item of bay.items) if (!studioPartReferences(candidate, selectedBay, item.kind)) { setNotice(`The ${widthIn} in bay has no matching ${item.kind} SKU in the selected finish. Remove or change that item first.`); return; }
    updateDesign(candidate);
  };
  const setMount = (mount: StudioDesign["mount"]) => {
    if (design.mount === mount) return;
    const candidate: StudioDesign = { ...design, mount };
    for (let i = 0; i < candidate.bays.length; i++) for (const item of candidate.bays[i].items) {
      const error = studioCollision(candidate, i, item, item.id);
      if (error) { setNotice(`Move your placed items first: ${error}`); return; }
    }
    updateDesign(candidate); setSelectedItem(null);
  };
  const onChangeWall = (wall: StudioWall) => {
    const candidate = { ...design, wall };
    if (studioWidth(candidate) > studioWallLength(candidate)) { setNotice(`${wallNames[wall]} is too short for ${studioWidth(candidate)} in of connected towers.`); return; }
    updateDesign(candidate); setShowRoom(false);
  };
  const reset = () => { if (confirm("Start a new local Closet Studio draft? This replaces only this browser's Studio draft, not any saved Cabinet Dealz Designer plan.")) { updateDesign(createStudioDesign()); setStep("start"); setSelectedBay(0); setSelectedItem(null); setPartToPlace(null); } };
  if (step === "start") return <div className="min-h-screen bg-[#f2f0ea] text-[#26332d]" data-testid="vendor-mode-gate">
    <header className="flex items-center justify-between border-b border-[#dfded6] bg-[#fbfaf7] px-5 py-4 sm:px-9"><a href="/" aria-label="Cabinet Dealz home" className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#244338] text-lg font-semibold text-[#f2e3c3]">M</span><span><strong className="block font-serif text-lg leading-none">MasterTrac Studio</strong><span className="text-[10px] uppercase tracking-[0.21em] text-[#8a8276]">Cabinet Dealz closet program</span></span></a><span className="text-xs font-medium text-[#797569]">A space that works for you.</span></header>
    <main className="mx-auto grid min-h-[calc(100vh-75px)] max-w-6xl items-center gap-10 px-5 py-12 lg:grid-cols-[1fr_0.92fr] lg:px-12">
      <div><div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#d7c8ae] bg-[#f9f4e9] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#97734a]"><WandSparkles className="h-4 w-4" /> Make room for real life</div><h1 className="max-w-xl font-serif text-5xl leading-[1.08] text-[#253c32] sm:text-6xl">Your space. <em className="font-normal text-[#b88151]">Your way.</em></h1><p className="mt-6 max-w-lg text-base leading-7 text-[#716e64]">Build a beautiful closet one tower at a time. Choose what the room is for; then place shelves, rods, drawers, and shoe organizers right where you want them.</p>
        <h2 className="mb-3 mt-10 text-xs font-bold uppercase tracking-[0.2em] text-[#60594e]">First, what are we designing?</h2><div className="grid max-w-lg grid-cols-3 gap-2 sm:gap-3">{STUDIO_MODES.map((mode) => <button key={mode} type="button" onClick={() => updateDesign({ ...design, mode })} aria-pressed={design.mode === mode} className={`min-h-24 rounded-xl border p-3 text-left transition-transform active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#ba8351] ${design.mode === mode ? "border-[#ba8351] bg-[#fffbf4] shadow-md" : "border-[#d9d5cb] bg-[#f9f8f4] hover:bg-white"}`}><span className="block text-lg">{mode === "closet" ? "◧" : mode === "pantry" ? "▧" : "⌂"}</span><strong className="mt-2 block text-xs sm:text-sm">{modeNames[mode]}</strong>{design.mode === mode && <Check className="float-right mt-[-18px] h-4 w-4 text-[#9e683a]" />}</button>)}</div>
        <button type="button" onClick={() => setStep("studio")} className="mt-7 flex h-13 min-h-12 w-full max-w-lg items-center justify-center gap-2 rounded-lg bg-[#244338] px-5 font-bold text-white shadow-lg shadow-[#244338]/15 transition-transform hover:bg-[#315444] active:scale-[0.98]">{savedDraft ? "Continue my local draft" : "Start with one tower"}<ArrowRight className="h-4 w-4" /></button><p className="mt-3 max-w-lg text-[11px] leading-relaxed text-[#868278]">Shown parts use the sourced March 2022 MasterTrac customer List only; no checkout or installation specification is implied.</p></div>
      <div className="relative min-h-[360px] overflow-hidden rounded-3xl bg-[#9b8978] shadow-[0_30px_90px_-50px_#43423a] lg:min-h-[560px]">
        <img src="/manus-storage/mastertrac-room-from-brochure_339f6cce.png" alt="MasterTrac closet inspiration from the manufacturer brochure; this is not the configured 3D design" className="absolute inset-0 h-full w-full object-cover object-center" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#17241e]/75 via-transparent to-[#17241e]/5" />
        <div className="absolute bottom-0 left-0 right-0 p-7 text-white"><span className="rounded-full border border-white/60 bg-black/30 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] backdrop-blur">Brochure inspiration · not your configured design</span><p className="mt-5 max-w-sm font-serif text-3xl leading-tight">Beautifully organized, one tower at a time.</p></div>
      </div>
    </main>
  </div>;
  return <div className="flex h-[100dvh] min-h-[580px] flex-col overflow-hidden bg-[#e9e5dc] text-[#29352f]" data-testid="vendor-closet-studio">
    <header className="z-30 flex h-16 shrink-0 items-center justify-between gap-2 border-b border-[#ded8cd] bg-[#fbfaf7] px-3 sm:px-5"><div className="flex min-w-0 items-center gap-2"><button type="button" aria-label="Back to room choice" title="Back to room choice" onClick={() => setStep("start")} className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[#f0ede6]"><ArrowLeft className="h-5 w-5" /></button><a href="/" aria-label="Cabinet Dealz home" className="hidden h-8 w-8 items-center justify-center rounded-lg bg-[#244338] text-[#f2e3c3] sm:flex">M</a><div className="min-w-0"><strong className="block truncate font-serif text-base leading-none sm:text-lg">{modeNames[design.mode]} Studio</strong><span className="mt-1 block truncate text-[10px] text-[#897f73]">One tower at a time · {design.finish}</span></div></div>
      <div className="hidden items-center gap-1 rounded-full bg-[#eeeae1] p-1 md:flex">{STUDIO_MODES.map((mode) => <button type="button" key={mode} aria-pressed={mode === design.mode} onClick={() => updateDesign({ ...design, mode })} className={`rounded-full px-4 py-2 text-xs font-semibold ${mode === design.mode ? "bg-white text-[#314739] shadow-sm" : "text-[#81766a]"}`}>{modeNames[mode]}</button>)}</div>
      <div className="flex items-center gap-1"><button type="button" onClick={() => setShowRoom(!showRoom)} aria-label="Room and wall settings" aria-expanded={showRoom} className="flex h-10 items-center gap-1 rounded-lg px-2 text-xs font-semibold hover:bg-[#eeeae1] lg:hidden"><Ruler className="h-4 w-4" /><span className="hidden min-[380px]:inline">Room</span></button><button type="button" onClick={() => setShowHelp(!showHelp)} title="How to use the Studio" aria-label="How to use the Studio" className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-[#eeeae1]"><CircleHelp className="h-5 w-5" /></button><button type="button" onClick={reset} title="Start a new local draft" aria-label="Start a new local draft" className="hidden h-10 w-10 items-center justify-center rounded-lg hover:bg-[#eeeae1] sm:flex"><RotateCcw className="h-4 w-4" /></button><button type="button" onClick={() => setShowReference(!showReference)} className="flex h-10 items-center gap-2 rounded-lg bg-[#244338] px-3 text-xs font-bold text-white hover:bg-[#315444] sm:px-4"><FileText className="h-4 w-4" /><span className="hidden sm:inline">Material reference</span><span className="sm:hidden">List</span></button></div>
    </header>
    {isReviewDemo && <div className="z-20 flex min-h-9 shrink-0 items-center justify-between gap-2 border-b border-[#d5c5a8] bg-[#fff3dc] px-3 py-1 text-[11px] font-semibold text-[#6d4d27] sm:px-5" data-testid="vendor-review-demo-banner"><span>Review example · 2 towers · matching MasterTrac small slab front · not your saved design</span><a href="/closet" className="shrink-0 underline underline-offset-2">Start my own</a></div>}
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      {showRoom && <button type="button" aria-label="Close room settings" onClick={() => setShowRoom(false)} className="absolute inset-0 z-30 bg-black/30 lg:hidden" />}
      <aside className={`${showRoom ? "absolute inset-y-0 left-0 z-40 flex w-[min(88vw,330px)] shadow-2xl" : "hidden"} shrink-0 flex-col overflow-y-auto border-r border-[#dfd8cc] bg-[#faf9f5] p-4 lg:static lg:z-auto lg:flex lg:w-[304px] lg:shadow-none xl:w-[320px]`} data-testid="vendor-controls">
        <button type="button" onClick={() => setShowRoom(false)} className="mb-3 h-10 self-end rounded-md border border-[#ded8cd] px-3 text-xs lg:hidden">Close room settings</button>
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#ad784d]">01 / Set the room</p><h2 className="mt-2 font-serif text-2xl">A place for everything.</h2><p className="mb-5 mt-2 text-xs leading-5 text-[#82796c]">Pick a wall, then build one tower. The shared side appears automatically when you add the next one.</p>
        <div className="mb-5 grid grid-cols-3 gap-1 rounded-lg bg-[#eeeae1] p-1 md:hidden" role="group" aria-label="Room mode">{STUDIO_MODES.map((mode) => <button type="button" key={mode} aria-pressed={mode === design.mode} onClick={() => updateDesign({ ...design, mode })} className={`h-10 rounded-md text-[11px] font-semibold ${mode === design.mode ? "bg-white text-[#314739] shadow-sm" : "text-[#81766a]"}`}>{modeNames[mode]}</button>)}</div>
        <div className="mb-5 rounded-xl border border-[#e5dfd5] bg-white p-4"><WallPicker value={design.wall} onChange={onChangeWall} /><p className="mt-4 text-center text-xs font-semibold">{wallNames[design.wall]} <span className="font-normal text-[#857e73]">· {studioWallLength(design)} in available</span></p><div className="mt-3 grid grid-cols-2 gap-2"><label className="text-[10px] text-[#81786d]">Room width (in)<input type="number" min="30" max="360" step="1" value={design.wallWidthIn} onChange={(e) => updateDesign({ ...design, wallWidthIn: Number(e.target.value) })} className="mt-1 h-9 w-full rounded border border-[#e1dbd1] bg-white px-2 text-sm text-[#364039]" /></label><label className="text-[10px] text-[#81786d]">Room depth (in)<input type="number" min="30" max="360" step="1" value={design.roomDepthIn} onChange={(e) => updateDesign({ ...design, roomDepthIn: Number(e.target.value) })} className="mt-1 h-9 w-full rounded border border-[#e1dbd1] bg-white px-2 text-sm text-[#364039]" /></label></div></div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#827b70]">How it mounts</p><div className="mb-5 grid grid-cols-2 gap-2">{(["floor", "hanging"] as const).map((mount) => <button key={mount} type="button" aria-pressed={design.mount === mount} onClick={() => setMount(mount)} className={`min-h-11 rounded-md border px-2 text-xs font-semibold ${design.mount === mount ? "border-[#b78151] bg-[#f6ebda]" : "border-[#e4dfd6] bg-white"}`}>{mount === "floor" ? "Floor-standing" : "Hanging"}</button>)}</div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#827b70]">Finish</p><div className="mb-5 space-y-1">{STUDIO_FINISHES.map((finish) => <button type="button" key={finish} aria-pressed={design.finish === finish} onClick={() => updateDesign({ ...design, finish })} className={`flex h-10 w-full items-center gap-3 rounded-md px-2 text-left text-xs ${finish === design.finish ? "bg-[#eee8dd] font-bold" : "hover:bg-[#f0ede6]"}`}><span className="h-6 w-6 rounded border border-black/15" style={{ backgroundColor: finishSwatch[finish] }} />{finish}{finish === design.finish && <Check className="ml-auto h-4 w-4" />}</button>)}</div>
        <div className="mt-auto border-t border-[#e6e0d6] pt-4"><p className="text-[11px] leading-5 text-[#81776a]">Real catalog parts, rendered as an inviting room preview. Finish and dimensions are source-based; connections, accessories and lighting are illustrative.</p></div>
      </aside>
      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="relative min-h-0 flex-1 bg-[#e7e2d8]"><VendorClosetScene design={design} selectedBay={selectedBay} partToPlace={partToPlace} onSelectBay={(index) => { setSelectedBay(index); setSelectedItem(null); }} onPlace={place} onError={setNotice} />
          <div className="pointer-events-none absolute left-3 top-3 max-w-[calc(100%-24px)] rounded-xl border border-white/70 bg-white/90 px-3 py-2 shadow-md backdrop-blur sm:left-5 sm:top-5 sm:px-4"><p className="text-[9px] font-bold uppercase tracking-[0.19em] text-[#aa7950]">Your {modeNames[design.mode].toLowerCase()} takes shape</p><div className="mt-1 flex items-center gap-2 text-sm font-semibold"><Layers3 className="h-4 w-4 text-[#976a46]" /> Tower {selectedBay + 1} of {design.bays.length}<span className="text-xs font-normal text-[#746c61]">· {bay.widthIn} in wide</span></div></div>
          <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-[#26362e]/90 px-3 py-2 text-[10px] font-medium text-white shadow-md sm:bottom-5 sm:left-5">{partToPlace ? `Tap the ${bay.widthIn} in bay to place ${card[partToPlace].title.toLowerCase()}` : "Drag to rotate · tap a tower to select"}</div>
          {showHelp && <div className="absolute right-3 top-3 z-10 max-w-[250px] rounded-xl border border-[#e1d7c6] bg-[#fffdf9] p-4 text-xs leading-5 shadow-xl sm:right-5 sm:top-5"><button className="float-right font-semibold" aria-label="Close help" onClick={() => setShowHelp(false)}>✕</button><strong>Three simple moves</strong><ol className="mt-2 list-inside list-decimal space-y-1"><li>Choose a room mode and wall.</li><li>Drag a part into a tower, or tap a part then the tower.</li><li>Slide the height below until it locks clear of other parts.</li></ol><p className="mt-2 text-[#847564]">Hardware with unknown source quantities remains flagged, not guessed.</p></div>}
        </div>
        <div className="shrink-0 border-t border-[#ded7cb] bg-[#faf9f5] px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 sm:px-5" data-testid="vendor-tower-controls">
          <div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2 overflow-x-auto py-1" role="group" aria-label="Select a tower">{design.bays.map((b, index) => <button type="button" key={b.id} onClick={() => { if (partToPlace) place(index, partToPlace === "rod" ? 64 : partToPlace === "shoe" ? 24 : partToPlace === "drawer" ? 20 : 42, partToPlace); else { setSelectedBay(index); setSelectedItem(null); } }} aria-label={partToPlace ? `Place ${card[partToPlace].title.toLowerCase()} in Tower ${index + 1}` : `Select Tower ${index + 1}`} aria-pressed={selectedBay === index} className={`h-9 shrink-0 rounded-md px-3 text-xs font-semibold ${selectedBay === index ? "bg-[#244338] text-white" : "border border-[#dfd8cc] bg-white"}`}>Tower {index + 1}</button>)}</div><button type="button" onClick={addNeighbor} disabled={design.bays.length >= 4} className="flex h-9 shrink-0 items-center gap-1 rounded-md border border-[#d6c3a6] bg-[#fff8ed] px-2 text-[11px] font-semibold text-[#72563b] disabled:opacity-40 sm:px-3"><Plus className="h-4 w-4" /> Add neighbor</button></div>
          <div className="flex items-center justify-between gap-2 pb-1 text-[11px] text-[#766f65]"><span><Ruler className="mr-1 inline h-3 w-3" /> {studioWidth(design)} of {studioWallLength(design)} in on {wallNames[design.wall].toLowerCase()}</span><div className="flex items-center gap-2"><span className="hidden sm:inline">Tower width</span><select aria-label="Selected tower clear width" value={bay.widthIn} onChange={(event) => selectedWidth(Number(event.target.value) as 18 | 24 | 30)} className="h-9 rounded-md border border-[#dfd8cc] bg-white px-2 text-xs"><option value="18">18 in</option><option value="24">24 in</option><option value="30">30 in</option></select></div></div>
        </div>
        <div className="shrink-0 border-t border-[#e4dcd0] bg-white px-3 py-2 sm:px-5" data-testid="vendor-part-tray"><div className="flex items-center justify-between gap-2"><span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#997851]">02 / Slide a piece into Tower {selectedBay + 1}</span><span className="hidden text-[10px] text-[#938a7d] sm:inline">Recommended for {modeNames[design.mode].toLowerCase()} · all verified SKUs remain available</span></div><div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {recommendation.map((kind) => { const error = canStageStudioPart(design, selectedBay, kind); return <button key={kind} type="button" draggable={!error} onDragStart={(event) => { if (error) { event.preventDefault(); return; } event.dataTransfer.setData("application/x-vendor-closet-part", kind); event.dataTransfer.effectAllowed = "copy"; }} disabled={Boolean(error)} aria-pressed={partToPlace === kind} onClick={() => pickPart(kind)} title={error ?? "Drag onto a tower or tap, then tap the tower"} className={`flex min-h-14 w-36 shrink-0 items-center gap-2 rounded-lg border px-3 text-left transition-transform active:scale-[0.97] disabled:opacity-40 ${partToPlace === kind ? "border-[#b47d48] bg-[#fff2dc]" : "border-[#e2ddd3] bg-[#f9f7f3] hover:border-[#bc9b74]"}`}><span className="text-2xl text-[#8d755b]">{card[kind].icon}</span><span><strong className="block text-[11px]">{card[kind].title}</strong><span className="block text-[9px] text-[#91867b]">{card[kind].subtitle}</span></span></button>; })}
          <label className="relative flex min-h-14 w-36 shrink-0 items-center rounded-lg border border-dashed border-[#ceb9a0] bg-[#fffdf9] px-2 text-[10px] font-semibold text-[#65584a]"><ChevronDown className="mr-1 h-4 w-4" /><select aria-label="More parts for selected tower" value={extraPart} onChange={(event) => { const kind = event.target.value as StudioKind | ""; setExtraPart(""); if (kind) pickPart(kind); }} className="w-full bg-transparent text-[10px]"><option value="">More verified parts</option>{STUDIO_PART_KINDS.filter((kind) => !recommendation.includes(kind)).map((kind) => <option key={kind} value={kind}>{card[kind].title}</option>)}<option disabled value="basket">Baskets: fit unverified</option></select></label>
        </div></div>
        {(currentItem || bay.items.length > 0) && <div className="flex max-h-32 shrink-0 items-center gap-2 overflow-x-auto border-t border-[#e5ddd1] bg-[#fbfaf7] px-3 py-2 sm:px-5" data-testid="vendor-placed-items"><span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-[#8b775d]">Tower {selectedBay + 1}</span>{bay.items.map((item) => <button type="button" key={item.id} onClick={() => { setSelectedItem(item.id); setPartToPlace(null); }} aria-pressed={selectedItem === item.id} className={`h-9 shrink-0 rounded-md px-3 text-[11px] font-semibold ${selectedItem === item.id ? "bg-[#ede0c8] text-[#4f3a22]" : "border border-[#e5ded4] bg-white text-[#6f655a]"}`}>{card[item.kind].title} · {item.bottomIn} in</button>)}</div>}
        {currentItem && <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[#e5ddd1] bg-[#fffaf1] px-3 py-2 text-[11px] sm:px-5" data-testid="vendor-height-control"><Move3D className="h-4 w-4 text-[#94734c]" /><strong className="whitespace-nowrap">Slide {card[currentItem.kind].title.toLowerCase()} height</strong><button aria-label="Lower selected item one inch" onClick={() => changeElevation(currentItem, currentItem.bottomIn - 1)} className="h-9 w-9 rounded-md border border-[#dfd5c5] bg-white">−</button><input aria-label="Selected item bottom height in inches" type="range" min={studioFixedBottom(design) + 1} max={studioFixedTop(design) - studioItemHeight(currentItem.kind)} step="1" value={currentItem.bottomIn} onChange={(event) => changeElevation(currentItem, Number(event.target.value))} className="min-w-[80px] flex-1 accent-[#9b6b3e]" /><button aria-label="Raise selected item one inch" onClick={() => changeElevation(currentItem, currentItem.bottomIn + 1)} className="h-9 w-9 rounded-md border border-[#dfd5c5] bg-white">+</button><span className="w-12 text-center font-bold tabular-nums">{currentItem.bottomIn} in</span><button type="button" aria-label={`Remove ${card[currentItem.kind].title.toLowerCase()}`} onClick={() => removeItem(currentItem)} className="flex h-9 w-9 items-center justify-center rounded-md text-[#9b674d] hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div>}
        {notice && <div role="status" className="shrink-0 border-t border-[#eacb9a] bg-[#fff6e5] px-4 py-2 text-xs text-[#73543a]">{notice}<button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)} className="float-right font-bold">✕</button></div>}
      </main>
      <div className={`${showReference ? "absolute inset-0 z-40 bg-black/35 lg:static lg:w-[322px] lg:bg-transparent xl:w-[345px]" : "hidden lg:block lg:w-[322px] xl:w-[345px]"}`} onClick={(e) => { if (e.target === e.currentTarget) setShowReference(false); }}><div className="ml-auto h-full w-[min(100vw,360px)] shadow-2xl lg:w-full lg:shadow-none"><Reference design={design} onClose={() => setShowReference(false)} /></div></div>
    </div>
  </div>;
}
