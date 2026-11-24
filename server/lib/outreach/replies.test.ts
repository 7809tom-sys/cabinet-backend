import { describe, expect, it } from "vitest";
import { bareAddress, classifyReply, latestReplyText } from "./replies";

describe("reply classification", () => {
  it.each([
    ["Are you a bot?", "asks_if_automated"],
    ["is this automated or a real person", "asks_if_automated"],
    ["Am I talking to a real person here?", "asks_if_automated"],
    ["Is this AI generated?", "asks_if_automated"],
    ["Please unsubscribe me", "unsubscribe"],
    ["STOP", "unsubscribe"],
    ["take me off your list", "unsubscribe"],
    ["Yes, we're thinking about redoing the kitchen next spring.", "reply"],
  ])("%s → %s", (text, kind) => {
    expect(classifyReply("Re: Checking in", text)).toBe(kind);
  });

  it("an automation question wins over unsubscribe so Tom sees it", () => {
    expect(classifyReply("Re: hi", "Is this a bot? If so unsubscribe me.")).toBe("asks_if_automated");
  });

  it("detects out-of-office replies by subject", () => {
    expect(classifyReply("Out of Office: back Monday", "I am away")).toBe("auto_reply");
  });

  it("ignores quoted history", () => {
    expect(latestReplyText("Sounds good\n\nOn Mon, Nov 23, 2026 Tom wrote:\n> are you a bot")).toBe("Sounds good");
  });

  it("extracts the address", () => {
    expect(bareAddress('"Jane Doe" <Jane@Example.com>')).toBe("jane@example.com");
  });
});
