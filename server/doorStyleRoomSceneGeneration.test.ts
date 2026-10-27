import { describe, expect, it, vi } from "vitest";
import { ROOM_SCENE_CABINETRY_RULE, ROOM_SCENE_DOOR_DRAWER_REFERENCE_RULE } from "./lib/roomScenePromptRules";
import { AUTO_ROOM_SCENE_SOURCE_NOTE, ROOM_SCENE_GENERATION_NOT_CONFIGURED } from "../shared/doorStyleRoomSceneGeneration";
import {
  DuplicateGenerationJobError,
  applyDoorStyleRoomSceneGeneration,
  type AutoSceneRow,
  type DoorStyleSampleRow,
  type GenerationJobRow,
  type RoomSceneGenerationStore,
  type RoomSceneImageGenerator,
} from "./doorStyleRoomSceneGeneration";

function style(overrides: Partial<DoorStyleSampleRow> = {}): DoorStyleSampleRow {
  return {
    id: 7,
    distributorId: 3,
    ourName: "Lumina Blanc",
    doorStyle: "Shaker",
    finish: "Painted",
    color: "White",
    doorSampleImageUrl: "https://cdn.example/door.jpg",
    drawerSampleImageUrl: "https://cdn.example/drawer.jpg",
    doorSampleVerified: true,
    drawerSampleVerified: true,
    roomSceneImageUrl: null,
    ...overrides,
  };
}

function memoryStore(initial: DoorStyleSampleRow): RoomSceneGenerationStore & {
  style: DoorStyleSampleRow;
  job: GenerationJobRow | null;
  scenes: Array<AutoSceneRow & { styleId: number; sortOrder: number }>;
  sceneCount: number;
} {
  const state = {
    style: initial,
    job: null as GenerationJobRow | null,
    scenes: [] as Array<AutoSceneRow & { styleId: number; sortOrder: number }>,
    sceneCount: 0,
    nextSceneId: 1,
  };
  return {
    get style() { return state.style; },
    set style(value) { state.style = value; },
    get job() { return state.job; },
    get scenes() { return state.scenes; },
    get sceneCount() { return state.sceneCount; },
    set sceneCount(value: number) { state.sceneCount = value; },
    async loadStyle() { return state.style; },
    async loadJob() { return state.job; },
    async insertJob(job) {
      if (state.job) throw new DuplicateGenerationJobError();
      state.job = { id: 1, ...job };
    },
    async updateJob(_styleId, patch) {
      if (!state.job) throw new Error("missing job");
      state.job = { ...state.job, ...patch };
    },
    async countScenes() { return state.sceneCount + state.scenes.length; },
    async findAutoScene() { return state.scenes[0] ?? null; },
    async insertScene(input) {
      const id = state.nextSceneId++;
      state.scenes.push({ id, styleId: input.styleId, imageUrl: input.imageUrl, sortOrder: input.sortOrder, isVerified: false });
      return { id };
    },
    async updateScene(id, patch) {
      const scene = state.scenes.find((row) => row.id === id);
      if (!scene) throw new Error("missing scene");
      scene.imageUrl = patch.imageUrl;
      scene.isVerified = patch.isVerified;
    },
    async markSceneDraft(id) {
      const scene = state.scenes.find((row) => row.id === id);
      if (scene) scene.isVerified = false;
    },
    async clearPrimaryIfMatches(_styleId, imageUrl) {
      if (state.style.roomSceneImageUrl === imageUrl) state.style = { ...state.style, roomSceneImageUrl: null };
    },
  };
}

function generator(overrides: Partial<RoomSceneImageGenerator> = {}): RoomSceneImageGenerator & { calls: number } {
  const state = { calls: 0 };
  return {
    get calls() { return state.calls; },
    configured: overrides.configured ?? (() => true),
    generate: overrides.generate ?? (async () => {
      state.calls += 1;
      return { url: `https://cdn.example/scene-${state.calls}.jpg` };
    }),
  };
}

