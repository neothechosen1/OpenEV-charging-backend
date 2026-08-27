import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Everything the operator dashboard needs, in one reactive query. */
export const overview = query({
  args: {},
  handler: async (ctx) => {
    const organization = (await ctx.db.query("organizations").take(1))[0];
    if (!organization) return null;

    const firstProperty = (
      await ctx.db
        .query("properties")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", organization._id))
        .take(1)
    )[0];

    const chargers = await ctx.db
      .query("chargers")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", organization._id))
      .take(100);

    let chargersOnline = 0;
    const chargerRows = [];
    for (const charger of chargers) {
      const conn = await ctx.db
        .query("chargerConnections")
        .withIndex("by_chargerId", (q) => q.eq("chargerId", charger._id))
        .unique();
      const property = await ctx.db.get(charger.propertyId);
      const connectors = await ctx.db
        .query("connectors")
        .withIndex("by_chargerId", (q) => q.eq("chargerId", charger._id))
        .take(16);
      const online = conn?.online ?? false;
      if (online) chargersOnline += 1;
      const connectorRows = [];
      for (const connector of connectors) {
        const tariff = connector.tariffId ? await ctx.db.get(connector.tariffId) : null;
        connectorRows.push({
          connectorId: connector._id,
          connectorNumber: connector.connectorNumber,
          connectorType: connector.connectorType,
          maxPowerKw: connector.maxPowerKw,
          status: connector.ocppStatus,
          qrToken: connector.qrToken,
          currentSessionId: connector.currentSessionId ?? null,
          pricePerKwhMinor: tariff?.pricePerKwhMinor ?? null,
          currency: tariff?.currency ?? organization.currency,
        });
      }
      chargerRows.push({
        chargerId: charger._id,
        name: charger.name,
        propertyName: property?.name ?? "",
        vendor: charger.vendor ?? null,
        model: charger.model ?? null,
        firmwareVersion: charger.firmwareVersion ?? null,
        status: charger.status,
        online,
        lastHeartbeatAt: conn?.lastHeartbeatAt ?? null,
        connectors: connectorRows,
      });
    }

    const active = [
      ...(await ctx.db
        .query("sessions")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", organization._id).eq("status", "charging"),
        )
        .take(50)),
      ...(await ctx.db
        .query("sessions")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", organization._id).eq("status", "stopping"),
        )
        .take(50)),
    ];

    const since = Date.now() - DAY_MS;
    const completedRecent = (
      await ctx.db
        .query("sessions")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", organization._id).eq("status", "completed"),
        )
        .order("desc")
        .take(200)
    ).filter((s) => (s.stoppedAt ?? 0) >= since);

    let energyTodayWh = 0;
    let revenueTodayMinor = 0;
    let platformFeeTodayMinor = 0;
    let electricityCostTodayMinor = 0;
    for (const s of completedRecent) {
      energyTodayWh += s.energyWh;
      revenueTodayMinor += s.amounts?.totalMinor ?? 0;
      platformFeeTodayMinor += s.amounts?.platformFeeMinor ?? 0;
      electricityCostTodayMinor += s.amounts?.electricityCostMinor ?? 0;
    }
    // Live energy from in-progress sessions counts toward today's total.
    for (const s of active) energyTodayWh += s.energyWh;

    return {
      organization: {
        name: organization.name,
        currency: organization.currency,
        platformFeeBps: organization.platformFeeBps,
      },
      property: firstProperty
        ? {
            propertyId: firstProperty._id,
            name: firstProperty.name,
            electricityCostPerKwhMinor: firstProperty.electricityCostPerKwhMinor,
            currency: firstProperty.currency,
          }
        : null,
      kpis: {
        chargersTotal: chargers.length,
        chargersOnline,
        activeSessions: active.length,
        energyTodayWh,
        revenueTodayMinor,
        platformFeeTodayMinor,
        electricityCostTodayMinor,
        operatorNetTodayMinor: revenueTodayMinor - platformFeeTodayMinor,
        sessionsToday: completedRecent.length,
        currency: organization.currency,
      },
      chargers: chargerRows,
    };
  },
});

/** Recent sessions across all states, newest first, with charger names joined. */
export const listSessions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 25, 100);
    const organization = (await ctx.db.query("organizations").take(1))[0];
    if (!organization) return [];
    const statuses = ["charging", "stopping", "completed", "authorized", "failed"] as const;
    let all: Doc<"sessions">[] = [];
    for (const status of statuses) {
      const rows = await ctx.db
        .query("sessions")
        .withIndex("by_organizationId_and_status", (q) =>
          q.eq("organizationId", organization._id).eq("status", status),
        )
        .order("desc")
        .take(limit);
      all = all.concat(rows);
    }
    all.sort((a, b) => b._creationTime - a._creationTime);
    const chargerNames = new Map<string, string>();
    const out = [];
    for (const s of all.slice(0, limit)) {
      let chargerName = chargerNames.get(s.chargerId);
      if (chargerName === undefined) {
        chargerName = (await ctx.db.get(s.chargerId))?.name ?? "";
        chargerNames.set(s.chargerId, chargerName);
      }
      out.push({
        sessionId: s._id,
        createdAt: s._creationTime,
        chargerName,
        status: s.status,
        paymentMode: s.paymentMode,
        driverEmail: s.driverEmail ?? null,
        energyWh: s.energyWh,
        startedAt: s.startedAt ?? null,
        stoppedAt: s.stoppedAt ?? null,
        totalMinor: s.amounts?.totalMinor ?? null,
        platformFeeMinor: s.amounts?.platformFeeMinor ?? null,
        currency: s.tariffSnapshot.currency,
        stopReason: s.stopReason ?? null,
      });
    }
    return out;
  },
});
