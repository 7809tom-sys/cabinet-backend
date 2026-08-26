import { describe, expect, it } from "vitest";
import { initialDesignWorkspaceView, threeDLeftCatalogDragPayload } from "./designTool3DWorkspace";

describe("3D-first design workspace", () => {
  it("opens the 3D workspace by default", () => {
    expect(initialDesignWorkspaceView("")).toBe("threeD");
    expect(initialDesignWorkspaceView("?view=3d")).toBe("threeD");
  });

  it("retains explicit bird's-eye and precision view links", () => {
    expect(initialDesignWorkspaceView("?view=plan")).toBe("plan");
    expect(initialDesignWorkspaceView("?view=front")).toBe("elevation");
    expect(initialDesignWorkspaceView("?view=split")).toBe("split");
    expect(initialDesignWorkspaceView("?view=hybrid")).toBe("hybrid");
    expect(initialDesignWorkspaceView("?view=3d-plan")).toBe("hybrid");
  });

  it("uses catalog payloads accepted by the 3D drop target for left-rail dragging", () => {
    expect(threeDLeftCatalogDragPayload("Cabinet", 42)).toBe("Cabinet:42");
    expect(threeDLeftCatalogDragPayload("Accessory", 7)).toBe("Accessory:7");
  });
});
