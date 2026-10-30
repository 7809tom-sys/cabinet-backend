import {
  describedDatabaseError,
  isMissingSchemaError,
} from "./orderSchemaGuard";

const STAMP_LOG = "[Auth] signup affiliate stamp failed";

/**
 * A missing signupAffiliateId column, or any other stamp failure, is logged
 * and ignored. Sign-in still returns the user so ctx.user is not cleared.
 */
export async function runSignupAffiliateStamp(
  write: () => Promise<unknown>
): Promise<void> {
  try {
    await write();
  } catch (error) {
    console.error(STAMP_LOG, describedDatabaseError(error));
  }
}

/** Admin reads of columns added by a hand-run SQL file. The exact driver text is logged, then rethrown. */
export async function queryOrLogMissingColumn<T>(
  label: string,
  query: () => Promise<T>
): Promise<T> {
  try {
    return await query();
  } catch (error) {
    if (isMissingSchemaError(error)) {
      console.error(label, describedDatabaseError(error));
    }
    throw error;
  }
}
