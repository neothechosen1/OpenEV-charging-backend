import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { components } from "./_generated/api";
import { parseMeterValues } from "@openev/charging/ocpp";

const http = httpRouter();

// All OCPP traffic from the gateway lands here. The gateway is dumb transport:
// it forwards raw OCPP payloads; this endpoint answers with the OCPP reply plus
// any pending remote commands for that charger (piggybacked delivery).
http.route({
  path: "/gateway/event",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = req.headers.get("x-gateway-secret");
    if (!secret || secret !== process.env.GATEWAY_SHARED_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }
    const { identity, type, payload } = (await req.json()) as {
      identity: string;
      type: string;
      payload: Record<string, unknown>;
    };
    const now = new Date().toISOString();
    let reply: Record<string, unknown> = {};
    let known = true;

    switch (type) {
      case "BootNotification": {
        const result = await ctx.runMutation(components.evCharging.chargers.boot, {
          ocppIdentity: identity,
          vendor: payload.chargePointVendor as string | undefined,
          model: payload.chargePointModel as string | undefined,
          serialNumber: payload.chargePointSerialNumber as string | undefined,
          firmwareVersion: payload.firmwareVersion as string | undefined,
        });
        known = result.accepted;
        reply = {
          status: result.accepted ? "Accepted" : "Rejected",
          currentTime: now,
          interval: result.intervalSec,
        };
        break;
      }
      case "Heartbeat": {
        await ctx.runMutation(components.evCharging.chargers.heartbeat, {
          ocppIdentity: identity,
        });
        reply = { currentTime: now };
        break;
      }
      case "StatusNotification": {
        await ctx.runMutation(components.evCharging.chargers.statusNotification, {
          ocppIdentity: identity,
          connectorNumber: (payload.connectorId as number) ?? 0,
          ocppStatus: (payload.status as string) ?? "Unknown",
          errorCode: payload.errorCode as string | undefined,
        });
        reply = {};
        break;
      }
      case "Authorize": {
        // Payment is gated before RemoteStart, so idTags we issued are valid.
        reply = { idTagInfo: { status: "Accepted" } };
        break;
      }
      case "StartTransaction": {
        const result = await ctx.runMutation(
          components.evCharging.sessions.startTransaction,
          {
            ocppIdentity: identity,
            connectorNumber: (payload.connectorId as number) ?? 1,
            idTag: (payload.idTag as string) ?? "",
            meterStartWh: (payload.meterStart as number) ?? 0,
          },
        );
        reply = {
          transactionId: result.transactionId,
          idTagInfo: { status: result.accepted ? "Accepted" : "Invalid" },
        };
        break;
      }
      case "MeterValues": {
        const reading = parseMeterValues(payload as Parameters<typeof parseMeterValues>[0]);
        await ctx.runMutation(components.evCharging.sessions.meterValues, {
          ocppIdentity: identity,
          ocppTransactionId: payload.transactionId as number | undefined,
          reading,
        });
        reply = {};
        break;
      }
      case "StopTransaction": {
        await ctx.runMutation(components.evCharging.sessions.stopTransaction, {
          ocppIdentity: identity,
          ocppTransactionId: (payload.transactionId as number) ?? 0,
          meterStopWh: payload.meterStop as number | undefined,
          reason: payload.reason as string | undefined,
        });
        // Phase 2: trigger payment capture (Stripe) / reconciliation here.
        reply = { idTagInfo: { status: "Accepted" } };
        break;
      }
      case "DataTransfer": {
        reply = { status: "Accepted" };
        break;
      }
      case "__disconnected": {
        await ctx.runMutation(components.evCharging.chargers.disconnected, {
          ocppIdentity: identity,
        });
        return Response.json({ reply: {}, commands: [] });
      }
      case "__poll": {
        reply = {};
        break;
      }
      default: {
        reply = {};
        break;
      }
    }

    const commands = known
      ? await ctx.runMutation(components.evCharging.commands.takePending, {
          ocppIdentity: identity,
        })
      : [];
    return Response.json({ reply, commands });
  }),
});

// Gateway reports the charger's answer to a remote command.
http.route({
  path: "/gateway/command-result",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const secret = req.headers.get("x-gateway-secret");
    if (!secret || secret !== process.env.GATEWAY_SHARED_SECRET) {
      return new Response("unauthorized", { status: 401 });
    }
    const { commandId, ok, resultPayload } = (await req.json()) as {
      commandId: string;
      ok: boolean;
      resultPayload?: unknown;
    };
    await ctx.runMutation(components.evCharging.commands.markResult, {
      commandId,
      ok,
      resultPayload,
    });
    return Response.json({ ok: true });
  }),
});

export default http;
