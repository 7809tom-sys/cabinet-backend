import { randomUUID } from "crypto";
import { and, eq, sql } from "drizzle-orm";
import { doorStyleRoomSceneGenerations, doorStyleRoomScenes, doorStyles } from "../drizzle/schema";
import {
  AUTO_ROOM_SCENE_NAME,
  AUTO_ROOM_SCENE_SOURCE_NOTE,
  ROOM_SCENE_GENERATION_NOT_CONFIGURED,
  bothSampleImagesVerified,
  buildDoorStyleRoomScenePrompt,
  generationDecision,
  normalizedSampleUrl,
  type RoomSceneGenerationSnapshot,
  type RoomSceneGenerationStatus,
} from "../shared/doorStyleRoomSceneGeneration";
import { MAX_ROOM_SCENE_PHOTOS_PER_STYLE } from "../shared/vendorRoomScenes";
import { generateImage } from "./_core/imageGeneration";
import { getDb } from "./db";
import { isGeminiImageConfigured } from "./lib/geminiImageProvider";

const LOG_PREFIX = "[door-style-room-scene]";

export class DuplicateGenerationJobError extends Error {
  constructor() {
    super("Duplicate door style room scene generation");
    this.name = "DuplicateGenerationJobError";
  }
}

export type DoorStyleSampleRow = {
  id: number;
  distributorId: number;
  ourName: string;
  doorStyle: string | null;
  finish: string | null;
  color: string | null;
  doorSampleImageUrl: string | null;
  drawerSampleImageUrl: string | null;
  doorSampleVerified: boolean;
  drawerSampleVerified: boolean;
  roomSceneImageUrl: string | null;
};

export type GenerationJobRow = RoomSceneGenerationSnapshot & {
  id: number;
  styleId: number;
  claimToken: string | null;
  sceneId: number | null;
  imageUrl: string | null;
  errorMessage: string | null;
  attemptCount: number;
};

export type AutoSceneRow = {
  id: number;
  imageUrl: string;
  isVerified: boolean;
};

export interface RoomSceneGenerationStore {
  loadStyle(styleId: number): Promise<DoorStyleSampleRow | null>;
  loadJob(styleId: number): Promise<GenerationJobRow | null>;
  insertJob(job: Omit<GenerationJobRow, "id">): Promise<void>;
  updateJob(styleId: number, patch: Partial<Omit<GenerationJobRow, "id" | "styleId">>): Promise<void>;
  countScenes(styleId: number): Promise<number>;
  findAutoScene(styleId: number): Promise<AutoSceneRow | null>;
  insertScene(input: { styleId: number; imageUrl: string; sortOrder: number; sourceDistributorId: number }): Promise<{ id: number }>;
  updateScene(id: number, patch: { imageUrl: string; isVerified: boolean; isActive: boolean }): Promise<void>;
  markSceneDraft(id: number): Promise<void>;
  clearPrimaryIfMatches(styleId: number, imageUrl: string): Promise<void>;
}

export interface RoomSceneImageGenerator {
  configured(): boolean;
  generate(input: { prompt: string; originalImages: Array<{ url: string }> }): Promise<{ url?: string }>;
}

export type GenerationRunResult = {
  outcome: "skipped" | "ready" | "failed";
  reason: string;
};

function failureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Room scene generation failed";
  return message.slice(0, 512);
}

