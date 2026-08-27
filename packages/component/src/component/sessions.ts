import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { enqueueCommand } from "./commands";
import { computeAmounts, runningCostMinor } from "./lib/pricing";
import { randomIdTag } from "./lib/ids";

// Auto-stop before a payment hold would be exceeded (95% of authorized amount).
const OVERRUN_GUARD = 0.95;

async function nextTransactionId(ctx: MutationCtx): Promise<number> {
  const row = await ctx.db
    .query("counters")
    .withIndex("by_key", (q) => q.eq("key", "ocppTransactionId"))
    .unique();
  if (!row) {
    await ctx.db.insert("counters", { key: "ocppTransactionId", value: 2 });
    return 1;
  }
  await ctx.db.patch(row._id, { value: row.value + 1 });
  return row.value;
}

/** Read-only checkout preview for the QR landing page — creates nothing. */
export const previewByQr = query({
  args: { qrToken: v.string() },
  handler: async (ctx, args) => {
    const connector = await ctx.db
      .query("connectors")
      .withIndex("by_qrToken", (q) => q.eq("qrToken", args.qrToken))
      .unique();
    if (!connector) return null;
    const charger = await ctx.db.get(connector.chargerId);
    const property = await ctx.db.get(connector.propertyId);
    const tariff = connector.tariffId ? await ctx.db.get(connector.tariffId) : null;
    if (!charger || !property) return null;
    const conn = await ctx.db
      .query("chargerConnections")
      .withIndex("by_chargerId", (q) => q.eq("chargerId", charger._id))
      .unique();
    const authorizedMinor = tariff
      ? Math.round((30_000 * tariff.pricePerKwhMinor) / 1000) + tariff.sessionFeeMinor
      : 0;
    return {
      chargerName: charger.name,
      propertyName: property.name,
      propertyAddress: `${property.address}, ${property.city}`,
      connectorNumber: connector.connectorNumber,
      connectorType: connector.connectorType,
      maxPowerKw: connector.maxPowerKw,
      status: connector.ocppStatus,
      busy: connector.currentSessionId !== undefined,
      chargerOnline: conn?.online ?? false,
      currency: tariff?.currency ?? property.currency,
      pricePerKwhMinor: tariff?.pricePerKwhMinor ?? null,
      sessionFeeMinor: tariff?.sessionFeeMinor ?? null,
      idleFeePerMinuteMinor: tariff?.idleFeePerMinuteMinor ?? null,
      authorizedMinor,
    };
  },
});

/** Driver scanned the QR: create a session with a frozen tariff snapshot. */
export const createFromQr = mutation({
  args: {
    qrToken: v.string(),
    driverEmail: v.optional(v.string()),
    paymentMode: v.union(v.literal("hold"), v.literal("prepaid"), v.literal("demo")),
    authorizedMinor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const connector = await ctx.db
      .query("connectors")
      .withIndex("by_qrToken", (q) => q.eq("qrToken", args.qrToken))
      .unique();
    if (!connector) throw new Error("Unknown QR code");
    if (connector.currentSessionId) throw new Error("Connector is busy");
    const charger = await ctx.db.get(connector.chargerId);
    const property = await ctx.db.get(connector.propertyId);
    const organization = await ctx.db.get(connector.organizationId);
    if (!charger || !property || !organization) throw new Error("Misconfigured connector");
    const tariff = connector.tariffId ? await ctx.db.get(connector.tariffId) : null;
    if (!tariff || !tariff.active) throw new Error("No active tariff for this connector");

    const tariffSnapshot = {
      currency: tariff.currency,
      pricePerKwhMinor: tariff.pricePerKwhMinor,
      sessionFeeMinor: tariff.sessionFeeMinor,
      idleFeePerMinuteMinor: tariff.idleFeePerMinuteMinor,
      idleGraceMinutes: tariff.idleGraceMinutes,
      electricityCostPerKwhMinor: property.electricityCostPerKwhMinor,
      platformFeeBps: organization.platformFeeBps,
    };
    // Default authorization: ~30 kWh worth of charging plus the session fee.
    const authorizedMinor =
      args.authorizedMinor ??
      Math.round((30_000 * tariff.pricePerKwhMinor) / 1000) + tariff.sessionFeeMinor;

    const conn = await ctx.db
      .query("chargerConnections")
      .withIndex("by_chargerId", (q) => q.eq("chargerId", charger._id))
      .unique();

    const sessionId = await ctx.db.insert("sessions", {
      organizationId: connector.organizationId,
      propertyId: connector.propertyId,
      chargerId: connector.chargerId,
      connectorId: connector._id,
      status: "pending_payment",
      driverEmail: args.driverEmail,
      paymentMode: args.paymentMode,
      authorizedMinor,
      idTag: randomIdTag(),
      tariffSnapshot,
      energyWh: 0,
    });
    return {
      sessionId,
      organizationId: connector.organizationId,
      tariffSnapshot,
      authorizedMinor,
      chargerName: charger.name,
      propertyName: property.name,
      propertyAddress: `${property.address}, ${property.city}`,
      connectorNumber: connector.connectorNumber,
      connectorType: connector.connectorType,
      maxPowerKw: connector.maxPowerKw,
      chargerOnline: conn?.online ?? false,
    };
  },
});

