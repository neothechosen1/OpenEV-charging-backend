import { auditedMutation } from "./auditedMutations";
import { v } from "convex/values";
import {query} from "./_generated/server";

export const create = auditedMutation("payments.create")({
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

export const setProviderRef = auditedMutation("payments.setProviderRef")({
  args: { paymentId: v.id("payments"), providerRef: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.paymentId, { providerRef: args.providerRef });
    return null;
  },
});

export const markAuthorized = auditedMutation("payments.markAuthorized")({
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

export const markCaptured = auditedMutation("payments.markCaptured")({
  args: { paymentId: v.id("payments"), capturedMinor: v.number() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.paymentId, {
      status: "captured",
      capturedMinor: args.capturedMinor,
    });
    return null;
  },
});

export const markCanceled = auditedMutation("payments.markCanceled")({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.paymentId, { status: "canceled" });
    return null;
  },
});

export const markFailed = auditedMutation("payments.markFailed")({
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

export const getByProviderRef = query({
  args: { providerRef: v.string() },
  handler: async (ctx, args) => {
    const matches = await ctx.db
      .query("payments")
      .withIndex("by_providerRef", (q) => q.eq("providerRef", args.providerRef))
      .take(1);
    return matches[0] ?? null;
  },
});

/**
 * Idempotency helper for webhook redeliveries and OCPP retries.
 * Returns true the first time a key is seen, false on repeats.
 */
export const markProcessed = auditedMutation("payments.markProcessed")({
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
