import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { invokeLLM } from "../_core/llm";

const messageInput = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

/**
 * Cabinet Dealz AI assistant.
 *
 * A public, on-site helper scoped strictly to kitchen/cabinet shopping and
 * design. It answers routine questions so the owner only gets pulled in (via
 * the live-chat handoff) when a visitor actually wants a human.
 *
 * No supplier/brand names are ever revealed — the catalog is white-labeled.
 */
const SYSTEM_PROMPT = `You are the Cabinet Dealz assistant, a friendly, concise helper on the Cabinet Dealz website.

Cabinet Dealz sells kitchen and bathroom cabinets (RTA / ready-to-assemble and assembled), door styles and finishes, vanities, and related accessories, plus design help and countertop quotes.

Your job:
- Help visitors understand cabinet categories (Base, Wall, Tall, Vanity, ADA, Accessory), door styles, finishes, sizing, and how to order or request a quote.
- Guide them to the right page: Catalog, Door Styles, Design Tool, Build an Order, Photo to Cart (upload a cabinet list/floor plan), Kitchen Packages, or the Pro Network.
- Explain that an order stays within one door style/finish "line" (family) to keep shipping efficient.
- Encourage them to add items to the cart and submit an order request, or to ask for a quote.

Rules:
- Stay strictly on kitchen/cabinet/bath-cabinet shopping, design, and ordering topics. If asked about anything unrelated, politely steer back: "I can help with cabinets, door styles, and your kitchen project — what are you working on?"
- NEVER name or speculate about which manufacturer, distributor, supplier, or brand makes a product. The catalog is private-label; refer to "our cabinet lines" only.
- Do not invent specific prices, lead times, or stock. For exact pricing or availability, tell them prices show in the catalog when signed in, or to request a quote / talk to a person.
- Keep replies short and practical (2-5 sentences). Use plain language.
- If the visitor wants a human, tell them to click "Talk to a live person".`;

export const assistantRouter = router({
  chat: publicProcedure
    .input(
      z.object({
        messages: z.array(messageInput).min(1).max(40),
      }),
    )
    .mutation(async ({ input }) => {
      const result = await invokeLLM({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...input.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        maxTokens: 600,
      });

      const content = result.choices?.[0]?.message?.content;
      const reply =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content.map((c) => ("text" in c ? c.text : "")).join("")
            : "";

      return {
        reply:
          reply.trim() ||
          "Sorry, I had trouble with that. Could you rephrase, or click \u201cTalk to a live person\u201d?",
      };
    }),
});
