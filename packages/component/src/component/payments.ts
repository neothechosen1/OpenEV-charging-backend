import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    sessionId: v.id("sessions"),
    provider: v.union(
      v.literal("stripe"),
      v.literal("wompi"),
      v.literal("mercadopago"),
      v.literal("demo"),
    ),
    mode: v.union(v.literal("hold"), v.literal("prepaid")),
    currency: v.string(),
    authorizedMinor: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("payments", { ...args, status: "requires_payment" });
  },
});

export const setProviderRef = mutation({
  args: { paymentId: v.id("payments"), providerRef: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.paymentId, { providerRef: args.providerRef });
    return null;
  },
});

export const markAuthorized = mutation({
  args: { paymentId: v.id("payments"), providerRef: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || payment.status === "authorized") return null; // idempotent
    await ctx.db.patch(args.paymentId, {
      status: "authorized",
      ...(args.providerRef ? { providerRef: args.providerRef } : {}),
    });
    return null;
  },
});

export const markCaptured = mutation({
  args: { paymentId: v.id("payments"), capturedMinor: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.paymentId, {
      status: "captured",
      capturedMinor: args.capturedMinor,
    });
    return null;
  },
});

export const markCanceled = mutation({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.paymentId, { status: "canceled" });
    return null;
  },
});

export const markFailed = mutation({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.paymentId, { status: "failed" });
    return null;
  },
});

export const get = query({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.paymentId);
  },
});

/**
 * Idempotency helper for webhook redeliveries and OCPP retries.
 * Returns true the first time a key is seen, false on repeats.
 */
export const markProcessed = mutation({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("processedEvents")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (existing) return false;
    await ctx.db.insert("processedEvents", { key: args.key, at: Date.now() });
    return true;
  },
});