/** Payment authorized (or demo): reserve the connector and queue RemoteStart. */
export const markAuthorized = mutation({
  args: { sessionId: v.id("sessions"), paymentId: v.optional(v.id("payments")) },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "pending_payment") return null; // idempotent
    const connector = await ctx.db.get(session.connectorId);
    if (!connector) throw new Error("Connector not found");
    if (connector.currentSessionId && connector.currentSessionId !== session._id) {
      throw new Error("Connector is busy");
    }
    const charger = await ctx.db.get(session.chargerId);
    if (!charger) throw new Error("Charger not found");
    await ctx.db.patch(session._id, { status: "authorized", paymentId: args.paymentId });
    await ctx.db.patch(connector._id, { currentSessionId: session._id });
    await enqueueCommand(ctx, {
      chargerId: charger._id,
      ocppIdentity: charger.ocppIdentity,
      action: "RemoteStartTransaction",
      payload: { connectorId: connector.connectorNumber, idTag: session.idTag },
      sessionId: session._id,
    });
    return null;
  },
});

/** Charger confirms charging began. Returns the backend-assigned transactionId. */
export const startTransaction = mutation({
  args: {
    ocppIdentity: v.string(),
    connectorNumber: v.number(),
    idTag: v.string(),
    meterStartWh: v.number(),
  },
  handler: async (ctx, args) => {
    const charger = await ctx.db
      .query("chargers")
      .withIndex("by_ocppIdentity", (q) => q.eq("ocppIdentity", args.ocppIdentity))
      .unique();
    if (!charger) return { transactionId: 0, accepted: false };
    const candidates = await ctx.db
      .query("sessions")
      .withIndex("by_chargerId", (q) => q.eq("chargerId", charger._id))
      .order("desc")
      .take(50);
    let session = candidates.find((s) => s.idTag === args.idTag && s.status === "authorized");
    if (!session) {
      // Retry of a StartTransaction we already answered: return the same id.
      const dup = candidates.find(
        (s) =>
          s.idTag === args.idTag &&
          s.status === "charging" &&
          s.meterStartWh === args.meterStartWh &&
          s.ocppTransactionId !== undefined,
      );
      if (dup) return { transactionId: dup.ocppTransactionId!, accepted: true };
      // Firmware-quirk tolerance: a single authorized session on this connector.
      const byConnector = candidates.filter((s) => s.status === "authorized");
      if (byConnector.length === 1) session = byConnector[0];
    }
    if (!session) {
      await ctx.db.insert("auditLogs", {
        organizationId: charger.organizationId,
        kind: "session.startRejected",
        actor: args.ocppIdentity,
        data: { idTag: args.idTag, connectorNumber: args.connectorNumber },
      });
      return { transactionId: 0, accepted: false };
    }
    const transactionId = await nextTransactionId(ctx);
    await ctx.db.patch(session._id, {
      status: "charging",
      ocppTransactionId: transactionId,
      meterStartWh: args.meterStartWh,
      startedAt: Date.now(),
      energyWh: 0,
    });
    const connector = await ctx.db.get(session.connectorId);
    if (connector) {
      await ctx.db.patch(connector._id, {
        ocppStatus: "Charging",
        currentSessionId: session._id,
      });
    }
    return { transactionId, accepted: true };
  },
});

/**
 * Periodic meter reading. Updates the live session (which the driver page
 * subscribes to) and stores a sample. Auto-stops before the payment
 * authorization would be exceeded.
 */
