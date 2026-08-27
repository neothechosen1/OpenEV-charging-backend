// OpenEV OCPP gateway — thin transport layer on Cloudflare Workers.
// Each charger identity maps to one Durable Object that holds its WebSocket.
// All business logic lives in Convex; this only moves OCPP frames.

export { ChargerDO } from "./charger-do";

export interface Env {
  CHARGER: DurableObjectNamespace;
  CONVEX_HTTP_URL: string;
  GATEWAY_SHARED_SECRET: string;
}

const IDENTITY_RE = /^[A-Za-z0-9*_=:+|@.-]{1,48}$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/ocpp\/(.+)$/);
    if (!match) return new Response("OpenEV OCPP gateway", { status: 200 });
    const identity = decodeURIComponent(match[1]);
    if (!IDENTITY_RE.test(identity)) {
      return new Response("invalid charge point identity", { status: 400 });
    }
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const stub = env.CHARGER.get(env.CHARGER.idFromName(identity));
    const headers = new Headers(request.headers);
    headers.set("x-ocpp-identity", identity);
    return stub.fetch(new Request(request.url, { headers, method: request.method }));
  },
};
