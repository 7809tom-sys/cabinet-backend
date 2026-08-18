import { describe, expect, it } from "vitest";
import { initialDesignWorkspaceView } from "./designTool3DWorkspace";

describe("3D-first design workspace", () => {
  it("opens the 3D workspace by default", () => {
    expect(initialDesignWorkspaceView("")).toBe("threeD");
    expect(initialDesignWorkspaceView("?view=3d")).toBe("threeD");
  });

  it("retains explicit bird's-eye and precision view links", () => {
    expect(initialDesignWorkspaceView("?view=plan")).toBe("plan");
    expect(initialDesignWorkspaceView("?view=front")).toBe("elevation");
    expect(initialDesignWorkspaceView("?view=split")).toBe("split");
  });
});
