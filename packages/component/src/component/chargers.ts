import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { randomToken } from "./lib/ids";

/** BootNotification: charger announces itself after power-up / reconnect. */
export const boot = mutation({
  args: {
    ocppIdentity: v.string(),
    vendor: v.optional(v.string()),
    model: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    firmwareVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const charger = await ctx.db
      .query("chargers")
      .withIndex("by_ocppIdentity", (q) => q.eq("ocppIdentity", args.ocppIdentity))
      .unique();
    if (!charger || charger.status === "disabled") {
      return { accepted: false, intervalSec: 300 };
    }
    await ctx.db.patch(charger._id, {
      vendor: args.vendor ?? charger.vendor,
      model: args.model ?? charger.model,
      serialNumber: args.serialNumber ?? charger.serialNumber,
      firmwareVersion: args.firmwareVersion ?? charger.firmwareVersion,
      ...(charger.status === "pending" ? { status: "active" as const } : {}),
    });
    const now = Date.now();
    const conn = await ctx.db
      .query("chargerConnections")
      .withIndex("by_chargerId", (q) => q.eq("chargerId", charger._id))
      .unique();
    if (conn) {
      await ctx.db.patch(conn._id, { online: true, lastHeartbeatAt: now, lastBootAt: now });
    } else {
      await ctx.db.insert("chargerConnections", {
        chargerId: charger._id,
        online: true,
        lastHeartbeatAt: now,
        lastBootAt: now,
      });
    }
    return { accepted: true, intervalSec: 30 };
  },
});

export const heartbeat = mutation({
  args: { ocppIdentity: v.string() },
  handler: async (ctx, args) => {
    const charger = await ctx.db
      .query("chargers")
      .withIndex("by_ocppIdentity", (q) => q.eq("ocppIdentity", args.ocppIdentity))
      .unique();
    if (!charger) return null;
    const conn = await ctx.db
      .query("chargerConnections")
      .withIndex("by_chargerId", (q) => q.eq("chargerId", charger._id))
      .unique();
    if (conn) {
      await ctx.db.patch(conn._id, { online: true, lastHeartbeatAt: Date.now() });
    }
    return null;
  },
});

/** StatusNotification: a connector changed state (Available/Charging/Faulted/...). */
export const statusNotification = mutation({
  args: {
    ocppIdentity: v.string(),
    connectorNumber: v.number(),
    ocppStatus: v.string(),
    errorCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const charger = await ctx.db
      .query("chargers")
      .withIndex("by_ocppIdentity", (q) => q.eq("ocppIdentity", args.ocppIdentity))
      .unique();
    if (!charger) return null;
    // connectorNumber 0 refers to the charger as a whole — just audit it.
    if (args.connectorNumber === 0) {
      await ctx.db.insert("auditLogs", {
        organizationId: charger.organizationId,
        kind: "charger.status",
        actor: args.ocppIdentity,
        data: { status: args.ocppStatus, errorCode: args.errorCode },
      });
      return null;
    }
    const connectors = await ctx.db
      .query("connectors")
      .withIndex("by_chargerId", (q) => q.eq("chargerId", charger._id))
      .take(16);
    const connector = connectors.find((c) => c.connectorNumber === args.connectorNumber);
    if (!connector) return null;
    await ctx.db.patch(connector._id, { ocppStatus: args.ocppStatus });
    // Free the connector once a finished session's plug is back to Available.
    if (args.ocppStatus === "Available" && connector.currentSessionId) {
      const session = await ctx.db.get(connector.currentSessionId);
      if (!session || session.status === "completed" || session.status === "failed") {
        await ctx.db.patch(connector._id, { currentSessionId: undefined });
      }
    }
    return null;
  },
});

/** Gateway reports the charger's WebSocket dropped. */
export const disconnected = mutation({
  args: { ocppIdentity: v.string() },
  handler: async (ctx, args) => {
    const charger = await ctx.db
      .query("chargers")
      .withIndex("by_ocppIdentity", (q) => q.eq("ocppIdentity", args.ocppIdentity))
      .unique();
    if (!charger) return null;
    const conn = await ctx.db
      .query("chargerConnections")
      .withIndex("by_chargerId", (q) => q.eq("chargerId", charger._id))
      .unique();
    if (conn) await ctx.db.patch(conn._id, { online: false });
    return null;
  },
});

/** Register a charger + its connectors; returns QR tokens to print. */
export const register = mutation({
  args: {
    organizationId: v.id("organizations"),
    propertyId: v.id("properties"),
    name: v.string(),
    ocppIdentity: v.string(),
    connectors: v.array(
      v.object({
        connectorNumber: v.number(),
        connectorType: v.string(),
        maxPowerKw: v.number(),
        tariffId: v.optional(v.id("tariffs")),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("chargers")
      .withIndex("by_ocppIdentity", (q) => q.eq("ocppIdentity", args.ocppIdentity))
      .unique();
    if (existing) throw new Error(`Charger identity already registered: ${args.ocppIdentity}`);
    const chargerId = await ctx.db.insert("chargers", {
      organizationId: args.organizationId,
      propertyId: args.propertyId,
      name: args.name,
      ocppIdentity: args.ocppIdentity,
      protocol: "ocpp1.6j",
      status: "pending",
    });
    const connectors = [];
    for (const c of args.connectors) {
      const qrToken = randomToken(16);
      const connectorId = await ctx.db.insert("connectors", {
        organizationId: args.organizationId,
        propertyId: args.propertyId,
        chargerId,
        connectorNumber: c.connectorNumber,
        connectorType: c.connectorType,
        maxPowerKw: c.maxPowerKw,
        ocppStatus: "Unavailable",
        qrToken,
        tariffId: c.tariffId,
      });
      connectors.push({ connectorId, connectorNumber: c.connectorNumber, qrToken });
    }
    await ctx.db.insert("auditLogs", {
      organizationId: args.organizationId,
      kind: "charger.registered",
      actor: "admin",
      data: { ocppIdentity: args.ocppIdentity },
    });
    return { chargerId, connectors };
  },
});
