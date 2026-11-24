import { describe, expect, it, vi } from "vitest";
import { DEFAULT_OUTREACH_SEQUENCE } from "@shared/crmOutreach";
import { BUILT_IN_BLOCKED_NAMES, OUTREACH_SYSTEM_PROMPT, buildOutreachUserPrompt, checkOutreachDraft, draftOutreachEmail, type OutreachContactFacts } from "./ai";

const facts: OutreachContactFacts = {
  firstName: "Jane",
  city: "Concord",
  state: "NH",
  lastPurchaseDate: "1998-03-07",
  customerListName: "New Hampshire legacy",
  notesFromList: null,
  savedDesignCount: 0,
  previousSubjects: [],
};
const goodBody = "Hi Jane,\n\nIt has been a while since your last project with us, and I wanted to say hello. CabinetDealz now has an online kitchen designer where you can try door styles and colors.\n\nIf a kitchen or bath project is on your mind, just reply and let me know.";
const opts = { blockedNames: [...BUILT_IN_BLOCKED_NAMES], factsText: "Jane Concord NH 1998-03-07 New Hampshire legacy", offerText: "" };

describe("outreach AI prompt", () => {
  it("states every hard rule", () => {
    expect(OUTREACH_SYSTEM_PROMPT).toMatch(/Never invent history, products, projects, prices, discounts, promotions, statistics/);
    expect(OUTREACH_SYSTEM_PROMPT).toMatch(/Never name any supplier, manufacturer, distributor/);
    expect(OUTREACH_SYSTEM_PROMPT).toMatch(/Never claim or suggest that you are a human/);
    expect(OUTREACH_SYSTEM_PROMPT).toMatch(/no "Re:" or "Fwd:"/);
  });

  it("only passes facts, the step goal and an explicit no-offer line", () => {
    const prompt = buildOutreachUserPrompt(facts, DEFAULT_OUTREACH_SEQUENCE[0], 1, new Date("2026-11-23T12:00:00Z"));
    expect(prompt).toContain('"firstName":"Jane"');
    expect(prompt).toContain("OFFER: none. Mention no offer.");
    expect(prompt).toContain("CURRENT SEASON: fall");
  });
});

describe("draft safety gate", () => {
  it("accepts a plain, factual draft", () => {
    expect(checkOutreachDraft({ subject: "Checking in from CabinetDealz", body: goodBody }, opts)).toEqual({ ok: true });
  });

  it.each([
    ["claims to be human", "I'm a real person, not a bot, and I wanted to reach out."],
    ["names a supplier", "We carry the full US Cabinet Depot line."],
    ["names Pelican", "Our Pelican slabs are back."],
    ["mentions a price", "Cabinets start at $99 this month."],
    ["mentions a discount", "Enjoy a discount on your next order."],
    ["percentage", "Save 20% this season."],
    ["invented stat", "Over 5000 happy customers trust us."],
    ["a link", "Visit www.example.com today."],
  ])("rejects a draft that %s", (_label, sentence) => {
    const result = checkOutreachDraft({ subject: "Checking in", body: `${goodBody}\n\n${sentence}` }, opts);
    expect(result.ok).toBe(false);
  });

  it("rejects deceptive Re:/Fwd: subjects", () => {
    expect(checkOutreachDraft({ subject: "Re: your kitchen", body: goodBody }, opts).ok).toBe(false);
  });

  it("allows Tom's own offer wording only", () => {
    const offerOpts = { ...opts, offerText: "a free 30 minute design consultation" };
    const body = `${goodBody}\n\nThis season we're offering a free 30 minute design consultation.`;
    expect(checkOutreachDraft({ subject: "A fall check-in", body }, offerOpts)).toEqual({ ok: true });
    expect(checkOutreachDraft({ subject: "A fall check-in", body: `${body} Plus 10% off.` }, offerOpts).ok).toBe(false);
  });
});

describe("draftOutreachEmail", () => {
  const base = { facts, step: DEFAULT_OUTREACH_SEQUENCE[0], stepIndex: 0, senderName: "Tom at CabinetDealz", blockedNames: [...BUILT_IN_BLOCKED_NAMES], now: new Date("2026-11-23T12:00:00Z") };

  it("uses a mocked AI draft that passes the gate", async () => {
    const llm = vi.fn().mockResolvedValue({ choices: [{ message: { content: JSON.stringify({ subject: "Checking in from CabinetDealz", body: goodBody }) } }] });
    const result = await draftOutreachEmail({ ...base, llm });
    expect(result.source).toBe("ai");
    expect(llm).toHaveBeenCalledTimes(1);
    const system = llm.mock.calls[0][0].messages[0].content as string;
    expect(system).toContain("from Tom at CabinetDealz");
  });

  it("retries once, then falls back to the fixed template when the AI breaks a rule", async () => {
    const bad = { choices: [{ message: { content: JSON.stringify({ subject: "Hi", body: `${goodBody} I'm a real person and Pelican has 30% off.` }) } }] };
    const llm = vi.fn().mockResolvedValue(bad);
    const result = await draftOutreachEmail({ ...base, llm });
    expect(llm).toHaveBeenCalledTimes(2);
    expect(result.source).toBe("fallback");
    expect(result.body).not.toMatch(/Pelican|%|real person/);
    expect(result.problems.join(" ")).toMatch(/claims to be human/);
  });

  it("falls back without calling anything when no AI is configured", async () => {
    const result = await draftOutreachEmail({ ...base, llm: null });
    expect(result.source).toBe("fallback");
    expect(result.body.startsWith("Hi Jane,")).toBe(true);
  });

  it("fixed templates pass the same gate", async () => {
    for (let i = 0; i < DEFAULT_OUTREACH_SEQUENCE.length; i += 1) {
      const result = await draftOutreachEmail({ ...base, step: DEFAULT_OUTREACH_SEQUENCE[i], stepIndex: i, llm: null });
      expect(checkOutreachDraft(result, { ...opts, factsText: `${opts.factsText} 3` })).toEqual({ ok: true });
    }
  });
});
