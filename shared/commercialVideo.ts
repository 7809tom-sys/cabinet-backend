/**
 * Short commercials stored in the document library (`affiliate_literature`).
 *
 * Limits, chosen to fit the upload path that already exists:
 *   - 32 MB raw. The JSON body limit is 50 MB and base64 expands by 4/3, so
 *     32 MB of video is about 43 MB of JSON and still fits. The document
 *     upload stays at 24 MB; this cap is only for commercials.
 *   - 90 seconds when the container duration can be read without ffmpeg.
 *     A file whose duration cannot be read is still held to 32 MB, and the
 *     duration is stored as null.
 *
 * Publishing to a social network is a separate, explicit action. Nothing in
 * this module contacts a network.
 */

export const COMMERCIAL_MAX_BYTES = 32 * 1024 * 1024;
export const COMMERCIAL_MAX_SECONDS = 90;
export const COMMERCIAL_TAG_MAX_LENGTH = 40;
export const COMMERCIAL_TAG_MAX_COUNT = 20;
export const COMMERCIAL_CAPTION_MAX_LENGTH = 2000;
export const COMMERCIAL_TITLE_MAX_LENGTH = 255;

export const COMMERCIAL_VIDEO_MIME_TYPES = ["video/mp4", "video/quicktime", "video/webm"] as const;
export type CommercialVideoMime = (typeof COMMERCIAL_VIDEO_MIME_TYPES)[number];

export const COMMERCIAL_CHANNELS = ["youtube", "facebook", "instagram", "tiktok", "x", "linkedin"] as const;
export type CommercialChannel = (typeof COMMERCIAL_CHANNELS)[number];

export const COMMERCIAL_PUBLISH_STATUSES = ["draft", "queued", "published", "failed"] as const;
export type CommercialPublishStatus = (typeof COMMERCIAL_PUBLISH_STATUSES)[number];

const ISO_BOX_TYPES = new Set(["ftyp", "moov", "mdat", "free", "wide", "skip", "pnot", "junk", "uuid", "pict"]);
const MP4_CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "stbl", "udta", "edts"]);

export function isCommercialVideoMime(mimeType: string | null | undefined): mimeType is CommercialVideoMime {
  return (COMMERCIAL_VIDEO_MIME_TYPES as readonly string[]).includes(mimeType ?? "");
}

export function commercialExtension(filename: string): "mp4" | "mov" | "webm" | null {
  const match = /\.([a-z0-9]+)$/i.exec(filename.trim());
  const extension = match?.[1]?.toLowerCase();
  if (extension === "mp4" || extension === "mov" || extension === "webm") return extension;
  return null;
}

export function commercialSizeError(byteLength: number): string | null {
  if (byteLength >= 1 && byteLength <= COMMERCIAL_MAX_BYTES) return null;
  return `A commercial must be between 1 byte and ${COMMERCIAL_MAX_BYTES / (1024 * 1024)} MB.`;
}

export function commercialDurationError(seconds: number | null): string | null {
  if (seconds == null) return null;
  if (!Number.isFinite(seconds) || seconds < 0) return "Could not read a valid duration from this video.";
  if (seconds > COMMERCIAL_MAX_SECONDS) {
    return `This commercial is ${Math.ceil(seconds)} seconds. The limit is ${COMMERCIAL_MAX_SECONDS} seconds.`;
  }
  return null;
}

export type CommercialTag = { tag: string; tagKey: string };

export function normalizeCommercialTags(raw: readonly string[]): { ok: true; tags: CommercialTag[] } | { ok: false; message: string } {
  const tags: CommercialTag[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const tag = value.trim().replace(/\s+/g, " ");
    if (!tag) continue;
    if (tag.length > COMMERCIAL_TAG_MAX_LENGTH) {
      return { ok: false, message: `Tags must be ${COMMERCIAL_TAG_MAX_LENGTH} characters or fewer.` };
    }
    const tagKey = tag.toLocaleLowerCase();
    if (seen.has(tagKey)) continue;
    seen.add(tagKey);
    tags.push({ tag, tagKey });
  }
  if (tags.length > COMMERCIAL_TAG_MAX_COUNT) {
    return { ok: false, message: `A video can have at most ${COMMERCIAL_TAG_MAX_COUNT} tags.` };
  }
  return { ok: true, tags };
}

/** List search: the typed text narrows by tag, title, or caption. Partial and case-insensitive. */
export function commercialMatchesQuery(
  item: { title: string; caption: string | null; tags: readonly string[] },
  query: string,
): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  if (item.title.toLocaleLowerCase().includes(needle)) return true;
  if ((item.caption ?? "").toLocaleLowerCase().includes(needle)) return true;
  return item.tags.some((tag) => tag.toLocaleLowerCase().includes(needle));
}

