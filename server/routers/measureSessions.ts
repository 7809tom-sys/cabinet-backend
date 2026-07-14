/**
 * Measure Sessions Router
 * Bridges the AR Tape Measure (phone) with the Design Tool (desktop).
 * Flow:
 *   1. Designer calls createSession → gets a token
 *   2. Phone opens /measure?session=TOKEN, measures walls
 *   3. Phone calls saveMeasurements with wall data
 *   4. Designer polls pollSession until status === "completed"
 *   5. Designer calls consumeSession to mark it used
 */
import { z } from "zod";
import { randomUUID } from "crypto";
import { eq, and, lt } from "drizzle-orm";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { measureSessions } from "../../drizzle/schema";

const WallMeasurement = z.object({
  label: z.string().max(64),   // e.g. "Wall A", "North Wall"
  inches: z.number().positive(), // total inches
  feet: z.number().positive(),   // decimal feet
  meters: z.number().positive(),
  segmentType: z.enum(["wall", "window", "door", "plumbing", "electrical"]).default("wall"),
});

export const measureSessionsRouter = router({
  /** Desktop designer calls this to create a pending session */
  createSession: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min TTL

    await db.insert(measureSessions).values({
      token,
      userId: ctx.user.id,
      status: "pending",
      expiresAt,
    });

    return { token };
  }),

  /** Phone calls this to save measurements to the session */
  saveMeasurements: publicProcedure
    .input(z.object({
      token: z.string().uuid(),
      walls: z.array(WallMeasurement).min(1).max(20),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const now = new Date();

      const [session] = await db
        .select()
        .from(measureSessions)
        .where(eq(measureSessions.token, input.token))
        .limit(1);

      if (!session) throw new Error("Session not found");
      if (session.status === "consumed") throw new Error("Session already used");
      if (session.expiresAt < now) throw new Error("Session expired");

      await db
        .update(measureSessions)
        .set({
          measurements: JSON.stringify(input.walls),
          status: "completed",
          completedAt: now,
        })
        .where(eq(measureSessions.token, input.token));

      return { ok: true };
    }),

  /** Desktop designer polls this until status === "completed" */
  pollSession: protectedProcedure
    .input(z.object({ token: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { status: "not_found" as const, walls: null };
      const now = new Date();

      const [session] = await db
        .select()
        .from(measureSessions)
        .where(
          and(
            eq(measureSessions.token, input.token),
            eq(measureSessions.userId, ctx.user.id),
          ),
        )
        .limit(1);

      if (!session) return { status: "not_found" as const, walls: null };
      if (session.expiresAt < now) return { status: "expired" as const, walls: null };

      const walls = session.measurements
        ? (JSON.parse(session.measurements) as z.infer<typeof WallMeasurement>[])
        : null;

      return {
        status: session.status as "pending" | "completed" | "consumed",
        walls,
      };
    }),

  /** Desktop designer calls this after consuming the measurements */
  consumeSession: protectedProcedure
    .input(z.object({ token: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db
        .update(measureSessions)
        .set({ status: "consumed" })
        .where(
          and(
            eq(measureSessions.token, input.token),
            eq(measureSessions.userId, ctx.user.id),
          ),
        );
      return { ok: true };
    }),

  /** Cleanup expired sessions (called opportunistically) */
  cleanupExpired: publicProcedure.mutation(async () => {
    const db = await getDb();
    if (!db) return { ok: true };
    await db
      .delete(measureSessions)
      .where(lt(measureSessions.expiresAt, new Date()));
    return { ok: true };
  }),
});
