export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const TRPC_PATH = "/api/trpc";

/**
 * Cabinet pricing can request hundreds of exact cabinet/style identities at
 * once. Queries must travel in the request body instead of the URL so preview
 * and production proxies cannot reject them with an HTML 414 response.
 */
export const TRPC_QUERY_METHOD_OVERRIDE = "POST" as const;

export function isTrpcRequest(input: RequestInfo | URL): boolean {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  return url.includes(TRPC_PATH);
}

export function isHtmlApiFallback(response: Response): boolean {
  return response.headers.get("content-type")?.toLowerCase().includes("text/html") ?? false;
}

/**
 * During a preview restart a request can briefly be answered by the SPA
 * fallback instead of Express's tRPC route. Retry that one transient HTML
 * response so callers only receive the JSON contract they expect.
 */
export async function fetchTrpcJson(
  input: RequestInfo | URL,
  init?: RequestInit,
  fetchImpl: FetchLike = globalThis.fetch,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
): Promise<Response> {
  const requestInit = { ...(init ?? {}), credentials: "include" as const };
  let response = await fetchImpl(input, requestInit);

  if (isTrpcRequest(input) && isHtmlApiFallback(response)) {
    await wait(350);
    response = await fetchImpl(input, requestInit);
  }

  return response;
}
