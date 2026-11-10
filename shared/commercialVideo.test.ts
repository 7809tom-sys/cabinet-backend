import { describe, expect, it } from "vitest";
import { duplicateLibraryFileMessage, libraryHashUpdateStatement, sha256Hex } from "./libraryFileHash";
import {
  COMMERCIAL_MAX_BYTES,
  COMMERCIAL_MAX_SECONDS,
  checkCommercialVideo,
  commercialMatchesQuery,
  commercialSizeError,
  normalizeCommercialTags,
  readIsoBmffDurationSeconds,
  readWebmDurationSeconds,
  suggestCommercialTags,
} from "./commercialVideo";

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function box(type: string, payload: Buffer): Buffer {
  return Buffer.concat([u32(8 + payload.length), Buffer.from(type, "ascii"), payload]);
}

function mvhd(timescale: number, duration: number, version = 0): Buffer {
  if (version === 0) {
    const payload = Buffer.alloc(20);
    payload.writeUInt32BE(timescale, 12);
    payload.writeUInt32BE(duration, 16);
    return box("mvhd", payload);
  }
  const payload = Buffer.alloc(32);
  payload[0] = 1;
  payload.writeUInt32BE(timescale, 20);
  payload.writeBigUInt64BE(BigInt(duration), 24);
  return box("mvhd", payload);
}

function sampleMp4(timescale: number, duration: number, version = 0): Buffer {
  const ftyp = box("ftyp", Buffer.concat([Buffer.from("isom"), u32(0), Buffer.from("isom")]));
  const mdat = box("mdat", Buffer.alloc(12));
  const moov = box("moov", mvhd(timescale, duration, version));
  return Buffer.concat([ftyp, mdat, moov]);
}

function vintSize(length: number): Buffer {
  if (length < 127) return Buffer.from([0x80 | length]);
  if (length < 16383) return Buffer.from([0x40 | (length >> 8), length & 0xff]);
  throw new Error("test size too large");
}

function ebmlElement(id: Buffer, data: Buffer): Buffer {
  return Buffer.concat([id, vintSize(data.length), data]);
}

function sampleWebm(seconds: number): Buffer {
  const scale = Buffer.from([0x0f, 0x42, 0x40]);
  const duration = Buffer.alloc(8);
  // Duration is in TimecodeScale units. The scale below is 1 ms, so seconds are stored as milliseconds.
  duration.writeDoubleBE(seconds * 1000);
  const info = ebmlElement(
    Buffer.from([0x15, 0x49, 0xa9, 0x66]),
    Buffer.concat([
      ebmlElement(Buffer.from([0x2a, 0xd7, 0xb1]), scale),
      ebmlElement(Buffer.from([0x44, 0x89]), duration),
    ]),
  );
  const segment = ebmlElement(Buffer.from([0x18, 0x53, 0x80, 0x67]), info);
  const header = ebmlElement(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.from([0x42, 0x86, 0x81, 0x01]));
  return Buffer.concat([header, segment]);
}

describe("commercial video checks", () => {
  it("reads an mp4 duration that sits after the media data", () => {
    const bytes = sampleMp4(1000, 15_000);
    expect(readIsoBmffDurationSeconds(bytes)).toBe(15);
    const checked = checkCommercialVideo("spring.mp4", "video/mp4", bytes);
    expect(checked).toEqual({
      ok: true,
      video: { mimeType: "video/mp4", extension: "mp4", durationSeconds: 15 },
    });
  });

  it("reads a version-1 movie header and a webm duration", () => {
    expect(readIsoBmffDurationSeconds(sampleMp4(600, 54_000, 1))).toBe(90);
    expect(readWebmDurationSeconds(sampleWebm(12.2))).toBeCloseTo(12.2, 5);
    const webm = checkCommercialVideo("clip.webm", "video/webm", sampleWebm(12.2));
    expect(webm.ok).toBe(true);
    if (webm.ok) expect(webm.video.durationSeconds).toBe(12);
  });

  it("rejects a commercial longer than 90 seconds and a file that is not video", () => {
    const tooLong = checkCommercialVideo("long.mp4", "video/mp4", sampleMp4(1000, 91_000));
    expect(tooLong.ok).toBe(false);
    if (!tooLong.ok) expect(tooLong.message).toContain(String(COMMERCIAL_MAX_SECONDS));
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(checkCommercialVideo("photo.mp4", "video/mp4", png).ok).toBe(false);
    expect(checkCommercialVideo("deck.pptx", "video/mp4", sampleMp4(1000, 1000)).ok).toBe(false);
  });

  it("accepts a mov and rejects a size past the cap without allocating the cap", () => {
    const mov = checkCommercialVideo("spot.mov", "video/quicktime", sampleMp4(1000, 2000));
    expect(mov.ok).toBe(true);
    if (mov.ok) expect(mov.video.mimeType).toBe("video/quicktime");
    expect(commercialSizeError(COMMERCIAL_MAX_BYTES)).toBeNull();
    expect(commercialSizeError(COMMERCIAL_MAX_BYTES + 1)).toMatch(/32 MB/);
  });

  it("stores a null duration when the container does not say how long it is", () => {
    const ftyp = box("ftyp", Buffer.concat([Buffer.from("isom"), u32(0)]));
    const checked = checkCommercialVideo("silent.mp4", "video/mp4", ftyp);
    expect(checked).toEqual({
      ok: true,
      video: { mimeType: "video/mp4", extension: "mp4", durationSeconds: null },
    });
  });
});

describe("commercial tags", () => {
  it("trims, caps, and treats Kitchen and kitchen as one tag", () => {
    const normalized = normalizeCommercialTags(["  Kitchen ", "kitchen", "holiday   promo", ""]);
    expect(normalized).toEqual({
      ok: true,
      tags: [
        { tag: "Kitchen", tagKey: "kitchen" },
        { tag: "holiday promo", tagKey: "holiday promo" },
      ],
    });
  });

  it("matches a partial tag, title, or caption, and suggests by prefix", () => {
    const item = { title: "Spring sale", caption: "Closet refresh", tags: ["Kitchen", "holiday promo"] };
    expect(commercialMatchesQuery(item, "kit")).toBe(true);
    expect(commercialMatchesQuery(item, "CLOSET")).toBe(true);
    expect(commercialMatchesQuery(item, "spring")).toBe(true);
    expect(commercialMatchesQuery(item, "bath")).toBe(false);
    expect(commercialMatchesQuery(item, "  ")).toBe(true);
    expect(suggestCommercialTags(["Kitchen", "kitchen", "holiday promo", "Kids"], "k")).toEqual(["Kids", "Kitchen"]);
    expect(suggestCommercialTags(["holiday promo"], "hol")).toEqual(["holiday promo"]);
    expect(suggestCommercialTags(["Kitchen"], "")).toEqual([]);
  });
});

describe("library content hash", () => {
  it("hashes the bytes and warns with the existing library id", () => {
    expect(sha256Hex(Buffer.from("same"))).toBe(sha256Hex(Buffer.from("same")));
    expect(sha256Hex(Buffer.from("same"))).not.toBe(sha256Hex(Buffer.from("different")));
    expect(duplicateLibraryFileMessage({ id: 12, title: "Spring promo", filename: "spring.mp4" })).toContain("library id 12");
    expect(libraryHashUpdateStatement(12, "a".repeat(64))).toContain("AND (contentSha256 IS NULL OR contentSha256 = '')");
    expect(libraryHashUpdateStatement(12, "a".repeat(64))).not.toMatch(/DELETE/i);
  });
});
