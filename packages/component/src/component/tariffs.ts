import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const create = mutation({
  args: {
    organizationId: v.id("organizations"),
    propertyId: v.optional(v.id("properties")),
    name: v.string(),
    currency: v.string(),
    pricePerKwhMinor: v.number(),
    sessionFeeMinor: v.number(),
    idleFeePerMinuteMinor: v.number(),
    idleGraceMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("tariffs", { ...args, active: true });
  },
});

export const listByOrganization = query({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("tariffs")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
      .take(100);
  },
});
