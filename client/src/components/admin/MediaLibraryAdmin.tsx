import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { FolderOpen, Search, Copy, ExternalLink, ImageIcon } from "lucide-react";

// ─── Cabinet Drawings manifest ────────────────────────────────────────────────
// All 29 line drawings extracted from the Capital Spec Book (V8 Digital).
// Each entry has a human-readable label, the CDN URL, and the cabinet family.

export interface MediaImage {
  key: string;
  label: string;
  family: "Base" | "Wall" | "Tall" | "Vanity";
  url: string;
}

export const CABINET_DRAWINGS: MediaImage[] = [
  // ── Base ──
  { key: "base_full_height_single",     label: "Base – Full Height Single Door",       family: "Base",   url: "/manus-storage/base_full_height_single_e7202551.png" },
  { key: "base_full_height_double",     label: "Base – Full Height Double Door",       family: "Base",   url: "/manus-storage/base_full_height_double_bfc5df55.png" },
  { key: "base_single_door_drawer",     label: "Base – Single Door / Single Drawer",   family: "Base",   url: "/manus-storage/base_single_door_drawer_e3c5fd05.png" },
  { key: "base_double_door_drawer",     label: "Base – Double Door / Single Drawer",   family: "Base",   url: "/manus-storage/base_double_door_drawer_268dc6aa.png" },
  { key: "base_double_door_2drawer",    label: "Base – Double Door / Double Drawer",   family: "Base",   url: "/manus-storage/base_double_door_2drawer_07ca52f7.png" },
  { key: "base_drawer_2",               label: "Base – 2-Drawer Bank",                 family: "Base",   url: "/manus-storage/base_drawer_2_b804efb7.png" },
  { key: "base_drawer_3",               label: "Base – 3-Drawer Bank",                 family: "Base",   url: "/manus-storage/base_drawer_3_3da24e31.png" },
  { key: "base_sink_single",            label: "Base – Sink Base Single Door",         family: "Base",   url: "/manus-storage/base_sink_single_14b5f051.png" },
  { key: "base_sink_double",            label: "Base – Sink Base Double Door",         family: "Base",   url: "/manus-storage/base_sink_double_c2fd33c9.png" },
  { key: "base_farm_sink",              label: "Base – Farm Sink Base",                family: "Base",   url: "/manus-storage/base_farm_sink_7c79b7c9.png" },
  { key: "base_blind",                  label: "Base – Blind Corner",                  family: "Base",   url: "/manus-storage/base_blind_940ac62d.png" },
  { key: "base_corner_easy_reach",      label: "Base – Corner Easy Reach",             family: "Base",   url: "/manus-storage/base_corner_easy_reach_f3dba079.png" },
  // ── Wall ──
  { key: "wall_single_door_30h",        label: "Wall – Single Door 30\"H",             family: "Wall",   url: "/manus-storage/wall_single_door_30h_004734a6.png" },
  { key: "wall_single_door_36h",        label: "Wall – Single Door 36\"H",             family: "Wall",   url: "/manus-storage/wall_single_door_36h_179304b7.png" },
  { key: "wall_single_door_42h",        label: "Wall – Single Door 42\"H",             family: "Wall",   url: "/manus-storage/wall_single_door_42h_7beea2a0.png" },
  { key: "wall_double_door_30h",        label: "Wall – Double Door 30\"H",             family: "Wall",   url: "/manus-storage/wall_double_door_30h_fc98e833.png" },
  { key: "wall_double_door_36h",        label: "Wall – Double Door 36\"H",             family: "Wall",   url: "/manus-storage/wall_double_door_36h_d7a434fb.png" },
  { key: "wall_double_door_42h",        label: "Wall – Double Door 42\"H",             family: "Wall",   url: "/manus-storage/wall_double_door_42h_68df20c4.png" },
  { key: "wall_glass_door",             label: "Wall – Glass Door",                    family: "Wall",   url: "/manus-storage/wall_glass_door_19a09f31.png" },
  { key: "wall_bridge",                 label: "Wall – Bridge Cabinet",                family: "Wall",   url: "/manus-storage/wall_bridge_9d83631d.png" },
  { key: "wall_corner_diagonal",        label: "Wall – Diagonal Corner",               family: "Wall",   url: "/manus-storage/wall_corner_diagonal_348139ee.png" },
  { key: "wall_refrigerator",           label: "Wall – Refrigerator Cabinet",          family: "Wall",   url: "/manus-storage/wall_refrigerator_7a03a889.png" },
  // ── Tall ──
  { key: "tall_utility_2door",          label: "Tall – Utility 2-Door",                family: "Tall",   url: "/manus-storage/tall_utility_2door_b5f37ce2.png" },
  { key: "tall_utility_4door",          label: "Tall – Utility 4-Door",                family: "Tall",   url: "/manus-storage/tall_utility_4door_a599103f.png" },
  { key: "tall_oven",                   label: "Tall – Oven Cabinet",                  family: "Tall",   url: "/manus-storage/tall_oven_89d1e438.png" },
  // ── Vanity ──
  { key: "vanity_sink_base_single",     label: "Vanity – Sink Base Single Door",       family: "Vanity", url: "/manus-storage/vanity_sink_base_single_d7409d3f.png" },
  { key: "vanity_sink_base_double",     label: "Vanity – Sink Base Double Door",       family: "Vanity", url: "/manus-storage/vanity_sink_base_double_8cd4a6de.png" },
  { key: "vanity_drawer",               label: "Vanity – Drawer Base",                 family: "Vanity", url: "/manus-storage/vanity_drawer_7f055e1f.png" },
  { key: "vanity_combo",                label: "Vanity – Door & Drawer Combo",         family: "Vanity", url: "/manus-storage/vanity_combo_e8fedbf9.png" },
];

