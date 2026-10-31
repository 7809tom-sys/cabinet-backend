import { DOOR_DRAWER_FRONTS, DOOR_EDGE_PROFILES, DOOR_PANEL_CONSTRUCTIONS } from "@shared/doorProfiles";
import type { DoorProfileValues } from "@/lib/doorProfileForm";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DoorProfilePicker from "./DoorProfilePicker";

/**
 * The ONE door profile editor. Used by the admin Featured Door Styles dialog and
 * the Vendor Portal, so both get identical fields and the same picture picker.
 * The server (not this component) decides who may save which style.
 */
export default function DoorProfileEditor({
  values,
  onChange,
  idPrefix = "dp",
}: {
  values: DoorProfileValues;
  onChange: (next: DoorProfileValues) => void;
  idPrefix?: string;
}) {
  const set = <K extends keyof DoorProfileValues>(key: K, value: DoorProfileValues[K]) => onChange({ ...values, [key]: value });
  const measure = (key: "railWidth" | "stileWidth" | "centerRailWidth" | "bevelWidth" | "bevelDepth", label: string, hint: string, max: string, step: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${idPrefix}-${key}`}>{label}</Label>
      <Input id={`${idPrefix}-${key}`} type="number" min="0" max={max} step={step} value={values[key]} onChange={(e) => set(key, e.target.value)} placeholder="Unset" />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
  return (
    <div className="space-y-4" data-testid="door-profile-editor">
      <div className="grid grid-cols-3 gap-3">
        {measure("railWidth", "Rail width (in)", "Top & bottom rail", "99", "0.125")}
        {measure("stileWidth", "Stile width (in)", "Left & right stile", "99", "0.125")}
        {measure("centerRailWidth", "Center rail (in)", "Mid rail if any", "99", "0.125")}
      </div>
      <DoorProfilePicker label="Door profile (inside edge)" options={DOOR_EDGE_PROFILES} value={values.insideEdgeProfile} onChange={(v) => set("insideEdgeProfile", v)} testId="door-profile-edge-picker" />
      <DoorProfilePicker label="Panel construction" options={DOOR_PANEL_CONSTRUCTIONS} value={values.panelConstruction} onChange={(v) => set("panelConstruction", v)} testId="door-profile-panel-picker" />
      <DoorProfilePicker label="Drawer front" options={DOOR_DRAWER_FRONTS} value={values.drawerFrontType} onChange={(v) => set("drawerFrontType", v)} testId="door-profile-drawer-picker" />
      <div className="grid gap-3 sm:grid-cols-2">
        {measure("bevelWidth", "Bevel width (in)", "Raised-panel bevel", "12", "0.125")}
        {measure("bevelDepth", "Bevel depth (in)", "Raised-panel projection", "4", "0.0625")}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Finish sheen</Label>
          <Select value={values.finishSheen || "__unset"} onValueChange={(v) => set("finishSheen", v === "__unset" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__unset">Unset</SelectItem>
              <SelectItem value="satin">Satin</SelectItem>
              <SelectItem value="matte">Matte</SelectItem>
              <SelectItem value="gloss">Gloss</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Wood-grain direction</Label>
          <Select value={values.grainDirection || "__unset"} onValueChange={(v) => set("grainDirection", v === "__unset" ? "" : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__unset">Unset</SelectItem>
              <SelectItem value="vertical-stiles-horizontal-rails">Vertical stiles / horizontal rails</SelectItem>
              <SelectItem value="vertical">Vertical</SelectItem>
              <SelectItem value="horizontal">Horizontal</SelectItem>
              <SelectItem value="none">No visible grain direction</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-source`}>Official frame source citation</Label>
        <Input id={`${idPrefix}-source`} value={values.sourceSpecification} onChange={(e) => set("sourceSpecification", e.target.value)} placeholder="e.g. Skyline 2026 Slim Shaker catalog, style code SS-DW" />
        <p className="text-xs text-muted-foreground">Required with rail and stile measurements. Cite the official document and exact supplier style code.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-notes`}>Profile notes</Label>
        <Input id={`${idPrefix}-notes`} value={values.profileNotes} onChange={(e) => set("profileNotes", e.target.value)} placeholder="e.g. Beaded inner edge" />
      </div>
    </div>
  );
}
