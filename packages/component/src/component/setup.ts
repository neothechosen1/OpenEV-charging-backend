import { mutation } from "./_generated/server";

/**
 * Seed the Colombia-first demo world: one organization (COP, 10% platform fee),
 * one property in Cali, one visitor tariff, one simulated charger (SIM-001).
 * Idempotent — safe to call repeatedly. Demo pricing only, not real rates.
 */
export const seedDemo = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", "demo"))
      .unique();
    if (existing) {
      const charger = await ctx.db
        .query("chargers")
        .withIndex("by_ocppIdentity", (q) => q.eq("ocppIdentity", "SIM-001"))
        .unique();
      const connector = charger
        ? await ctx.db
            .query("connectors")
            .withIndex("by_chargerId", (q) => q.eq("chargerId", charger._id))
            .unique()
        : null;
      return {
        organizationId: existing._id,
        ocppIdentity: "SIM-001",
        qrToken: connector?.qrToken ?? null,
      };
    }
    const organizationId = await ctx.db.insert("organizations", {
      name: "Demo Energía",
      slug: "demo",
      country: "CO",
      timezone: "America/Bogota",
      currency: "COP",
      platformFeeBps: 1000, // 10%
      status: "active",
    });
    const propertyId = await ctx.db.insert("properties", {
      organizationId,
      name: "Edificio Menga",
      address: "Menga 8-67",
      city: "Cali",
      country: "CO",
      timezone: "America/Bogota",
      access: "public",
      electricityCostPerKwhMinor: 800, // sample cost, COP/kWh
      currency: "COP",
    });
    const tariffId = await ctx.db.insert("tariffs", {
      organizationId,
      propertyId,
      name: "Visitantes",
      currency: "COP",
      pricePerKwhMinor: 1200, // sample price, COP/kWh
      sessionFeeMinor: 2000,
      idleFeePerMinuteMinor: 200,
      idleGraceMinutes: 10,
      active: true,
    });
    const chargerId = await ctx.db.insert("chargers", {
      organizationId,
      propertyId,
      name: "Cargador Torre A",
      ocppIdentity: "SIM-001",
      protocol: "ocpp1.6j",
      status: "pending",
    });
    const qrTokenBytes = new Uint8Array(16);
    crypto.getRandomValues(qrTokenBytes);
    const qrToken = Array.from(qrTokenBytes, (b) => b.toString(16).padStart(2, "0")).join("");
    await ctx.db.insert("connectors", {
      organizationId,
      propertyId,
      chargerId,
      connectorNumber: 1,
      connectorType: "J1772",
      maxPowerKw: 7.4,
      ocppStatus: "Unavailable",
      qrToken,
      tariffId,
    });
    return { organizationId, ocppIdentity: "SIM-001", qrToken };
  },
});
