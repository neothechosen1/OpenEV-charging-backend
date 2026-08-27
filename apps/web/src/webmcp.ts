// WebMCP: expose this site's actions as structured tools that in-browser AI
// agents (ChatGPT's browser, Chrome with WebMCP enabled) can call directly.
// The human sees everything happen live because the UI navigates along.

import type { ConvexReactClient } from "convex/react";
import { api } from "../convex/_generated/api";

interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
}

interface WebMcpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: never) => Promise<ToolResult>;
}

interface ModelContext {
  registerTool?: (tool: WebMcpTool) => unknown;
  provideContext?: (context: { tools: WebMcpTool[] }) => unknown;
}

declare global {
  interface Navigator {
    modelContext?: ModelContext;
  }
}

const text = (value: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});

const go = (path: string) => {
  window.location.hash = path;
};

let registered = false;

/** True once tools are registered with an agent-capable browser. */
export function webMcpActive(): boolean {
  return registered;
}

/**
 * Register on load, and keep retrying briefly — agent browsers may inject
 * `navigator.modelContext` after our script runs.
 */
export function registerWebMcpTools(convex: ConvexReactClient): void {
  let attempts = 0;
  const tryRegister = () => {
    if (registered) return;
    const modelContext = navigator.modelContext;
    if (!modelContext) {
      if (++attempts < 20) setTimeout(tryRegister, 500);
      return;
    }
    registered = true;
    const tools = buildTools(convex);
    if (typeof modelContext.registerTool === "function") {
      for (const tool of tools) modelContext.registerTool(tool);
    } else if (typeof modelContext.provideContext === "function") {
      modelContext.provideContext({ tools });
    }
  };
  tryRegister();
}

/** The site's agent-facing surface. Also rendered at /#/tools as a playground. */
export function buildTools(convex: ConvexReactClient): WebMcpTool[] {
  return [
    {
      name: "list_stations",
      description:
        "List public EV charging stations with their chargers, connector types, live availability, and prices per kWh. Each connector includes a qrToken used to start charging.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      execute: async () => text(await convex.query(api.charging.publicStations, {})),
    },
    {
      name: "get_charger",
      description:
        "Get live details for one charging connector by its qrToken: availability, connector type, max power, and pricing.",
      inputSchema: {
        type: "object",
        properties: { qrToken: { type: "string", description: "Connector QR token" } },
        required: ["qrToken"],
        additionalProperties: false,
      },
      execute: async (input: { qrToken: string }) => {
        go(`/c/${input.qrToken}`);
        return text(await convex.query(api.charging.previewByQr, { qrToken: input.qrToken }));
      },
    },
    {
      name: "start_charging",
      description:
        "Start an EV charging session on a connector (by qrToken) in demo payment mode. Returns the sessionId to monitor or stop the session. The page navigates to the live session view.",
      inputSchema: {
        type: "object",
        properties: {
          qrToken: { type: "string", description: "Connector QR token" },
          driverEmail: { type: "string", description: "Optional email for the receipt" },
        },
        required: ["qrToken"],
        additionalProperties: false,
      },
      execute: async (input: { qrToken: string; driverEmail?: string }) => {
        const info = await convex.mutation(api.charging.demoCheckout, {
          qrToken: input.qrToken,
          driverEmail: input.driverEmail,
        });
        go(`/s/${info.sessionId}`);
        return text({
          sessionId: info.sessionId,
          charger: info.chargerName,
          property: info.propertyName,
          paymentMode: "demo",
          note: "Charging starts within a few seconds. Use get_session to watch energy and cost.",
        });
      },
    },
    {
      name: "get_session",
      description:
        "Get the live state of a charging session: status, energy delivered (Wh), current power (W), and running cost in minor currency units.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" } },
        required: ["sessionId"],
        additionalProperties: false,
      },
      execute: async (input: { sessionId: string }) => {
        const s = await convex.query(api.charging.liveSession, { sessionId: input.sessionId });
        if (!s) return text({ error: "session not found" });
        return text({
          status: s.status,
          energyWh: s.energyWh,
          powerW: s.lastPowerW ?? null,
          costMinor: s.costMinor,
          currency: s.tariffSnapshot.currency,
          startedAt: s.startedAt ?? null,
        });
      },
    },
    {
      name: "stop_charging",
      description: "Stop an active charging session by sessionId.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" } },
        required: ["sessionId"],
        additionalProperties: false,
      },
      execute: async (input: { sessionId: string }) => {
        await convex.mutation(api.charging.stopSession, { sessionId: input.sessionId });
        go(`/s/${input.sessionId}`);
        return text({ ok: true, note: "Stop requested. Use get_receipt once completed." });
      },
    },
    {
      name: "get_receipt",
      description:
        "Get the final receipt for a completed charging session: energy, fees, and total charged.",
      inputSchema: {
        type: "object",
        properties: { sessionId: { type: "string" } },
        required: ["sessionId"],
        additionalProperties: false,
      },
      execute: async (input: { sessionId: string }) => {
        const s = await convex.query(api.charging.liveSession, { sessionId: input.sessionId });
        if (!s) return text({ error: "session not found" });
        return text({
          status: s.status,
          energyWh: s.energyWh,
          currency: s.tariffSnapshot.currency,
          amounts: s.amounts ?? null,
          paymentMode: s.paymentMode,
        });
      },
    },
  ];
}
