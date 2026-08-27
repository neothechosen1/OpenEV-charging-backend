/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { computeAmounts } from "./lib/pricing";

const modules = import.meta.glob("./**/*.ts");

const SNAPSHOT = {
  currency: "COP",
  pricePerKwhMinor: 1200,
  sessionFeeMinor: 2000,
  idleFeePerMinuteMinor: 200,
  idleGraceMinutes: 10,
  electricityCostPerKwhMinor: 800,
  platformFeeBps: 1000,
};

describe("pricing engine", () => {
  test("computes energy, fees, platform split", () => {
    const amounts = computeAmounts(SNAPSHOT, 30_000, 0);
    expect(amounts.energyMinor).toBe(36_000); // 30 kWh * 1200
    expect(amounts.totalMinor).toBe(38_000); // + 2000 session fee
    expect(amounts.platformFeeMinor).toBe(3_800); // 10%
    expect(amounts.operatorNetMinor).toBe(34_200);
    expect(amounts.electricityCostMinor).toBe(24_000); // 30 kWh * 800
  });

  test("idle billing respects the grace period", () => {
    expect(computeAmounts(SNAPSHOT, 0, 10).idleMinor).toBe(0);
    expect(computeAmounts(SNAPSHOT, 0, 25).idleMinor).toBe(3_000); // 15 min * 200
  });
});

describe("charging session lifecycle", () => {
  async function boot(t: ReturnType<typeof convexTest>) {
    const seeded = await t.mutation(api.setup.seedDemo, {});
    const bootResult = await t.mutation(api.chargers.boot, {
      ocppIdentity: "SIM-001",
      vendor: "OpenEV",
      model: "Simulator",
    });
    expect(bootResult.accepted).toBe(true);
    return seeded.qrToken!;
  }

  test("full flow: QR checkout → start → meter → stop → amounts", async () => {
    const t = convexTest(schema, modules);
    const qrToken = await boot(t);

    const info = await t.mutation(api.sessions.createFromQr, {
      qrToken,
      paymentMode: "demo",
    });
    await t.mutation(api.sessions.markAuthorized, { sessionId: info.sessionId });

    // Payment authorization queued a RemoteStartTransaction for the gateway.
    const commands = await t.mutation(api.commands.takePending, {
      ocppIdentity: "SIM-001",
    });
    expect(commands).toHaveLength(1);
    expect(commands[0].action).toBe("RemoteStartTransaction");
    const idTag = (commands[0].payload as { idTag: string }).idTag;

    const start = await t.mutation(api.sessions.startTransaction, {
      ocppIdentity: "SIM-001",
      connectorNumber: 1,
      idTag,
      meterStartWh: 1_000,
    });
    expect(start.accepted).toBe(true);

    await t.mutation(api.sessions.meterValues, {
      ocppIdentity: "SIM-001",
      ocppTransactionId: start.transactionId,
      reading: { energyWh: 3_500, powerW: 7_000 },
    });
    const live = await t.query(api.sessions.getLive, { sessionId: info.sessionId });
    expect(live?.energyWh).toBe(2_500);
    expect(live?.status).toBe("charging");

    const stop = await t.mutation(api.sessions.stopTransaction, {
      ocppIdentity: "SIM-001",
      ocppTransactionId: start.transactionId,
      meterStopWh: 6_000,
      reason: "Remote",
    });
    // 5 kWh * 1200 + 2000 session fee
    expect(stop.amounts?.totalMinor).toBe(8_000);
    expect(stop.amounts?.platformFeeMinor).toBe(800);

    const done = await t.query(api.sessions.getLive, { sessionId: info.sessionId });
    expect(done?.status).toBe("completed");
    expect(done?.energyWh).toBe(5_000);
  });

  test("duplicate StopTransaction is idempotent", async () => {
    const t = convexTest(schema, modules);
    const qrToken = await boot(t);
    const info = await t.mutation(api.sessions.createFromQr, {
      qrToken,
      paymentMode: "demo",
    });
    await t.mutation(api.sessions.markAuthorized, { sessionId: info.sessionId });
    const [cmd] = await t.mutation(api.commands.takePending, {
      ocppIdentity: "SIM-001",
    });
    const start = await t.mutation(api.sessions.startTransaction, {
      ocppIdentity: "SIM-001",
      connectorNumber: 1,
      idTag: (cmd.payload as { idTag: string }).idTag,
      meterStartWh: 0,
    });
    const stopArgs = {
      ocppIdentity: "SIM-001",
      ocppTransactionId: start.transactionId,
      meterStopWh: 2_000,
      reason: "Remote",
    };
    const first = await t.mutation(api.sessions.stopTransaction, stopArgs);
    const second = await t.mutation(api.sessions.stopTransaction, stopArgs);
    expect(second.amounts).toEqual(first.amounts);
    expect(second.accepted).toBe(true);
  });

  test("duplicate StartTransaction retry returns the same transactionId", async () => {
    const t = convexTest(schema, modules);
    const qrToken = await boot(t);
    const info = await t.mutation(api.sessions.createFromQr, {
      qrToken,
      paymentMode: "demo",
    });
    await t.mutation(api.sessions.markAuthorized, { sessionId: info.sessionId });
    const [cmd] = await t.mutation(api.commands.takePending, {
      ocppIdentity: "SIM-001",
    });
    const args = {
      ocppIdentity: "SIM-001",
      connectorNumber: 1,
      idTag: (cmd.payload as { idTag: string }).idTag,
      meterStartWh: 500,
    };
    const first = await t.mutation(api.sessions.startTransaction, args);
    const retry = await t.mutation(api.sessions.startTransaction, args);
    expect(retry.transactionId).toBe(first.transactionId);
  });

  test("overrun guard auto-stops before exceeding the payment hold", async () => {
    const t = convexTest(schema, modules);
    const qrToken = await boot(t);
    const info = await t.mutation(api.sessions.createFromQr, {
      qrToken,
      paymentMode: "hold",
      authorizedMinor: 3_000,
    });
    await t.mutation(api.sessions.markAuthorized, { sessionId: info.sessionId });
    const [cmd] = await t.mutation(api.commands.takePending, {
      ocppIdentity: "SIM-001",
    });
    const start = await t.mutation(api.sessions.startTransaction, {
      ocppIdentity: "SIM-001",
      connectorNumber: 1,
      idTag: (cmd.payload as { idTag: string }).idTag,
      meterStartWh: 0,
    });
    // 5 kWh consumed → cost 8,000 ≥ 95% of the 3,000 hold → must auto-stop.
    const result = await t.mutation(api.sessions.meterValues, {
      ocppIdentity: "SIM-001",
      ocppTransactionId: start.transactionId,
      reading: { energyWh: 5_000, powerW: 7_000 },
    });
    expect(result.stopRequested).toBe(true);
    const live = await t.query(api.sessions.getLive, { sessionId: info.sessionId });
    expect(live?.status).toBe("stopping");
    const pending = await t.mutation(api.commands.takePending, {
      ocppIdentity: "SIM-001",
    });
    expect(pending.some((c) => c.action === "RemoteStopTransaction")).toBe(true);
  });

  test("unknown charger identity is rejected at boot", async () => {
    const t = convexTest(schema, modules);
    const result = await t.mutation(api.chargers.boot, { ocppIdentity: "EVIL-999" });
    expect(result.accepted).toBe(false);
  });
});