const FAMILY_COLORS: Record<MediaImage["family"], string> = {
  Base:   "bg-blue-50 text-blue-700 border-blue-200",
  Wall:   "bg-purple-50 text-purple-700 border-purple-200",
  Tall:   "bg-green-50 text-green-700 border-green-200",
  Vanity: "bg-pink-50 text-pink-700 border-pink-200",
};

// ─── Props for embedding as a picker ─────────────────────────────────────────
interface MediaLibraryAdminProps {
  /** When provided, renders as an inline picker; clicking an image calls onPick */
  onPick?: (url: string) => void;
  /** Highlight this URL as currently selected */
  selectedUrl?: string | null;
}

export default function MediaLibraryAdmin({ onPick, selectedUrl }: MediaLibraryAdminProps) {
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState<MediaImage["family"] | "All">("All");

  const families: Array<MediaImage["family"] | "All"> = ["All", "Base", "Wall", "Tall", "Vanity"];

  const filtered = CABINET_DRAWINGS.filter((img) => {
    const matchesFamily = familyFilter === "All" || img.family === familyFilter;
    const matchesSearch = !search || img.label.toLowerCase().includes(search.toLowerCase());
    return matchesFamily && matchesSearch;
  });

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url).then(() => toast.success("URL copied to clipboard"));
  }

  const isPicker = !!onPick;

  return (
    <div className="space-y-4">
      {!isPicker && (
        <div className="flex items-center gap-3">
          <FolderOpen className="h-5 w-5 text-amber-600" />
          <div>
            <h2 className="text-lg font-semibold text-foreground">Media Library</h2>
            <p className="text-sm text-muted-foreground">
              Cabinet line drawings extracted from the Capital Spec Book V8. Use these images in cabinet descriptions and spec drawing fields.
            </p>
          </div>
        </div>
      )}

      {/* Folder breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <FolderOpen className="h-4 w-4 text-amber-500" />
        <span className="font-medium text-foreground">Cabinet Drawings</span>
        <span className="ml-2 text-xs bg-muted px-2 py-0.5 rounded-full">{CABINET_DRAWINGS.length} images</span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search drawings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="flex gap-1">
          {families.map((f) => (
            <button
              key={f}
              onClick={() => setFamilyFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                familyFilter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Image grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {filtered.map((img) => {
          const isSelected = selectedUrl === img.url;
          return (
            <div
              key={img.key}
              className={`group relative rounded-lg border bg-card overflow-hidden transition-all ${
                isPicker
                  ? "cursor-pointer hover:border-primary hover:shadow-md"
                  : "hover:border-border/80"
              } ${isSelected ? "border-primary ring-2 ring-primary/30" : "border-border"}`}
              onClick={() => isPicker && onPick(img.url)}
            >
              {/* Image */}
              <div className="h-28 bg-gradient-to-b from-white to-muted/20 flex items-center justify-center p-2 border-b border-border">
                <img
                  src={img.url}
                  alt={img.label}
                  className="h-full w-auto max-w-full object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                {isSelected && (
                  <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                    <div className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full font-medium">Selected</div>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-2 space-y-1">
                <p className="text-xs font-medium text-foreground leading-tight line-clamp-2">{img.label}</p>
                <span className={`inline-block text-[10px] font-medium border px-1.5 py-0.5 rounded ${FAMILY_COLORS[img.family]}`}>
                  {img.family}
                </span>
              </div>

              {/* Hover actions (non-picker mode) */}
              {!isPicker && (
                <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    title="Copy URL"
                    onClick={(e) => { e.stopPropagation(); copyUrl(img.url); }}
                    className="p-1 rounded bg-background/90 border border-border hover:bg-muted shadow-sm"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  <a
                    href={img.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Open full size"
                    onClick={(e) => e.stopPropagation()}
                    className="p-1 rounded bg-background/90 border border-border hover:bg-muted shadow-sm"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No drawings match your search.</p>
        </div>
      )}
    </div>
  );
}
