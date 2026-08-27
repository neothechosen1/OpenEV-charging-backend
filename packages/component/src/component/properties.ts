import { v } from "convex/values";
import { mutation } from "./_generated/server";

/** Update a property's electricity cost; snapshotted into future sessions only. */
export const setElectricityCost = mutation({
  args: {
    propertyId: v.id("properties"),
    electricityCostPerKwhMinor: v.number(),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const property = await ctx.db.get(args.propertyId);
    if (!property) throw new Error("Property not found");
    await ctx.db.patch(args.propertyId, {
      electricityCostPerKwhMinor: args.electricityCostPerKwhMinor,
    });
    await ctx.db.insert("auditLogs", {
      organizationId: property.organizationId,
      kind: "property.electricityCostUpdated",
      actor: "admin",
      data: {
        propertyId: args.propertyId,
        electricityCostPerKwhMinor: args.electricityCostPerKwhMinor,
        source: args.source,
      },
    });
    return null;
  },
});