/** Type-ahead: distinct tags whose text starts with the prefix, case-insensitive. */
export function suggestCommercialTags(tags: readonly string[], prefix: string, limit = 20): string[] {
  const needle = prefix.trim().toLocaleLowerCase();
  if (!needle) return [];
  const seen = new Set<string>();
  const matches: string[] = [];
  for (const tag of tags) {
    const key = tag.toLocaleLowerCase();
    if (!key.startsWith(needle) || seen.has(key)) continue;
    seen.add(key);
    matches.push(tag);
  }
  return matches.sort((left, right) => left.localeCompare(right)).slice(0, limit);
}

export type CheckedCommercialVideo = {
  mimeType: CommercialVideoMime;
  extension: "mp4" | "mov" | "webm";
  durationSeconds: number | null;
};

/**
 * Accept mp4, mov, and webm only after the bytes agree with the extension.
 * Duration is read from the container when that is cheap. ffmpeg is not used.
 */
export function checkCommercialVideo(
  filename: string,
  mimeType: string,
  bytes: Uint8Array,
): { ok: true; video: CheckedCommercialVideo } | { ok: false; message: string } {
  const sizeError = commercialSizeError(bytes.byteLength);
  if (sizeError) return { ok: false, message: sizeError };
  const extension = commercialExtension(filename);
  if (!extension) return { ok: false, message: "Commercials must be an .mp4, .mov, or .webm file." };
  const mimeError = mimeAgrees(extension, mimeType);
  if (mimeError) return { ok: false, message: mimeError };
  if (extension === "webm") {
    if (!isWebmBytes(bytes)) return { ok: false, message: "That file is not a WebM video." };
    const seconds = readWebmDurationSeconds(bytes);
    const durationError = commercialDurationError(seconds);
    if (durationError) return { ok: false, message: durationError };
    return { ok: true, video: { mimeType: "video/webm", extension, durationSeconds: storedSeconds(seconds) } };
  }
  if (!isIsoBmffBytes(bytes)) return { ok: false, message: "That file is not an MP4 or MOV video." };
  const seconds = readIsoBmffDurationSeconds(bytes);
  const durationError = commercialDurationError(seconds);
  if (durationError) return { ok: false, message: durationError };
  const canonical: CommercialVideoMime = extension === "mov" ? "video/quicktime" : "video/mp4";
  return { ok: true, video: { mimeType: canonical, extension, durationSeconds: storedSeconds(seconds) } };
}

function mimeAgrees(extension: "mp4" | "mov" | "webm", mimeType: string): string | null {
  const mime = mimeType.trim().toLowerCase();
  if (!mime || mime === "application/octet-stream") return null;
  if (extension === "webm") {
    return mime === "video/webm" ? null : "A .webm commercial must be video/webm.";
  }
  if (extension === "mp4") {
    return mime === "video/mp4" ? null : "An .mp4 commercial must be video/mp4.";
  }
  if (mime === "video/quicktime" || mime === "video/mp4") return null;
  return "A .mov commercial must be video/quicktime or video/mp4.";
}

function storedSeconds(seconds: number | null): number | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  return Math.max(0, Math.round(seconds));
}

function isWebmBytes(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

function isIsoBmffBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 8) return false;
  return ISO_BOX_TYPES.has(ascii(bytes, 4, 4));
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.byteLength) return "";
  let text = "";
  for (let index = 0; index < length; index += 1) text += String.fromCharCode(bytes[offset + index]);
  return text;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] * 0x1000000) +
    ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3])
  ) >>> 0;
}

function readU64(bytes: Uint8Array, offset: number): bigint {
  let value = BigInt(0);
  for (let index = 0; index < 8; index += 1) value = (value << BigInt(8)) | BigInt(bytes[offset + index]);
  return value;
}

/** Seconds from an MP4/MOV mvhd box, or null when the container does not say. */
export function readIsoBmffDurationSeconds(bytes: Uint8Array): number | null {
  return walkIsoBoxes(bytes, 0, bytes.byteLength);
}