export const meterValues = mutation({
  args: {
    ocppIdentity: v.string(),
    ocppTransactionId: v.optional(v.number()),
    reading: v.object({
      energyWh: v.optional(v.number()),
      powerW: v.optional(v.number()),
      voltage: v.optional(v.number()),
      amperage: v.optional(v.number()),
      soc: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    if (args.ocppTransactionId === undefined) return { stopRequested: false };
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_ocppTransactionId", (q) =>
        q.eq("ocppTransactionId", args.ocppTransactionId),
      )
      .unique();
    if (!session || (session.status !== "charging" && session.status !== "stopping")) {
      return { stopRequested: false };
    }
    const now = Date.now();
    const energyWh =
      args.reading.energyWh !== undefined
        ? Math.max(0, args.reading.energyWh - (session.meterStartWh ?? 0))
        : session.energyWh;
    await ctx.db.patch(session._id, {
      energyWh,
      lastPowerW: args.reading.powerW,
      lastMeterAt: now,
    });
    await ctx.db.insert("meterSamples", {
      sessionId: session._id,
      at: now,
      energyWh,
      powerW: args.reading.powerW,
      voltage: args.reading.voltage,
      amperage: args.reading.amperage,
      soc: args.reading.soc,
    });
    // Overrun guard: never charge past the authorized amount.
    if (session.paymentMode !== "demo" && session.status === "charging") {
      const cost = runningCostMinor(session.tariffSnapshot, energyWh);
      if (cost >= session.authorizedMinor * OVERRUN_GUARD) {
        await ctx.db.patch(session._id, { status: "stopping" });
        await enqueueCommand(ctx, {
          chargerId: session.chargerId,
          ocppIdentity: args.ocppIdentity,
          action: "RemoteStopTransaction",
          payload: { transactionId: args.ocppTransactionId },
          sessionId: session._id,
        });
        return { stopRequested: true };
      }
    }
    return { stopRequested: false };
  },
});

/** Charger reports the transaction ended: finalize energy + amounts. Idempotent. */
export const stopTransaction = mutation({
  args: {
    ocppIdentity: v.string(),
    ocppTransactionId: v.number(),
    meterStopWh: v.optional(v.number()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_ocppTransactionId", (q) =>
        q.eq("ocppTransactionId", args.ocppTransactionId),
      )
      .unique();
    if (!session) {
      // StopTransaction without a known Start — accept per spec, keep evidence.
      await ctx.db.insert("auditLogs", {
        kind: "session.orphanStop",
        actor: args.ocppIdentity,
        data: args,
      });
      return {
        accepted: true,
        sessionId: null,
        amounts: null,
        paymentMode: null,
        driverEmail: null,
      };
    }
    if (session.status === "completed") {
      return {
        accepted: true,
        sessionId: session._id,
        amounts: session.amounts ?? null,
        paymentMode: session.paymentMode,
        driverEmail: session.driverEmail ?? null,
      };
    }
    const energyWh =
      args.meterStopWh !== undefined
        ? Math.max(0, args.meterStopWh - (session.meterStartWh ?? 0))
        : session.energyWh;
    const amounts = computeAmounts(session.tariffSnapshot, energyWh, 0);
    await ctx.db.patch(session._id, {
      status: "completed",
      meterStopWh: args.meterStopWh,
      energyWh,
      stoppedAt: Date.now(),
      stopReason: args.reason ?? "Remote",
      amounts,
    });
    const connector = await ctx.db.get(session.connectorId);
    if (connector && connector.currentSessionId === session._id) {
      await ctx.db.patch(connector._id, { currentSessionId: undefined });
    }
    return {
      accepted: true,
      sessionId: session._id,
      amounts,
      paymentMode: session.paymentMode,
      driverEmail: session.driverEmail ?? null,
    };
  },
});

/** Driver (or admin) pressed Stop. */
export const requestStop = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status === "charging" && session.ocppTransactionId !== undefined) {
      await ctx.db.patch(session._id, { status: "stopping" });
      await enqueueCommand(ctx, {
        chargerId: session.chargerId,
        ocppIdentity: (await ctx.db.get(session.chargerId))!.ocppIdentity,
        action: "RemoteStopTransaction",
        payload: { transactionId: session.ocppTransactionId },
        sessionId: session._id,
      });
    } else if (session.status === "authorized" || session.status === "pending_payment") {
      await ctx.db.patch(session._id, { status: "expired", stopReason: "CanceledByDriver" });
      const connector = await ctx.db.get(session.connectorId);
      if (connector && connector.currentSessionId === session._id) {
        await ctx.db.patch(connector._id, { currentSessionId: undefined });
      }
    }
    return null;
  },
});

/** Live view for the driver page (reactive: kWh climbs as MeterValues arrive). */
export const getLive = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    const costMinor =
      session.amounts?.totalMinor ??
      runningCostMinor(session.tariffSnapshot, session.energyWh);
    const payment = session.paymentId ? await ctx.db.get(session.paymentId) : null;
    return {
      ...session,
      costMinor,
      payment: payment
        ? {
            provider: payment.provider,
            status: payment.status,
            capturedMinor: payment.capturedMinor ?? null,
          }
        : null,
    };
  },
});
