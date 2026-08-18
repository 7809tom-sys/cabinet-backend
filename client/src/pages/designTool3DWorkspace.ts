export type DesignWorkspaceView = "plan" | "threeD" | "elevation" | "split" | "corner" | "island";

/**
 * The 3D workspace is the normal starting point. Precision-focused deep links
 * remain explicit so designers can still open the bird's-eye plan directly.
 */
export function initialDesignWorkspaceView(search: string): DesignWorkspaceView {
  const view = new URLSearchParams(search).get("view");
  if (view === "plan") return "plan";
  if (view === "front") return "elevation";
  if (view === "split") return "split";
  if (view === "corner") return "corner";
  if (view === "island") return "island";
  return "threeD";
}
