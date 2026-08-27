import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";

/** Seed the Colombia-first demo world (idempotent). */
export const seedDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const result: {
      organizationId: string;
      ocppIdentity: string;
      qrToken: string | null;
    } = await ctx.runMutation(components.evCharging.setup.seedDemo, {});
    return result;
  },
});

/**
 * Demo checkout: driver scanned the QR and pressed Start.
 * Creates the session and authorizes it in "demo" payment mode (no real money).
 * Phase 2 replaces this path with Stripe (hold) / Wompi (prepaid) checkouts.
 */
export const demoCheckout = mutation({
  args: { qrToken: v.string(), driverEmail: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const info = await ctx.runMutation(components.evCharging.sessions.createFromQr, {
      qrToken: args.qrToken,
      driverEmail: args.driverEmail,
      paymentMode: "demo",
    });
    await ctx.runMutation(components.evCharging.sessions.markAuthorized, {
      sessionId: info.sessionId,
    });
    return info;
  },
});

/** Live session for the driver page — updates reactively as meter values arrive. */
export const liveSession = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.runQuery(components.evCharging.sessions.getLive, {
      sessionId: args.sessionId,
    });
  },
});

/** Driver pressed Stop. */
export const stopSession = mutation({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    await ctx.runMutation(components.evCharging.sessions.requestStop, {
      sessionId: args.sessionId,
    });
    return null;
  },
});
