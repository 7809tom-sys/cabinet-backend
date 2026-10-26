import { ENV } from "../_core/env";

export type SupabaseDeleteResult = {
  deleted: string[];
  failed: { authId: string; status: number | null }[];
};

type FetchLike = (url: string, init: { method: string; headers: Record<string, string> }) => Promise<{ ok: boolean; status: number }>;

/**
 * Deletes Supabase Auth users with the same service-role admin API the server
 * already uses for auth lookups. The service-role key stays in the request
 * header and is never returned or logged.
 */
export async function deleteSupabaseAuthUsers(
  authIds: string[],
  options: { fetcher?: FetchLike; supabaseUrl?: string; serviceRoleKey?: string } = {},
): Promise<SupabaseDeleteResult> {
  const fetcher = options.fetcher ?? fetch;
  const deleted: string[] = [];
  const failed: { authId: string; status: number | null }[] = [];
  const base = (options.supabaseUrl ?? ENV.supabaseUrl).trim().replace(/\/+$/, "");
  const key = options.serviceRoleKey ?? ENV.supabaseServiceRoleKey;
  if (!base || !key) {
    return { deleted, failed: authIds.map((authId) => ({ authId, status: null })) };
  }
  for (const authId of authIds) {
    if (!authId) continue;
    try {
      const response = await fetcher(`${base}/auth/v1/admin/users/${encodeURIComponent(authId)}`, {
        method: "DELETE",
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (response.ok || response.status === 404) deleted.push(authId);
      else failed.push({ authId, status: response.status });
    } catch {
      failed.push({ authId, status: null });
    }
  }
  return { deleted, failed };
}
