import { eq } from "drizzle-orm";
import { affiliateLiterature } from "../../drizzle/schema";
import { LibraryCommercialSchemaError, isUnknownNamedColumn } from "./libraryCommercialSchema";

type ArchiveDb = {
  update: (table: any) => any;
};

/**
 * Archive one commercial row. The storage object is not touched: this only
 * marks the library row and takes it out of the affiliate portal. A missing
 * archive column refuses the call instead of deleting the row.
 */
export async function archiveLibraryCommercial(
  db: ArchiveDb,
  id: number,
  user: { id: number; name: string | null },
  at: Date = new Date(),
): Promise<void> {
  const minimal = {
    archivedAt: at,
    archivedBy: user.id,
    isPublished: false,
  };
  const full = {
    ...minimal,
    visibility: "internal",
    affiliateToggledAt: at,
    affiliateToggledBy: user.id,
    affiliateToggledByName: user.name,
  };

  const write = (values: Record<string, unknown>) =>
    db.update(affiliateLiterature).set(values).where(eq(affiliateLiterature.id, id));

  try {
    await write(full);
  } catch (error) {
    if (isUnknownNamedColumn(error, "archivedAt") || isUnknownNamedColumn(error, "archivedBy")) {
      throw new LibraryCommercialSchemaError();
    }
    const auditColumn = ["visibility", "affiliateToggledAt", "affiliateToggledBy", "affiliateToggledByName"]
      .find((column) => isUnknownNamedColumn(error, column));
    if (!auditColumn) throw error;
    try {
      await write(minimal);
    } catch (retry) {
      if (isUnknownNamedColumn(retry, "archivedAt") || isUnknownNamedColumn(retry, "archivedBy")) {
        throw new LibraryCommercialSchemaError();
      }
      throw retry;
    }
  }
}
