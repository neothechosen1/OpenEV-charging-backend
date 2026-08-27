import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// All money fields are INTEGER minor units of the row's `currency` (never floats).
// Pricing is frozen into `sessions.tariffSnapshot` at session start so historical
// receipts never change when a tariff is edited.

export const tariffSnapshotValidator = v.object({
  currency: v.string(),
  pricePerKwhMinor: v.number(),
  sessionFeeMinor: v.number(),
  idleFeePerMinuteMinor: v.number(),
  idleGraceMinutes: v.number(),
  // property's electricity cost at session start, for margin reporting
  electricityCostPerKwhMinor: v.number(),
  platformFeeBps: v.number(),
});

export const sessionAmountsValidator = v.object({
  energyMinor: v.number(),
  sessionFeeMinor: v.number(),
  idleMinor: v.number(),
  totalMinor: v.number(),
  platformFeeMinor: v.number(),
  electricityCostMinor: v.number(),
  operatorNetMinor: v.number(),
});

export default defineSchema({
  organizations: defineTable({
    name: v.string(),
    slug: v.string(),
    country: v.string(),
    timezone: v.string(),
    currency: v.string(),
    platformFeeBps: v.number(), // 1000 = 10%
    status: v.union(v.literal("active"), v.literal("disabled")),
  }).index("by_slug", ["slug"]),

  properties: defineTable({
    organizationId: v.id("organizations"),
    name: v.string(),
    address: v.string(),
    city: v.string(),
    country: v.string(),
    timezone: v.string(),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    access: v.union(v.literal("private"), v.literal("visitors"), v.literal("public")),
    electricityCostPerKwhMinor: v.number(),
    currency: v.string(),
  }).index("by_organizationId", ["organizationId"]),

  chargers: defineTable({
    organizationId: v.id("organizations"),
    propertyId: v.id("properties"),
    name: v.string(),
    // identity segment of wss://gateway/ocpp/{identity}
    ocppIdentity: v.string(),
    vendor: v.optional(v.string()),
    model: v.optional(v.string()),
    serialNumber: v.optional(v.string()),
    firmwareVersion: v.optional(v.string()),
    protocol: v.literal("ocpp1.6j"),
    status: v.union(v.literal("pending"), v.literal("active"), v.literal("disabled")),
    // per-model firmware workarounds, e.g. { meterValueUnit: "kWh" }
    quirks: v.optional(v.record(v.string(), v.string())),
  })
    .index("by_ocppIdentity", ["ocppIdentity"])
    .index("by_propertyId", ["propertyId"])
    .index("by_organizationId", ["organizationId"]),

  // High-churn connection state, kept off the stable charger doc.
  chargerConnections: defineTable({
    chargerId: v.id("chargers"),
    online: v.boolean(),
    lastHeartbeatAt: v.number(),
    lastBootAt: v.optional(v.number()),
  }).index("by_chargerId", ["chargerId"]),

  connectors: defineTable({
    organizationId: v.id("organizations"),
    propertyId: v.id("properties"),
    chargerId: v.id("chargers"),
    connectorNumber: v.number(), // OCPP connectorId, 1-based
    connectorType: v.string(), // "J1772" | "Type2" | "NACS" | "CCS1" | "CCS2" | "CHAdeMO" | ...
    maxPowerKw: v.number(),
    ocppStatus: v.string(), // Available | Preparing | Charging | Finishing | Faulted | ...
    qrToken: v.string(), // opaque token used in the printed QR URL
    currentSessionId: v.optional(v.id("sessions")),
    tariffId: v.optional(v.id("tariffs")),
  })
    .index("by_chargerId", ["chargerId"])
    .index("by_qrToken", ["qrToken"]),

  tariffs: defineTable({
    organizationId: v.id("organizations"),
    propertyId: v.optional(v.id("properties")),
    name: v.string(),
    currency: v.string(),
    pricePerKwhMinor: v.number(),
    sessionFeeMinor: v.number(),
    idleFeePerMinuteMinor: v.number(),
    idleGraceMinutes: v.number(),
    active: v.boolean(),
  }).index("by_organizationId", ["organizationId"]),

  sessions: defineTable({
    organizationId: v.id("organizations"),
    propertyId: v.id("properties"),
    chargerId: v.id("chargers"),
    connectorId: v.id("connectors"),
    status: v.union(
      v.literal("pending_payment"),
      v.literal("authorized"), // payment ok, RemoteStart queued
      v.literal("charging"),
      v.literal("stopping"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("expired"),
    ),
    driverEmail: v.optional(v.string()),
    paymentId: v.optional(v.id("payments")),
    // "hold" = authorize now, capture actual at the end (Stripe).
    // "prepaid" = fixed package paid upfront, auto-stop at value (Wompi PSE/Nequi).
    // "demo" = no real payment (simulator demos).
    paymentMode: v.union(v.literal("hold"), v.literal("prepaid"), v.literal("demo")),
    authorizedMinor: v.number(), // max we may capture / prepaid package value
    idTag: v.optional(v.string()), // OCPP idTag (<=20 chars) used for RemoteStart
    ocppTransactionId: v.optional(v.number()),
    tariffSnapshot: tariffSnapshotValidator,
    meterStartWh: v.optional(v.number()),
    meterStopWh: v.optional(v.number()),
    energyWh: v.number(), // running energy delivered
    lastPowerW: v.optional(v.number()),
    lastMeterAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    stoppedAt: v.optional(v.number()),
    stopReason: v.optional(v.string()),
    amounts: v.optional(sessionAmountsValidator),
  })
    .index("by_connectorId", ["connectorId"])
    .index("by_chargerId", ["chargerId"])
    .index("by_ocppTransactionId", ["ocppTransactionId"])
    .index("by_organizationId_and_status", ["organizationId", "status"]),

  meterSamples: defineTable({
    sessionId: v.id("sessions"),
    at: v.number(),
    energyWh: v.number(),
    powerW: v.optional(v.number()),
    voltage: v.optional(v.number()),
    amperage: v.optional(v.number()),
    soc: v.optional(v.number()),
  }).index("by_sessionId", ["sessionId"]),

  payments: defineTable({
    organizationId: v.id("organizations"),
    sessionId: v.optional(v.id("sessions")),
    provider: v.union(
      v.literal("stripe"),
      v.literal("wompi"),
      v.literal("mercadopago"),
      v.literal("demo"),
    ),
    mode: v.union(v.literal("hold"), v.literal("prepaid")),
    providerRef: v.optional(v.string()), // e.g. Stripe PaymentIntent id
    status: v.union(
      v.literal("requires_payment"),
      v.literal("authorized"),
      v.literal("captured"),
      v.literal("canceled"),
      v.literal("refunded"),
      v.literal("failed"),
    ),
    currency: v.string(),
    authorizedMinor: v.number(),
    capturedMinor: v.optional(v.number()),
    refundedMinor: v.optional(v.number()),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_providerRef", ["providerRef"]),

  // Remote commands queued for the gateway (RemoteStart/RemoteStop/...).
  // The gateway receives them piggybacked on every OCPP event response and
  // via a short poll while chargers are connected.
  commands: defineTable({
    chargerId: v.id("chargers"),
    ocppIdentity: v.string(),
    action: v.string(),
    payload: v.any(),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("accepted"),
      v.literal("rejected"),
      v.literal("failed"),
    ),
    sessionId: v.optional(v.id("sessions")),
    resultPayload: v.optional(v.any()),
  })
    .index("by_status", ["status"])
    .index("by_ocppIdentity_and_status", ["ocppIdentity", "status"]),

  // Dedup for OCPP retries and payment webhook redeliveries (idempotency).
  processedEvents: defineTable({
    key: v.string(),
    at: v.number(),
  }).index("by_key", ["key"]),

  auditLogs: defineTable({
    organizationId: v.optional(v.id("organizations")),
    kind: v.string(),
    actor: v.string(),
    data: v.optional(v.any()),
  }).index("by_organizationId", ["organizationId"]),

  counters: defineTable({
    key: v.string(),
    value: v.number(),
  }).index("by_key", ["key"]),
});