async function claimJob(
  store: RoomSceneGenerationStore,
  style: DoorStyleSampleRow,
  existing: GenerationJobRow | null,
  token: string,
): Promise<boolean> {
  const doorImageUrl = normalizedSampleUrl(style.doorSampleImageUrl)!;
  const drawerImageUrl = normalizedSampleUrl(style.drawerSampleImageUrl)!;
  const patch = {
    status: "generating" as const,
    doorImageUrl,
    drawerImageUrl,
    claimToken: token,
    errorMessage: null,
    attemptCount: (existing?.attemptCount ?? 0) + 1,
    sceneId: existing?.sceneId ?? null,
    imageUrl: existing?.imageUrl ?? null,
  };
  if (!existing) {
    try {
      await store.insertJob({ styleId: style.id, ...patch });
      return true;
    } catch (error) {
      if (!(error instanceof DuplicateGenerationJobError)) throw error;
      const current = await store.loadJob(style.id);
      if (!current || current.claimToken === token) return current?.claimToken === token;
      if (current.status === "generating" || current.status === "pending" || current.status === "ready") {
        if (current.doorImageUrl === doorImageUrl && current.drawerImageUrl === drawerImageUrl) return false;
      }
      await store.updateJob(style.id, patch);
    }
  } else {
    await store.updateJob(style.id, patch);
  }
  const confirmed = await store.loadJob(style.id);
  return confirmed?.claimToken === token;
}

async function recordFailure(
  store: RoomSceneGenerationStore,
  styleId: number,
  token: string,
  message: string,
  log: (message: string) => void,
): Promise<GenerationRunResult> {
  log(`${LOG_PREFIX} style ${styleId} failed: ${message}`);
  const current = await store.loadJob(styleId);
  if (current?.claimToken === token) {
    await store.updateJob(styleId, { status: "failed", errorMessage: message, claimToken: null });
  }
  return { outcome: "failed", reason: message };
}

/**
 * Generates at most one auto room scene for the current verified door + drawer
 * pair. Failures are stored on the job row and are not thrown, so a caller can
 * run this after a verification request without failing that request.
 */
export async function applyDoorStyleRoomSceneGeneration(
  store: RoomSceneGenerationStore,
  generator: RoomSceneImageGenerator,
  styleId: number,
  options?: { forceRetry?: boolean; log?: (message: string) => void; newToken?: () => string },
): Promise<GenerationRunResult> {
  const log = options?.log ?? ((message) => console.error(message));
  const style = await store.loadStyle(styleId);
  if (!style) return { outcome: "skipped", reason: "missing-style" };

  if (!bothSampleImagesVerified(style)) {
    const autoScene = await store.findAutoScene(styleId);
    if (autoScene?.isVerified) {
      await store.markSceneDraft(autoScene.id);
      await store.clearPrimaryIfMatches(styleId, autoScene.imageUrl);
    }
    return { outcome: "skipped", reason: "not-ready" };
  }

  const existing = await store.loadJob(styleId);
  const decision = generationDecision(style, existing, { forceRetry: options?.forceRetry });
  if (decision.action === "skip") return { outcome: "skipped", reason: decision.reason };

  const token = options?.newToken?.() ?? randomUUID();
  const claimed = await claimJob(store, style, existing, token);
  if (!claimed) return { outcome: "skipped", reason: "same-images-in-progress" };

  const autoScene = await store.findAutoScene(styleId);
  const sceneCount = await store.countScenes(styleId);
  if (!autoScene && sceneCount >= MAX_ROOM_SCENE_PHOTOS_PER_STYLE) {
    return recordFailure(
      store,
      styleId,
      token,
      "This Door Style already has the maximum of 6 room scenes.",
      log,
    );
  }

  if (!generator.configured()) {
    return recordFailure(store, styleId, token, ROOM_SCENE_GENERATION_NOT_CONFIGURED, log);
  }

  const doorImageUrl = normalizedSampleUrl(style.doorSampleImageUrl)!;
  const drawerImageUrl = normalizedSampleUrl(style.drawerSampleImageUrl)!;
  let generatedUrl: string | undefined;
  try {
    const generated = await generator.generate({
      prompt: buildDoorStyleRoomScenePrompt(style),
      originalImages: [{ url: doorImageUrl }, { url: drawerImageUrl }],
    });
    generatedUrl = generated.url?.trim();
    if (!generatedUrl) throw new Error("Image generation returned no URL");
  } catch (error) {
    return recordFailure(store, styleId, token, failureMessage(error), log);
  }

  try {
    let sceneId = autoScene?.id ?? null;
    if (autoScene) {
      const previousImageUrl = autoScene.imageUrl;
      await store.updateScene(autoScene.id, { imageUrl: generatedUrl, isVerified: false, isActive: true });
      if (style.roomSceneImageUrl && style.roomSceneImageUrl === previousImageUrl) {
        await store.clearPrimaryIfMatches(styleId, previousImageUrl);
      }
    } else {
      const inserted = await store.insertScene({
        styleId,
        imageUrl: generatedUrl,
        sortOrder: sceneCount * 10 + 10,
        sourceDistributorId: style.distributorId,
      });
      sceneId = inserted.id;
    }
    const current = await store.loadJob(styleId);
    if (current?.claimToken === token) {
      await store.updateJob(styleId, {
        status: "ready",
        imageUrl: generatedUrl,
        sceneId,
        errorMessage: null,
        claimToken: null,
      });
    }
    return { outcome: "ready", reason: decision.reason };
  } catch (error) {
    return recordFailure(store, styleId, token, failureMessage(error), log);
  }
}

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

