import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GOOGLE_MAPS_API_KEY = "test-maps-key";
  process.env.OWNER_EMAIL = "owner@example.test";
});

const sendEmail = vi.hoisted(() => vi.fn());
vi.mock("./email", () => ({ sendEmail }));

import { invokeLLM } from "./_core/llm";
import { makeRequest } from "./_core/map";
import { notifyOwner } from "./_core/notification";

const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
  sendEmail.mockReset();
  vi.restoreAllMocks();
});

describe("invokeLLM on Gemini", () => {
  let seen: { url: string; headers: Headers; body: Record<string, unknown> } | null = null;
  beforeEach(() => {
    seen = null;
    global.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(input), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) };
      return new Response(JSON.stringify({ id: "x", created: 0, model: "m", choices: [], usage: undefined }), { status: 200 });
    }) as unknown as typeof fetch;
  });

  it("calls Gemini's OpenAI-compatible endpoint with the Gemini key and a default model", async () => {
    await invokeLLM({ messages: [{ role: "user", content: "hi" }] });
    expect(seen!.url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(seen!.headers.get("authorization")).toBe("Bearer test-gemini-key");
    expect(seen!.body.model).toBe("gemini-3-flash-preview");
  });

  it("keeps an explicit model, adds thinking headroom to max_tokens, and drops Manus-only options", async () => {
    await invokeLLM({
      messages: [{ role: "user", content: "hi" }],
      model: "gemini-custom",
      maxTokens: 200,
      thinking: { budget_tokens: 128 },
      reasoning: { effort: "low" },
    });
    expect(seen!.body.model).toBe("gemini-custom");
    expect(seen!.body.max_tokens).toBeGreaterThan(200);
    expect(seen!.body).not.toHaveProperty("thinking");
    expect(seen!.body).not.toHaveProperty("reasoning");
  });
});

describe("makeRequest on Google Maps", () => {
  it("calls the Google geocoding API directly with the Maps key", async () => {
    let url = "";
    global.fetch = vi.fn(async (input: string | URL | Request) => {
      url = String(input);
      return new Response(JSON.stringify({ status: "OK", results: [] }), { status: 200 });
    }) as unknown as typeof fetch;
    await makeRequest("/maps/api/geocode/json", { address: "73301" });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://maps.googleapis.com/maps/api/geocode/json");
    expect(parsed.searchParams.get("key")).toBe("test-maps-key");
    expect(parsed.searchParams.get("address")).toBe("73301");
  });
});

describe("notifyOwner by email", () => {
  it("emails OWNER_EMAIL and reports success", async () => {
    sendEmail.mockResolvedValue({ success: true });
    await expect(notifyOwner({ title: "New <order>", content: "Total: $5 & more" })).resolves.toBe(true);
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toBe("owner@example.test");
    expect(mail.subject).toBe("[Cabinet Dealz] New <order>");
    expect(mail.text).toBe("Total: $5 & more");
    expect(mail.html).toContain("New &lt;order&gt;");
    expect(mail.html).not.toContain("<order>");
  });

  it("returns false (best effort) when email is not configured or delivery throws", async () => {
    sendEmail.mockResolvedValueOnce({ success: false, notConfigured: true, error: "SMTP not configured" });
    await expect(notifyOwner({ title: "t", content: "c" })).resolves.toBe(false);
    sendEmail.mockRejectedValueOnce(new Error("smtp down"));
    await expect(notifyOwner({ title: "t", content: "c" })).resolves.toBe(false);
  });

  it("still rejects an empty title with a validation error", async () => {
    await expect(notifyOwner({ title: " ", content: "c" })).rejects.toThrow(/title is required/i);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
