import { query } from "./_generated/server";

/**
 * Public station directory — powers the driver-facing map/list, the
 * `GET /api/public/stations` endpoint, and the WebMCP `list_chargers` tool.
 * Only properties marked `public` are listed.
 */
export const listPublic = query({
  args: {},
  handler: async (ctx) => {
    const properties = (await ctx.db.query("properties").take(50)).filter(
      (p) => p.access === "public",
    );
    const stations = [];
    for (const property of properties) {
      const chargers = (
        await ctx.db
          .query("chargers")
          .withIndex("by_propertyId", (q) => q.eq("propertyId", property._id))
          .take(20)
      ).filter((c) => c.status === "active");
      const chargerRows = [];
      for (const charger of chargers) {
        const conn = await ctx.db
          .query("chargerConnections")
          .withIndex("by_chargerId", (q) => q.eq("chargerId", charger._id))
          .unique();
        const connectors = await ctx.db
          .query("connectors")
          .withIndex("by_chargerId", (q) => q.eq("chargerId", charger._id))
          .take(16);
        const connectorRows = [];
        for (const connector of connectors) {
          const tariff = connector.tariffId ? await ctx.db.get(connector.tariffId) : null;
          connectorRows.push({
            connectorNumber: connector.connectorNumber,
            connectorType: connector.connectorType,
            maxPowerKw: connector.maxPowerKw,
            status: connector.ocppStatus,
            available: connector.ocppStatus === "Available" && !connector.currentSessionId,
            qrToken: connector.qrToken,
            pricePerKwhMinor: tariff?.pricePerKwhMinor ?? null,
            sessionFeeMinor: tariff?.sessionFeeMinor ?? null,
            currency: tariff?.currency ?? property.currency,
          });
        }
        chargerRows.push({
          name: charger.name,
          vendor: charger.vendor ?? null,
          model: charger.model ?? null,
          online: conn?.online ?? false,
          connectors: connectorRows,
        });
      }
      stations.push({
        name: property.name,
        address: property.address,
        city: property.city,
        country: property.country,
        latitude: property.latitude ?? null,
        longitude: property.longitude ?? null,
        chargers: chargerRows,
      });
    }
    return stations;
  },
});
