import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import { storageGetSignedUrl, storagePut } from "../storage";
import {
  COMMERCIAL_CAPTION_MAX_LENGTH,
  COMMERCIAL_CHANNELS,
  COMMERCIAL_TITLE_MAX_LENGTH,
} from "@shared/commercialVideo";
import { dryRunAdapterFor } from "../commercials/channelAdapter";
import {
  archiveCommercial,
  getCommercial,
  listCommercials,
  publishCommercial,
  savePublishDraft,
  signedCommercialFile,
  suggestTags,
  updateCommercial,
  uploadCommercial,
  type CommercialDeps,
} from "../commercials/service";
import { sqlCommercialStore } from "../commercials/sqlStore";

const deps: CommercialDeps = {
  store: sqlCommercialStore,
  putFile: storagePut,
  signFile: (key) => storageGetSignedUrl(key),
  adapterFor: dryRunAdapterFor,
  now: () => new Date(),
};

/**
 * Test routers pass their own store and adapter. Production uses the document
 * library and the dry-run adapter, which never posts to a social account.
 */
export function createCommercialsRouter(overrides: Partial<CommercialDeps> = {}) {
  const resolved: CommercialDeps = { ...deps, ...overrides };
  return router({
    list: adminProcedure
      .input(z.object({
        query: z.string().max(200).optional(),
        includeArchived: z.boolean().optional(),
      }).optional())
      .query(({ input }) => listCommercials(resolved, input ?? {})),

    get: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(({ input }) => getCommercial(resolved, input.id)),

    tagSuggestions: adminProcedure
      .input(z.object({ prefix: z.string().trim().min(1).max(40) }))
      .query(({ input }) => suggestTags(resolved, input.prefix)),

    upload: adminProcedure
      .input(z.object({
        title: z.string().trim().min(1).max(COMMERCIAL_TITLE_MAX_LENGTH),
        caption: z.string().trim().max(COMMERCIAL_CAPTION_MAX_LENGTH).nullable().optional(),
        filename: z.string().trim().min(1).max(255),
        mimeType: z.string().trim().max(128),
        dataBase64: z.string().min(1),
        tags: z.array(z.string().max(80)).max(20).optional(),
      }))
      .mutation(({ ctx, input }) => uploadCommercial(resolved, input, ctx.user.id)),

    update: adminProcedure
      .input(z.object({
        id: z.number().int().positive(),
        title: z.string().trim().min(1).max(COMMERCIAL_TITLE_MAX_LENGTH).optional(),
        caption: z.string().trim().max(COMMERCIAL_CAPTION_MAX_LENGTH).nullable().optional(),
        tags: z.array(z.string().max(80)).max(20).optional(),
      }))
      .mutation(({ input }) => updateCommercial(resolved, input)),

    archive: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(({ ctx, input }) => archiveCommercial(resolved, input.id, {
        id: ctx.user.id,
        name: ctx.user.name ?? null,
      })),

    /**
     * Records that an admin wants this channel, without posting. The adapter
     * is not called.
     */
    savePublishDraft: adminProcedure
      .input(z.object({
        id: z.number().int().positive(),
        channel: z.enum(COMMERCIAL_CHANNELS),
      }))
      .mutation(({ ctx, input }) => savePublishDraft(resolved, input, ctx.user.id)),

    /**
     * The only call that invokes a channel adapter, and only for the video and
     * channel in this request. The wired adapter is a dry run.
     */
    publish: adminProcedure
      .input(z.object({
        id: z.number().int().positive(),
        channel: z.enum(COMMERCIAL_CHANNELS),
      }))
      .mutation(({ ctx, input }) => publishCommercial(resolved, input, ctx.user.id)),

    signedFile: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(({ input }) => signedCommercialFile(resolved, input.id)),
  });
}

export const commercialsRouter = createCommercialsRouter();
