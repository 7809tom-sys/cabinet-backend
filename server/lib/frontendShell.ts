/**
 * The frontend is a static site on Vercel; the backend rewrites each page's
 * <head> (affiliate branding, canonical URLs, shared 3D-room previews). For
 * those pages Vercel forwards the request here, and the backend fetches the
 * built page shell (index.html) from the frontend and injects the head.
 *
 * FRONTEND_SHELL_URL: where the built index.html lives, for example
 * https://www.cabinetdealz.com/index.html or the project's *.vercel.app URL.
 */
const SHELL_TTL_MS = 30_000;
const SHELL_TIMEOUT_MS = 8_000;

let cached: { url: string; html: string; at: number } | null = null;

export function frontendShellUrl(): string {
  return (process.env.FRONTEND_SHELL_URL ?? "").trim();
}

/** Returns the page shell, a recent copy if the frontend is briefly unreachable, or null. */
export async function getFrontendShell(): Promise<string | null> {
  const url = frontendShellUrl();
  if (!url) return null;
  const now = Date.now();
  if (cached && cached.url === url && now - cached.at < SHELL_TTL_MS) return cached.html;
  try {
    const response = await fetch(url, {
      headers: { accept: "text/html" },
      signal: AbortSignal.timeout(SHELL_TIMEOUT_MS),
    });
    const html = response.ok ? await response.text() : "";
    // Only accept the real app shell, never an error page or a login wall.
    if (html.includes('id="root"')) {
      cached = { url, html, at: now };
      return html;
    }
  } catch {
    // fall through to the stale copy
  }
  return cached && cached.url === url ? cached.html : null;
}

/** Test hook. */
export function resetFrontendShellCache() {
  cached = null;
}
