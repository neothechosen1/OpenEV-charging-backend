import { v } from "convex/values";
import { action } from "./_generated/server";
import { components } from "./_generated/api";

// Firecrawl-powered import: read a utility's tariff page and set the property's
// electricity cost per kWh — the number that drives margin reporting.
// Gated on FIRECRAWL_API_KEY.

export const suggestElectricityCost = action({
  args: { url: v.string(), propertyId: v.string() },
  handler: async (ctx, args) => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) return { available: false as const };
    if (!/^https?:\/\//.test(args.url)) throw new Error("bad url");

    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        url: args.url,
        onlyMainContent: true,
        formats: [
          {
            type: "json",
            prompt:
              "Find the electricity tariff (price per kWh) in Colombian pesos on this page. Prefer the standard residential or commercial rate. Return the numeric COP per kWh.",
            schema: {
              type: "object",
              properties: {
                copPerKwh: { type: "number" },
                rateName: { type: "string" },
              },
              required: ["copPerKwh"],
            },
          },
        ],
      }),
    });
    const json = (await res.json()) as {
      success?: boolean;
      data?: { json?: { copPerKwh?: number; rateName?: string } };
    };
    if (!res.ok) throw new Error(`import failed (${res.status})`);
    const copPerKwh = json.data?.json?.copPerKwh;
    if (typeof copPerKwh !== "number" || copPerKwh < 50 || copPerKwh > 10_000) {
      throw new Error("couldn't find a plausible COP/kWh tariff on that page");
    }
    const minor = Math.round(copPerKwh);
    await ctx.runMutation(components.evCharging.properties.setElectricityCost, {
      propertyId: args.propertyId,
      electricityCostPerKwhMinor: minor,
      source: args.url,
    });
    return {
      available: true as const,
      copPerKwh: minor,
      rateName: json.data?.json?.rateName ?? null,
    };
  },
});
