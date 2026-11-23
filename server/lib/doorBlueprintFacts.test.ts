import { describe, expect, it } from "vitest";
import { doorBlueprintFamily, doorGroundTruthBlock, withDoorGroundTruth } from "./doorBlueprintFacts";
import { aiDoorProviderRequest } from "./aiDoorDescribe";
import { doorImagePrompt } from "./aiDoorImage";
import { AI_DOOR_PROMPTS } from "../../shared/aiDoorPrompts";

const HONEY = {
  ourName: "Honey Core",
  distributorName: "Shaker Honey",
  doorStyle: "Shaker",
  woodSpecies: "Solid Birch",
  color: "SW 3122 Honey",
  finish: "UV Coated Natural Interior",
};
const SLAB = { ourName: "Arctic Slab", doorStyle: "Slab", woodSpecies: "Maple", color: "White", finish: "Painted" };
const claudeText = (groundTruth: typeof HONEY | typeof SLAB) => {
  const req = aiDoorProviderRequest({
    model: "claude", prompt: AI_DOOR_PROMPTS.claude, photoDataUrl: null, image: null, groundTruth,
    env: { anthropicApiKey: "test-key" },
  });
  return (req.body.messages as Array<{ content: Array<{ text: string }> }>)[0].content[0].text;
};

describe("door blueprint ground truth", () => {
  it("classifies shaker families like the frontend", () => {
    expect(doorBlueprintFamily(HONEY)).toBe("shaker");
    expect(doorBlueprintFamily({ doorStyle: "Slim Shaker" })).toBe("slim-shaker");
    expect(doorBlueprintFamily({ doorStyle: "Double Shaker" })).toBe("double-shaker");
    expect(doorBlueprintFamily({ doorStyle: "Hickory Shaker" })).toBe("hickory-shaker");
    expect(doorBlueprintFamily(SLAB)).toBe("other");
  });

  it("puts the DL Shaker ground truth in the Claude prompt for a plain shaker", () => {
    const text = claudeText(HONEY);
    expect(text.startsWith(AI_DOOR_PROMPTS.claude.trim())).toBe(true);
    expect(text).toContain("GROUND TRUTH");
    expect(text).toContain("Honey Core");
    expect(text).toContain("Shaker Honey");
    expect(text).toContain("Solid Birch");
    expect(text).toContain("SW 3122 Honey");
    expect(text).toContain("UV Coated Natural Interior");
    expect(text).toContain("DL Shaker blueprint");
    expect(text).toContain("single recessed flat center panel, two stiles and two rails");
    expect(text).toContain("standard 3 inch rail");
    expect(text).toContain("must not contradict");
  });

  it("states the blueprint does not apply to a non-shaker", () => {
    const text = claudeText(SLAB);
    expect(text).toContain("GROUND TRUTH");
    expect(text).toContain("Arctic Slab");
    expect(text).not.toContain("uses the DL Shaker blueprint");
    expect(text).toContain("DL Shaker blueprint does not apply");
  });

  it("uses a stored rail width and never repeats the block", () => {
    expect(doorGroundTruthBlock({ ...HONEY, railWidthIn: "2.75" })).toContain("standard 2.75 inch rail");
    const once = withDoorGroundTruth("p", HONEY);
    expect(withDoorGroundTruth(once, HONEY)).toBe(once);
  });

  it("also grounds the image prompt", () => {
    const prompt = doorImagePrompt({ description: "d", hasPhoto: false, groundTruth: HONEY });
    expect(prompt).toContain("DL Shaker blueprint");
    expect(prompt).toContain("Solid Birch");
  });
});
