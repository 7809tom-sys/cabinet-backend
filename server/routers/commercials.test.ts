import { beforeEach, describe, expect, it, vi } from "vitest";
import { sha256Hex } from "@shared/libraryFileHash";
import type { CommercialChannel, CommercialTag } from "@shared/commercialVideo";
import type { ExistingLibraryFile } from "@shared/libraryFileHash";
import type { CommercialRecord, CommercialStore, NewCommercial, PublishWrite } from "../commercials/store";
import { createCommercialsRouter } from "./commercials";

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function box(type: string, payload: Buffer): Buffer {
  return Buffer.concat([u32(8 + payload.length), Buffer.from(type, "ascii"), payload]);
}

function sampleMp4(durationMs: number): Buffer {
  const payload = Buffer.alloc(20);
  payload.writeUInt32BE(1000, 12);
  payload.writeUInt32BE(durationMs, 16);
  const ftyp = box("ftyp", Buffer.concat([Buffer.from("isom"), u32(0), Buffer.from("isom")]));
  return Buffer.concat([ftyp, box("mdat", Buffer.alloc(8)), box("moov", box("mvhd", payload))]);
}

const FIXED = new Date("2026-11-10T12:00:00Z");
const admin = { id: 7, role: "admin", name: "Tom", email: "tom@example.com" };
const member = { id: 8, role: "user", name: "Pat", email: "pat@example.com" };

class MemoryStore implements CommercialStore {
  readyCalls = 0;
  rows: CommercialRecord[] = [];
  private nextId = 1;
  private nextPublishId = 1;

  async assertReady() {
    this.readyCalls += 1;
  }

  async findByContentHash(contentSha256: string): Promise<ExistingLibraryFile | null> {
    const row = this.rows.find((item) => item.contentSha256 === contentSha256);
    if (!row) return null;
    return {
      id: row.id,
      title: row.title,
      filename: row.filename,
      url: row.fileUrl,
      mimeType: row.mimeType,
      fileKey: row.fileKey,
    };
  }

  async insertCommercial(input: NewCommercial) {
    const id = this.nextId;
    this.nextId += 1;
    this.rows.push({
      id,
      title: input.title,
      caption: input.caption,
      filename: input.filename,
      fileKey: input.fileKey,
      fileUrl: input.fileUrl,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      durationSeconds: input.durationSeconds,
      contentSha256: input.contentSha256,
      uploadedBy: input.uploadedBy,
      uploadedAt: new Date(FIXED.getTime() + id),
      archivedAt: null,
      archivedBy: null,
      tags: input.tags.map((tag) => ({ ...tag })),
      publishes: [],
    });
    return id;
  }

  async replaceTags(literatureId: number, tags: CommercialTag[]) {
    const row = this.rows.find((item) => item.id === literatureId);
    if (row) row.tags = tags.map((tag) => ({ ...tag }));
  }

  async listCommercials(includeArchived: boolean) {
    return this.rows
      .filter((row) => includeArchived || row.archivedAt == null)
      .map((row) => structuredClone(row));
  }

  async getCommercial(id: number) {
    const row = this.rows.find((item) => item.id === id);
    return row ? structuredClone(row) : null;
  }

  async updateDetails(id: number, patch: { title?: string; caption?: string | null }) {
    const row = this.rows.find((item) => item.id === id);
    if (!row) return;
    if (patch.title !== undefined) row.title = patch.title;
    if (patch.caption !== undefined) row.caption = patch.caption;
  }

  async archive(id: number, user: { id: number; name: string | null }, at: Date) {
    const row = this.rows.find((item) => item.id === id);
    if (!row) return;
    row.archivedAt = at;
    row.archivedBy = user.id;
  }

  async distinctTags() {
    const seen = new Map<string, string>();
    for (const row of this.rows) {
      for (const tag of row.tags) if (!seen.has(tag.tagKey)) seen.set(tag.tagKey, tag.tag);
    }
    return [...seen.values()];
  }

  async savePublish(input: PublishWrite) {
    const row = this.rows.find((item) => item.id === input.literatureId);
    if (!row) throw new Error("missing commercial");
    const current = row.publishes.find((item) => item.channel === input.channel);
    if (current) {
      Object.assign(current, input, { id: current.id });
      return structuredClone(current);
    }
    const created = { id: this.nextPublishId, ...input };
    this.nextPublishId += 1;
    row.publishes.push(created);
    return structuredClone(created);
  }
}

function caller(router: ReturnType<typeof createCommercialsRouter>, user: { id: number; role: string } | null) {
  return router.createCaller({ user } as never);
}