function duplicateKey(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /duplicate/i.test(message);
}

export function createDrizzleRoomSceneStore(db: Db): RoomSceneGenerationStore {
  return {
    async loadStyle(styleId) {
      const [style] = await db.select({
        id: doorStyles.id,
        distributorId: doorStyles.distributorId,
        ourName: doorStyles.ourName,
        doorStyle: doorStyles.doorStyle,
        finish: doorStyles.finish,
        color: doorStyles.color,
        doorSampleImageUrl: doorStyles.doorSampleImageUrl,
        drawerSampleImageUrl: doorStyles.drawerSampleImageUrl,
        doorSampleVerified: doorStyles.doorSampleVerified,
        drawerSampleVerified: doorStyles.drawerSampleVerified,
        roomSceneImageUrl: doorStyles.roomSceneImageUrl,
      }).from(doorStyles).where(eq(doorStyles.id, styleId)).limit(1);
      return style ?? null;
    },
    async loadJob(styleId) {
      const [job] = await db.select({
        id: doorStyleRoomSceneGenerations.id,
        styleId: doorStyleRoomSceneGenerations.styleId,
        status: doorStyleRoomSceneGenerations.status,
        doorImageUrl: doorStyleRoomSceneGenerations.doorImageUrl,
        drawerImageUrl: doorStyleRoomSceneGenerations.drawerImageUrl,
        claimToken: doorStyleRoomSceneGenerations.claimToken,
        sceneId: doorStyleRoomSceneGenerations.sceneId,
        imageUrl: doorStyleRoomSceneGenerations.imageUrl,
        errorMessage: doorStyleRoomSceneGenerations.errorMessage,
        attemptCount: doorStyleRoomSceneGenerations.attemptCount,
      }).from(doorStyleRoomSceneGenerations).where(eq(doorStyleRoomSceneGenerations.styleId, styleId)).limit(1);
      return job ? { ...job, status: job.status as RoomSceneGenerationStatus } : null;
    },
    async insertJob(job) {
      try {
        await db.insert(doorStyleRoomSceneGenerations).values({
          styleId: job.styleId,
          status: job.status,
          doorImageUrl: job.doorImageUrl,
          drawerImageUrl: job.drawerImageUrl,
          claimToken: job.claimToken,
          sceneId: job.sceneId,
          imageUrl: job.imageUrl,
          errorMessage: job.errorMessage,
          attemptCount: job.attemptCount,
        });
      } catch (error) {
        if (duplicateKey(error)) throw new DuplicateGenerationJobError();
        throw error;
      }
    },
    async updateJob(styleId, patch) {
      await db.update(doorStyleRoomSceneGenerations).set(patch).where(eq(doorStyleRoomSceneGenerations.styleId, styleId));
    },
    async countScenes(styleId) {
      const [{ sceneCount }] = await db.select({ sceneCount: sql<number>`count(*)` }).from(doorStyleRoomScenes)
        .where(eq(doorStyleRoomScenes.styleId, styleId));
      return Number(sceneCount ?? 0);
    },
    async findAutoScene(styleId) {
      const [scene] = await db.select({
        id: doorStyleRoomScenes.id,
        imageUrl: doorStyleRoomScenes.imageUrl,
        isVerified: doorStyleRoomScenes.isVerified,
      }).from(doorStyleRoomScenes).where(and(
        eq(doorStyleRoomScenes.styleId, styleId),
        eq(doorStyleRoomScenes.sourceNote, AUTO_ROOM_SCENE_SOURCE_NOTE),
      )).limit(1);
      return scene ?? null;
    },
    async insertScene(input) {
      const [result] = await db.insert(doorStyleRoomScenes).values({
        styleId: input.styleId,
        imageUrl: input.imageUrl,
        sortOrder: input.sortOrder,
        sceneName: AUTO_ROOM_SCENE_NAME,
        sceneDescription: "Draft kitchen photo generated from the verified door and drawer-front samples.",
        isCover: false,
        isVerified: false,
        isActive: true,
        sourceDistributorId: input.sourceDistributorId,
        sourceNote: AUTO_ROOM_SCENE_SOURCE_NOTE,
      });
      return { id: Number((result as { insertId?: number }).insertId ?? 0) };
    },
    async updateScene(id, patch) {
      await db.update(doorStyleRoomScenes).set({
        imageUrl: patch.imageUrl,
        isVerified: patch.isVerified,
        isActive: patch.isActive,
        sourceNote: AUTO_ROOM_SCENE_SOURCE_NOTE,
      }).where(eq(doorStyleRoomScenes.id, id));
    },
    async markSceneDraft(id) {
      await db.update(doorStyleRoomScenes).set({ isVerified: false }).where(eq(doorStyleRoomScenes.id, id));
    },
    async clearPrimaryIfMatches(styleId, imageUrl) {
      await db.update(doorStyles).set({ roomSceneImageUrl: null }).where(and(
        eq(doorStyles.id, styleId),
        eq(doorStyles.roomSceneImageUrl, imageUrl),
      ));
    },
  };
}

