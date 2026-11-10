import type { CommercialChannel, CommercialPublishStatus, CommercialTag } from "@shared/commercialVideo";
import type { ExistingLibraryFile } from "@shared/libraryFileHash";

export type PublishRecord = {
  id: number;
  literatureId: number;
  channel: CommercialChannel;
  status: CommercialPublishStatus;
  externalPostId: string | null;
  externalPostUrl: string | null;
  error: string | null;
  publishedBy: number | null;
  publishedAt: Date | null;
};

export type CommercialRecord = {
  id: number;
  title: string;
  caption: string | null;
  filename: string;
  fileKey: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  contentSha256: string;
  uploadedBy: number;
  uploadedAt: Date;
  archivedAt: Date | null;
  archivedBy: number | null;
  tags: CommercialTag[];
  publishes: PublishRecord[];
};

export type NewCommercial = {
  title: string;
  caption: string | null;
  filename: string;
  fileKey: string;
  fileUrl: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds: number | null;
  contentSha256: string;
  uploadedBy: number;
  tags: CommercialTag[];
};

export type PublishWrite = {
  literatureId: number;
  channel: CommercialChannel;
  status: CommercialPublishStatus;
  externalPostId: string | null;
  externalPostUrl: string | null;
  error: string | null;
  publishedBy: number | null;
  publishedAt: Date | null;
};

/**
 * The document-library rows a commercial lives on, plus its tags and the
 * per-channel publish record. Implementations must not delete a storage object.
 */
export interface CommercialStore {
  assertReady(): Promise<void>;
  findByContentHash(contentSha256: string): Promise<ExistingLibraryFile | null>;
  insertCommercial(input: NewCommercial): Promise<number>;
  replaceTags(literatureId: number, tags: CommercialTag[]): Promise<void>;
  listCommercials(includeArchived: boolean): Promise<CommercialRecord[]>;
  getCommercial(id: number): Promise<CommercialRecord | null>;
  updateDetails(id: number, patch: { title?: string; caption?: string | null }): Promise<void>;
  archive(id: number, user: { id: number; name: string | null }, at: Date): Promise<void>;
  distinctTags(): Promise<string[]>;
  savePublish(input: PublishWrite): Promise<PublishRecord>;
}