describe("commercials admin API", () => {
  let store: MemoryStore;
  let puts: Array<{ key: string; bytes: number; contentType: string }>;
  let adapterCalls: CommercialChannel[];
  const routerFor = (adapter?: (channel: CommercialChannel) => { channel: CommercialChannel; publish: (request: { channel: CommercialChannel }) => Promise<{ ok: boolean; externalPostId: string | null; externalPostUrl: string | null; error: string | null }> }) =>
    createCommercialsRouter({
      store,
      putFile: async (key, data, contentType) => {
        puts.push({ key, bytes: data.length, contentType });
        return { key: `${key}_stored`, url: `/manus-storage/${key}_stored` };
      },
      signFile: async (key) => `https://signed.example/${key}`,
      now: () => FIXED,
      ...(adapter ? { adapterFor: adapter } : {}),
    });

  beforeEach(() => {
    store = new MemoryStore();
    puts = [];
    adapterCalls = [];
  });

  it("rejects everyone who is not an admin before it touches the library", async () => {
    const router = routerFor();
    const procedures = [
      () => caller(router, member).list(),
      () => caller(router, null).list(),
      () => caller(router, member).get({ id: 1 }),
      () => caller(router, member).tagSuggestions({ prefix: "k" }),
      () => caller(router, member).upload({ title: "X", filename: "a.mp4", mimeType: "video/mp4", dataBase64: "YQ==" }),
      () => caller(router, member).update({ id: 1, title: "X" }),
      () => caller(router, member).archive({ id: 1 }),
      () => caller(router, member).savePublishDraft({ id: 1, channel: "youtube" }),
      () => caller(router, member).publish({ id: 1, channel: "youtube" }),
      () => caller(router, null).publish({ id: 1, channel: "youtube" }),
      () => caller(router, member).signedFile({ id: 1 }),
    ];
    for (const call of procedures) {
      await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    expect(store.readyCalls).toBe(0);
    expect(puts).toHaveLength(0);
    expect(adapterCalls).toHaveLength(0);
  });

  it("stores a commercial in the library, filters by tag text, and suggests prefixes", async () => {
    const router = routerFor((channel) => ({
      channel,
      async publish(request) {
        adapterCalls.push(request.channel);
        return { ok: false, externalPostId: null, externalPostUrl: null, error: "should not run" };
      },
    }));
    const api = caller(router, admin);
    const kitchen = sampleMp4(15_000);
    const closets = sampleMp4(8_000);
    const first = await api.upload({
      title: "Spring kitchen",
      caption: "A short kitchen spot",
      filename: "spring.mp4",
      mimeType: "video/mp4",
      dataBase64: kitchen.toString("base64"),
      tags: [" Kitchen ", "kitchen", "holiday promo"],
    });
    expect(first.stored).toBe(true);
    if (!first.stored) throw new Error("expected the kitchen commercial to be stored");
    expect(first.commercial.mimeType).toBe("video/mp4");
    expect(first.commercial.durationSeconds).toBe(15);
    expect(first.commercial.contentSha256).toBe(sha256Hex(kitchen));
    expect(first.commercial.fileKey.startsWith("library-documents/commercials/")).toBe(true);
    expect(first.commercial.tags.map((tag) => tag.tag)).toEqual(["Kitchen", "holiday promo"]);
    expect(first.commercial.uploadedBy).toBe(admin.id);
    expect(puts).toHaveLength(1);
    expect(adapterCalls).toHaveLength(0);

    const second = await api.upload({
      title: "Closet line",
      caption: "Closets for spring",
      filename: "closets.mov",
      mimeType: "video/quicktime",
      dataBase64: closets.toString("base64"),
      tags: ["Closets"],
    });
    expect(second.stored).toBe(true);

    const byTag = await api.list({ query: "hol" });
    expect(byTag.map((row) => row.title)).toEqual(["Spring kitchen"]);
    const byCaption = await api.list({ query: "CLOSET" });
    expect(byCaption.map((row) => row.title)).toEqual(["Closet line"]);
    expect(await api.tagSuggestions({ prefix: "k" })).toEqual(["Kitchen"]);
    expect(await api.tagSuggestions({ prefix: "HOL" })).toEqual(["holiday promo"]);

    const updated = await api.update({
      id: first.commercial.id,
      title: "Spring kitchen promo",
      caption: "Updated caption",
      tags: ["Kitchen", "Kids"],
    });
    expect(updated.title).toBe("Spring kitchen promo");
    expect(updated.caption).toBe("Updated caption");
    expect(updated.tags.map((tag) => tag.tag)).toEqual(["Kitchen", "Kids"]);
    expect(updated.fileKey).toBe(first.commercial.fileKey);
    expect(await api.tagSuggestions({ prefix: "ho" })).toEqual([]);
    expect(adapterCalls).toHaveLength(0);
  });

  it("warns and links an exact duplicate instead of storing a second file", async () => {
    const router = routerFor();
    const api = caller(router, admin);
    const bytes = sampleMp4(4_000);
    const first = await api.upload({
      title: "Original",
      filename: "original.mp4",
      mimeType: "video/mp4",
      dataBase64: bytes.toString("base64"),
    });
    const again = await api.upload({
      title: "Copy",
      filename: "copy.mp4",
      mimeType: "video/mp4",
      dataBase64: bytes.toString("base64"),
      tags: ["Kitchen"],
    });
    expect(again.stored).toBe(false);
    if (again.stored || !first.stored) throw new Error("expected the first file to be stored and the copy to be refused");
    expect(again.duplicate).toBe(true);
    expect(again.existing.id).toBe(first.commercial.id);
    expect(again.message).toContain(`library id ${first.commercial.id}`);
    expect(puts).toHaveLength(1);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].tags).toHaveLength(0);
  });

  it("rejects a non-video, a too-long video, and never posts while drafting", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network"));
    const router = routerFor();
    const api = caller(router, admin);
    await expect(api.upload({
      title: "Deck",
      filename: "deck.pptx",
      mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      dataBase64: Buffer.from("PK").toString("base64"),
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(api.upload({
      title: "Too long",
      filename: "long.mp4",
      mimeType: "video/mp4",
      dataBase64: sampleMp4(91_000).toString("base64"),
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(puts).toHaveLength(0);

    await expect(api.upload({
      title: "Spot",
      filename: "spot.webm",
      mimeType: "video/mp4",
      dataBase64: sampleMp4(2_000).toString("base64"),
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const real = await api.upload({
      title: "Spot",
      filename: "spot.mp4",
      mimeType: "video/mp4",
      dataBase64: sampleMp4(2_000).toString("base64"),
    });
    if (!real.stored) throw new Error("expected the mp4 to be stored");
    const drafted = await api.savePublishDraft({ id: real.commercial.id, channel: "instagram" });
    expect(drafted.publishes).toEqual([
      expect.objectContaining({ channel: "instagram", status: "draft", externalPostUrl: null, publishedAt: null }),
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("publishes only the channel that was clicked, and the dry run does not claim a post", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no network"));
    const router = routerFor();
    const api = caller(router, admin);
    const uploaded = await api.upload({
      title: "Spot",
      filename: "spot.mp4",
      mimeType: "video/mp4",
      dataBase64: sampleMp4(3_000).toString("base64"),
    });
    if (!uploaded.stored) throw new Error("expected a stored commercial");
    await api.savePublishDraft({ id: uploaded.commercial.id, channel: "facebook" });
    const published = await api.publish({ id: uploaded.commercial.id, channel: "youtube" });
    const youtube = published.publishes.find((row) => row.channel === "youtube");
    const facebook = published.publishes.find((row) => row.channel === "facebook");
    expect(youtube).toMatchObject({
      status: "failed",
      externalPostId: null,
      externalPostUrl: null,
      publishedBy: admin.id,
      publishedAt: null,
    });
    expect(youtube?.error).toContain("Dry run");
    expect(youtube?.error).toContain("youtube");
    expect(facebook).toMatchObject({ status: "draft" });
    expect(fetchSpy).not.toHaveBeenCalled();
    const opened = await api.signedFile({ id: uploaded.commercial.id });
    expect(opened.url).toContain("library-documents/commercials/");
    expect(opened.mimeType).toBe("video/mp4");
    fetchSpy.mockRestore();
  });

  it("archives without dropping the file, and a clicked publish can record a result from an adapter", async () => {
    const calls: string[] = [];
    const router = routerFor((channel) => ({
      channel,
      async publish() {
        calls.push(channel);
        return { ok: true, externalPostId: "post-1", externalPostUrl: "https://example.test/post-1" };
      },
    }));
    const api = caller(router, admin);
    const uploaded = await api.upload({
      title: "Spot",
      filename: "spot.mp4",
      mimeType: "video/mp4",
      dataBase64: sampleMp4(5_000).toString("base64"),
    });
    if (!uploaded.stored) throw new Error("expected a stored commercial");
    const fileKey = uploaded.commercial.fileKey;
    const archived = await api.archive({ id: uploaded.commercial.id });
    expect(archived.archivedAt).toEqual(FIXED);
    expect(archived.fileKey).toBe(fileKey);
    expect(await api.list()).toEqual([]);
    expect((await api.list({ includeArchived: true })).map((row) => row.id)).toEqual([uploaded.commercial.id]);
    await expect(api.publish({ id: uploaded.commercial.id, channel: "tiktok" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(calls).toEqual([]);

    const live = await api.upload({
      title: "Live spot",
      filename: "live.mp4",
      mimeType: "video/mp4",
      dataBase64: sampleMp4(6_000).toString("base64"),
    });
    if (!live.stored) throw new Error("expected the second commercial");
    const posted = await api.publish({ id: live.commercial.id, channel: "linkedin" });
    expect(calls).toEqual(["linkedin"]);
    expect(posted.publishes).toEqual([
      expect.objectContaining({
        channel: "linkedin",
        status: "published",
        externalPostId: "post-1",
        externalPostUrl: "https://example.test/post-1",
        publishedAt: FIXED,
        error: null,
      }),
    ]);
  });
});
