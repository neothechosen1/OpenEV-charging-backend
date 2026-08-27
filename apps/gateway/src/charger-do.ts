import type { Env } from "./index";

// OCPP-J frame types
const CALL = 2;
const CALLRESULT = 3;
const CALLERROR = 4;

// While a charger is connected we poll Convex for queued remote commands.
// Commands are also piggybacked on every OCPP event response, so this poll
// only bounds worst-case latency when the charger is silent. Demo-friendly;
// production tuning can raise it.
const POLL_MS = 3000;

/**
 * One Durable Object per charger identity. Uses the WebSocket hibernation API
 * so an idle connected charger costs (almost) nothing. In-flight command ids
 * are kept in DO storage so they survive hibernation.
 */
export class ChargerDO {
  constructor(
    private state: DurableObjectState,
    private env: Env,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const identity = request.headers.get("x-ocpp-identity");
    if (!identity) return new Response("missing identity", { status: 400 });

    // OCPP 1.6J requires the "ocpp1.6" WebSocket subprotocol.
    const protocols = (request.headers.get("Sec-WebSocket-Protocol") ?? "")
      .split(",")
      .map((p) => p.trim());
    if (!protocols.includes("ocpp1.6")) {
      return new Response("unsupported subprotocol", { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    // Tag with the identity so we can recover it after hibernation.
    this.state.acceptWebSocket(server, [identity]);
    await this.state.storage.put("identity", identity);
    await this.state.storage.setAlarm(Date.now() + POLL_MS);

    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: { "Sec-WebSocket-Protocol": "ocpp1.6" },
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const identity = this.state.getTags(ws)[0];
    let frame: unknown[];
    try {
      frame = JSON.parse(typeof message === "string" ? message : new TextDecoder().decode(message));
      if (!Array.isArray(frame)) throw new Error("not a frame");
    } catch {
      return; // ignore garbage
    }

    if (frame[0] === CALL) {
      const [, msgId, action, payload] = frame as [number, string, string, unknown];
      try {
        const { reply, commands } = await this.forwardEvent(identity, action, payload ?? {});
        ws.send(JSON.stringify([CALLRESULT, msgId, reply]));
        await this.deliverCommands(ws, commands);
      } catch (err) {
        ws.send(
          JSON.stringify([CALLERROR, msgId, "InternalError", String(err), {}]),
        );
      }
      return;
    }

    if (frame[0] === CALLRESULT || frame[0] === CALLERROR) {
      // Charger answered one of our remote commands.
      const msgId = frame[1] as string;
      const commandId = await this.state.storage.get<string>(`cmd:${msgId}`);
      if (!commandId) return;
      await this.state.storage.delete(`cmd:${msgId}`);
      const ok =
        frame[0] === CALLRESULT &&
        ((frame[2] as { status?: string })?.status ?? "Accepted") === "Accepted";
      await this.postJson("/gateway/command-result", {
        identity,
        commandId,
        ok,
        resultPayload: frame[2] ?? null,
      });
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const identity = this.state.getTags(ws)[0];
    if (this.state.getWebSockets().length === 0) {
      await this.state.storage.deleteAlarm();
      await this.forwardEvent(identity, "__disconnected", {}).catch(() => {});
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  /** Poll for queued remote commands while the charger is connected. */
  async alarm(): Promise<void> {
    const sockets = this.state.getWebSockets();
    if (sockets.length === 0) return;
    const identity =
      this.state.getTags(sockets[0])[0] ??
      (await this.state.storage.get<string>("identity"));
    if (identity) {
      try {
        const { commands } = await this.forwardEvent(identity, "__poll", {});
        await this.deliverCommands(sockets[0], commands);
      } catch {
        // Convex temporarily unreachable — retry on next alarm.
      }
    }
    await this.state.storage.setAlarm(Date.now() + POLL_MS);
  }

  private async deliverCommands(
    ws: WebSocket,
    commands: Array<{ commandId: string; action: string; payload: unknown }>,
  ): Promise<void> {
    for (const cmd of commands) {
      const msgId = crypto.randomUUID();
      await this.state.storage.put(`cmd:${msgId}`, cmd.commandId);
      ws.send(JSON.stringify([CALL, msgId, cmd.action, cmd.payload ?? {}]));
    }
  }

  private async forwardEvent(
    identity: string,
    type: string,
    payload: unknown,
  ): Promise<{
    reply: Record<string, unknown>;
    commands: Array<{ commandId: string; action: string; payload: unknown }>;
  }> {
    const res = await this.postJson("/gateway/event", { identity, type, payload });
    if (!res.ok) throw new Error(`convex ${res.status}`);
    return (await res.json()) as {
      reply: Record<string, unknown>;
      commands: Array<{ commandId: string; action: string; payload: unknown }>;
    };
  }

  private postJson(path: string, body: unknown): Promise<Response> {
    return fetch(`${this.env.CONVEX_HTTP_URL}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gateway-secret": this.env.GATEWAY_SHARED_SECRET,
      },
      body: JSON.stringify(body),
    });
  }
}
