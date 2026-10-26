import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { doorProfileKind } from "@/components/design/InteractiveRoom3D";

type SeedStyle = {
  ourName: string;
  doorStyle?: string | null;
  doorPanelType?: string | null;
};

const styles = JSON.parse(
  readFileSync(resolve(process.cwd(), "scripts/styles.json"), "utf8"),
) as SeedStyle[];

describe("Casselberry raised-panel profile", () => {
  it("keeps Antique White and Saddle on the same raised-panel construction", () => {
    const antiqueWhite = styles.find((style) => style.ourName === "Casselberry Antique White");
    const saddle = styles.find((style) => style.ourName === "Casselberry Saddle");

    expect(antiqueWhite).toMatchObject({ doorStyle: "Casselberry", doorPanelType: "Raised center panel" });
    expect(saddle).toMatchObject({ doorStyle: "Casselberry", doorPanelType: "Raised center panel" });
    expect(doorProfileKind(antiqueWhite?.doorStyle, antiqueWhite?.doorPanelType)).toBe("raised");
    expect(doorProfileKind(saddle?.doorStyle, saddle?.doorPanelType)).toBe("raised");
  });
});