const geminiRoomSceneGenerator: RoomSceneImageGenerator = {
  configured: () => isGeminiImageConfigured(),
  generate: (input) => generateImage({
    prompt: input.prompt,
    quality: "medium",
    originalImages: input.originalImages,
  }),
};

const forceRetryStyleIds = new Set<number>();

export async function runDoorStyleRoomSceneGeneration(styleId: number, options?: { forceRetry?: boolean }): Promise<GenerationRunResult> {
  const db = await getDb();
  if (!db) {
    console.error(`${LOG_PREFIX} style ${styleId} skipped: database unavailable`);
    return { outcome: "skipped", reason: "database-unavailable" };
  }
  return applyDoorStyleRoomSceneGeneration(createDrizzleRoomSceneStore(db), geminiRoomSceneGenerator, styleId, options);
}

/** Queue generation after the verification request has already returned. */
export function scheduleDoorStyleRoomSceneGeneration(styleId: number, options?: { forceRetry?: boolean }): void {
  if (options?.forceRetry) forceRetryStyleIds.add(styleId);
  setImmediate(() => {
    const forceRetry = forceRetryStyleIds.delete(styleId);
    void runDoorStyleRoomSceneGeneration(styleId, { forceRetry }).catch((error) => {
      console.error(`${LOG_PREFIX} style ${styleId} background run failed:`, failureMessage(error));
    });
  });
}

export function scheduleDoorStyleRoomSceneGenerationForStyles(styleIds: number[]): void {
  for (const styleId of Array.from(new Set(styleIds))) scheduleDoorStyleRoomSceneGeneration(styleId);
}