describe("applyDoorStyleRoomSceneGeneration", () => {
  it("locks the generated prompt to the verified door and drawer photos", async () => {
    const store = memoryStore(style({ ourName: "add more cabinets" }));
    let prompt = "";
    const images = generator({
      generate: async (input) => {
        prompt = input.prompt;
        return { url: "https://cdn.example/scene.jpg" };
      },
    });
    const result = await applyDoorStyleRoomSceneGeneration(store, images, 7);
    expect(result).toEqual({ outcome: "ready", reason: "first-time" });
    expect(prompt.startsWith(ROOM_SCENE_CABINETRY_RULE)).toBe(true);
    expect(prompt).toContain(ROOM_SCENE_DOOR_DRAWER_REFERENCE_RULE);
    expect(prompt).toContain("no extra cabinets, and no changes to door style, fronts, finish, hardware, or layout");
    expect(prompt.indexOf(ROOM_SCENE_CABINETRY_RULE)).toBeLessThan(prompt.indexOf("add more cabinets"));
    expect(prompt).toContain("verified cabinet door");
    expect(prompt).toContain("verified drawer front");
  });

  it("does not generate until both photos are verified", async () => {
    const store = memoryStore(style({ drawerSampleVerified: false }));
    const images = generator();
    const result = await applyDoorStyleRoomSceneGeneration(store, images, 7);
    expect(result).toEqual({ outcome: "skipped", reason: "not-ready" });
    expect(images.calls).toBe(0);
    expect(store.job).toBeNull();
    expect(store.scenes).toHaveLength(0);
  });

  it("saves one unverified draft scene and ignores a repeat verification", async () => {
    const store = memoryStore(style());
    const images = generator();
    const first = await applyDoorStyleRoomSceneGeneration(store, images, 7);
    const second = await applyDoorStyleRoomSceneGeneration(store, images, 7);
    expect(first).toEqual({ outcome: "ready", reason: "first-time" });
    expect(second).toEqual({ outcome: "skipped", reason: "same-images-ready" });
    expect(images.calls).toBe(1);
    expect(store.scenes).toHaveLength(1);
    expect(store.scenes[0]).toMatchObject({ imageUrl: "https://cdn.example/scene-1.jpg", isVerified: false });
    expect(store.job).toMatchObject({
      status: "ready",
      doorImageUrl: "https://cdn.example/door.jpg",
      drawerImageUrl: "https://cdn.example/drawer.jpg",
      sceneId: store.scenes[0]?.id,
      attemptCount: 1,
    });
  });

  it("replaces the existing auto scene after a new photo is verified", async () => {
    const store = memoryStore(style());
    const images = generator();
    await applyDoorStyleRoomSceneGeneration(store, images, 7);
    store.style = style({
      drawerSampleImageUrl: "https://cdn.example/drawer-2.jpg",
      roomSceneImageUrl: "https://cdn.example/scene-1.jpg",
    });
    store.scenes[0]!.isVerified = true;
    const replaced = await applyDoorStyleRoomSceneGeneration(store, images, 7);
    expect(replaced).toEqual({ outcome: "ready", reason: "images-replaced" });
    expect(images.calls).toBe(2);
    expect(store.scenes).toHaveLength(1);
    expect(store.scenes[0]).toMatchObject({ imageUrl: "https://cdn.example/scene-2.jpg", isVerified: false });
    expect(store.style.roomSceneImageUrl).toBeNull();
    expect(store.job?.doorImageUrl).toBe("https://cdn.example/door.jpg");
    expect(store.job?.drawerImageUrl).toBe("https://cdn.example/drawer-2.jpg");
  });

  it("records a failure without throwing and does not generate again until an admin retry", async () => {
    const store = memoryStore(style());
    const log = vi.fn();
    let generateImpl: RoomSceneImageGenerator["generate"] = async () => {
      throw new Error("provider unavailable");
    };
    const images = generator({ generate: (input) => generateImpl(input) });
    await expect(applyDoorStyleRoomSceneGeneration(store, images, 7, { log })).resolves.toEqual({
      outcome: "failed",
      reason: "provider unavailable",
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("style 7 failed: provider unavailable"));
    expect(store.job).toMatchObject({ status: "failed", errorMessage: "provider unavailable", attemptCount: 1 });
    expect(store.scenes).toHaveLength(0);

    const ignored = await applyDoorStyleRoomSceneGeneration(store, images, 7, { log });
    expect(ignored).toEqual({ outcome: "skipped", reason: "same-images-failed" });

    generateImpl = async () => ({ url: "https://cdn.example/retried.jpg" });
    const retried = await applyDoorStyleRoomSceneGeneration(store, images, 7, { forceRetry: true, log });
    expect(retried.outcome).toBe("ready");
    expect(store.job).toMatchObject({ status: "ready", imageUrl: "https://cdn.example/retried.jpg", attemptCount: 2 });
    expect(store.scenes).toHaveLength(1);
  });

  it("records the missing provider switch without calling image generation", async () => {
    const store = memoryStore(style());
    const log = vi.fn();
    const images = generator({ configured: () => false });
    const result = await applyDoorStyleRoomSceneGeneration(store, images, 7, { log });
    expect(result).toEqual({ outcome: "failed", reason: ROOM_SCENE_GENERATION_NOT_CONFIGURED });
    expect(images.calls).toBe(0);
    expect(store.job?.status).toBe("failed");
    expect(log).toHaveBeenCalledWith(expect.stringContaining(ROOM_SCENE_GENERATION_NOT_CONFIGURED));
    expect(AUTO_ROOM_SCENE_SOURCE_NOTE).toContain("Auto-generated draft");
  });

  it("fails closed when the style already has six room scenes", async () => {
    const store = memoryStore(style());
    store.sceneCount = 6;
    const images = generator();
    const result = await applyDoorStyleRoomSceneGeneration(store, images, 7);
    expect(result.outcome).toBe("failed");
    expect(result.reason).toMatch(/maximum of 6/);
    expect(images.calls).toBe(0);
    expect(store.scenes).toHaveLength(0);
  });

  it("returns an approved auto scene to draft when a sample photo is no longer verified", async () => {
    const store = memoryStore(style({ doorSampleVerified: false, roomSceneImageUrl: "https://cdn.example/scene-1.jpg" }));
    store.scenes.push({ id: 4, styleId: 7, imageUrl: "https://cdn.example/scene-1.jpg", sortOrder: 10, isVerified: true });
    const images = generator();
    const result = await applyDoorStyleRoomSceneGeneration(store, images, 7);
    expect(result).toEqual({ outcome: "skipped", reason: "not-ready" });
    expect(store.scenes[0]?.isVerified).toBe(false);
    expect(store.style.roomSceneImageUrl).toBeNull();
    expect(images.calls).toBe(0);
  });
});