function walkIsoBoxes(bytes: Uint8Array, start: number, end: number): number | null {
  let offset = start;
  while (offset + 8 <= end) {
    const size32 = readU32(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    let header = 8;
    let size = size32;
    if (size32 === 1) {
      if (offset + 16 > end) return null;
      const wide = readU64(bytes, offset + 8);
      if (wide > BigInt(Number.MAX_SAFE_INTEGER)) return null;
      size = Number(wide);
      header = 16;
    } else if (size32 === 0) {
      size = end - offset;
    }
    if (!Number.isFinite(size) || size < header || offset + size > end) return null;
    const payload = offset + header;
    if (type === "mvhd") {
      const seconds = readMvhdSeconds(bytes, payload, offset + size);
      if (seconds != null) return seconds;
    } else if (MP4_CONTAINERS.has(type)) {
      const nested = walkIsoBoxes(bytes, payload, offset + size);
      if (nested != null) return nested;
    } else if (type === "meta" && payload + 4 <= offset + size) {
      const nested = walkIsoBoxes(bytes, payload + 4, offset + size);
      if (nested != null) return nested;
    }
    offset += size;
  }
  return null;
}

function readMvhdSeconds(bytes: Uint8Array, start: number, end: number): number | null {
  const version = bytes[start];
  if (version === 0) {
    if (end < start + 20) return null;
    const timescale = readU32(bytes, start + 12);
    const duration = readU32(bytes, start + 16);
    if (timescale === 0) return null;
    return duration / timescale;
  }
  if (version === 1) {
    if (end < start + 32) return null;
    const timescale = readU32(bytes, start + 20);
    const duration = readU64(bytes, start + 24);
    if (timescale === 0) return null;
    return Number(duration) / timescale;
  }
  return null;
}

const EBML_ID = BigInt(0x1a45dfa3);
const SEGMENT_ID = BigInt(0x18538067);
const INFO_ID = BigInt(0x1549a966);
const TIMECODE_SCALE_ID = BigInt(0x2ad7b1);
const DURATION_ID = BigInt(0x4489);

/** Seconds from a WebM Info/Duration element, or null when it is not there. */
export function readWebmDurationSeconds(bytes: Uint8Array): number | null {
  let scale = 1_000_000;
  let duration: number | null = null;

  const scan = (start: number, end: number, insideInfo: boolean) => {
    let offset = start;
    while (offset + 2 <= end && duration == null) {
      const id = readVint(bytes, offset);
      if (!id) return;
      const size = readVint(bytes, offset + id.length);
      if (!size) return;
      const widthBits = BigInt(7) * BigInt(size.length);
      const marker = BigInt(1) << widthBits;
      const value = size.raw - marker;
      const unknown = value === marker - BigInt(1);
      const dataStart = offset + id.length + size.length;
      if (!unknown && (value < BigInt(0) || value > BigInt(end - dataStart))) return;
      const dataEnd = unknown ? end : dataStart + Number(value);
      if (id.raw === DURATION_ID && insideInfo) duration = readEbmlFloat(bytes, dataStart, dataEnd);
      else if (id.raw === TIMECODE_SCALE_ID && insideInfo) {
        const next = readEbmlUnsigned(bytes, dataStart, dataEnd);
        if (next && next > BigInt(0) && next <= BigInt(Number.MAX_SAFE_INTEGER)) scale = Number(next);
      } else if (id.raw === INFO_ID) scan(dataStart, dataEnd, true);
      else if (id.raw === SEGMENT_ID || id.raw === EBML_ID) scan(dataStart, dataEnd, false);
      if (unknown) return;
      offset = dataEnd;
    }
  };

  scan(0, bytes.byteLength, false);
  if (duration == null || !Number.isFinite(duration) || duration < 0 || scale <= 0) return null;
  return (duration * scale) / 1_000_000_000;
}

function readVint(bytes: Uint8Array, offset: number): { length: number; raw: bigint } | null {
  if (offset >= bytes.byteLength) return null;
  const first = bytes[offset];
  if (first === 0) return null;
  let length = 1;
  let marker = 0x80;
  while (length <= 8 && (first & marker) === 0) {
    length += 1;
    marker >>= 1;
  }
  if (length > 8 || offset + length > bytes.byteLength) return null;
  let raw = BigInt(0);
  for (let index = 0; index < length; index += 1) raw = (raw << BigInt(8)) | BigInt(bytes[offset + index]);
  return { length, raw };
}

function readEbmlUnsigned(bytes: Uint8Array, start: number, end: number): bigint | null {
  const length = end - start;
  if (length < 1 || length > 8) return null;
  let value = BigInt(0);
  for (let index = start; index < end; index += 1) value = (value << BigInt(8)) | BigInt(bytes[index]);
  return value;
}

function readEbmlFloat(bytes: Uint8Array, start: number, end: number): number | null {
  const slice = Buffer.from(bytes.subarray(start, end));
  if (slice.length === 4) return slice.readFloatBE(0);
  if (slice.length === 8) return slice.readDoubleBE(0);
  return null;
}
