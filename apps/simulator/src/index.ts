// OpenEV charger simulator — a fake OCPP 1.6J charger for demos and tests.
// No hardware needed: boots, heartbeats, accepts RemoteStart/RemoteStop and
// streams climbing meter values like a real charger would.
//
//   IDENTITY=SIM-001 GATEWAY_URL=ws://localhost:8787/ocpp pnpm simulate

import { RPCClient } from "ocpp-rpc";

const IDENTITY = process.env.IDENTITY ?? "SIM-001";
const GATEWAY_URL = process.env.GATEWAY_URL ?? "ws://localhost:8787/ocpp";
const POWER_W = Number(process.env.POWER_KW ?? "7") * 1000;
const METER_INTERVAL_MS = 5000;

const log = (msg: string) => console.log(`[${IDENTITY}] ${msg}`);

// Lifetime meter counter (Wh) — real chargers report cumulative energy.
let meterWh = 1_000_000;
let transactionId: number | null = null;
let meterTimer: ReturnType<typeof setInterval> | null = null;
let stopping = false;

// ocpp-rpc's published typings mark every option as required; the runtime
// applies defaults, so a partial options object is fine.
const client = new RPCClient({
  endpoint: GATEWAY_URL,
  identity: IDENTITY,
  protocols: ["ocpp1.6"],
  strictMode: true,
  reconnect: true,
} as ConstructorParameters<typeof RPCClient>[0]);

async function sendStatus(status: string) {
  await client.call("StatusNotification", {
    connectorId: 1,
    errorCode: "NoError",
    status,
    timestamp: new Date().toISOString(),
  });
  log(`status → ${status}`);
}

async function sendMeterValues() {
  if (transactionId === null) return;
  meterWh += (POWER_W * METER_INTERVAL_MS) / 3_600_000;
  await client.call("MeterValues", {
    connectorId: 1,
    transactionId,
    meterValue: [
      {
        timestamp: new Date().toISOString(),
        sampledValue: [
          {
            value: String(Math.round(meterWh)),
            measurand: "Energy.Active.Import.Register",
            unit: "Wh",
          },
          {
            value: String(POWER_W),
            measurand: "Power.Active.Import",
            unit: "W",
          },
        ],
      },
    ],
  });
  log(`meter ${(meterWh / 1000).toFixed(3)} kWh @ ${POWER_W / 1000} kW`);
}

async function startCharging(idTag: string) {
  await sendStatus("Preparing");
  const start = (await client.call("StartTransaction", {
    connectorId: 1,
    idTag,
    meterStart: Math.round(meterWh),
    timestamp: new Date().toISOString(),
  })) as { transactionId: number; idTagInfo: { status: string } };
  if (start.idTagInfo.status !== "Accepted") {
    log(`StartTransaction rejected (${start.idTagInfo.status})`);
    await sendStatus("Available");
    return;
  }
  transactionId = start.transactionId;
  log(`charging — transactionId ${transactionId}`);
  await sendStatus("Charging");
  meterTimer = setInterval(() => {
    void sendMeterValues().catch((err) => log(`meter error: ${err}`));
  }, METER_INTERVAL_MS);
}

async function stopCharging(reason: string) {
  if (transactionId === null || stopping) return;
  stopping = true;
  if (meterTimer) clearInterval(meterTimer);
  meterTimer = null;
  const txId = transactionId;
  transactionId = null;
  await client.call("StopTransaction", {
    transactionId: txId,
    meterStop: Math.round(meterWh),
    timestamp: new Date().toISOString(),
    reason,
  });
  log(`stopped (${reason})`);
  await sendStatus("Finishing");
  await sendStatus("Available");
  stopping = false;
}

client.handle("RemoteStartTransaction", async ({ params }) => {
  const { idTag } = params as { idTag: string; connectorId?: number };
  if (transactionId !== null) return { status: "Rejected" };
  log(`RemoteStartTransaction (idTag ${idTag})`);
  setTimeout(() => void startCharging(idTag).catch((err) => log(`start error: ${err}`)), 100);
  return { status: "Accepted" };
});

client.handle("RemoteStopTransaction", async ({ params }) => {
  const { transactionId: txId } = params as { transactionId: number };
  if (transactionId === null || txId !== transactionId) return { status: "Rejected" };
  log("RemoteStopTransaction");
  setTimeout(() => void stopCharging("Remote").catch((err) => log(`stop error: ${err}`)), 100);
  return { status: "Accepted" };
});

client.handle("Reset", async () => {
  log("Reset requested");
  setTimeout(() => void stopCharging("Reboot").catch(() => {}), 100);
  return { status: "Accepted" };
});

// Default: politely reject anything we don't simulate yet.
client.handle(async ({ method }) => {
  log(`unhandled action ${method ?? "?"}`);
  return { status: "NotImplemented" };
});

async function main() {
  log(`connecting to ${GATEWAY_URL}/${IDENTITY} ...`);
  await client.connect();
  const boot = (await client.call("BootNotification", {
    chargePointVendor: "OpenEV",
    chargePointModel: "Simulator",
    chargePointSerialNumber: "SIM-0001",
    firmwareVersion: "0.1.0",
  })) as { status: string; interval: number; currentTime: string };
  log(`boot → ${boot.status} (heartbeat every ${boot.interval}s)`);
  if (boot.status !== "Accepted") {
    log("not accepted — register this identity in the backend first");
    process.exit(1);
  }
  setInterval(() => {
    void client.call("Heartbeat", {}).catch((err) => log(`heartbeat error: ${err}`));
  }, boot.interval * 1000);
  await sendStatus("Available");
  log("ready — waiting for RemoteStartTransaction");
}

process.on("SIGINT", async () => {
  log("shutting down");
  try {
    await stopCharging("PowerLoss");
    await client.close();
  } finally {
    process.exit(0);
  }
});

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
