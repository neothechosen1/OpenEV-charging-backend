# WebMCP demo video — shot-by-shot script (< 3:00)

**Deadline: submit on [Devpost](https://webmcp.devpost.com/) before Sep 3, 1:00 PM PDT.**
Requirements: live URL + public repo + YouTube video under 3 minutes **with audio**.

## Prep (before recording)

1. `cd apps/simulator && GATEWAY_URL=wss://openev-gateway.throbbing-snowflake-0060.workers.dev/ocpp pnpm start` — charger shows **Online**.
2. Open https://laudable-shrimp-94.convex.site in a browser with WebMCP enabled (ChatGPT's browser, or Chrome with the WebMCP flag/origin trial). **Verify the agent actually sees the tools before recording** — ask it "what tools does this page expose?"
3. Have `/#/admin` open in a second tab. Clean screen, hide bookmarks.

## Script

| Time | Screen | Say (roughly) |
|---|---|---|
| 0:00 | Photo/still of a cheap wallbox charger + price tag "$400" | "This is a four-hundred-dollar EV charger. Commercial charging networks want thousands per charger plus a cut, to make it sellable." |
| 0:12 | The live site homepage | "This is OpenEV — an open-source backend that turns any standards-based charger into a paid charging station. This one is live in Cali, Colombia." |
| 0:25 | Admin dashboard tab | "The charger is talking real OCPP over a WebSocket at the edge — heartbeats, meter readings, remote commands. Watch the agent part." |
| 0:35 | Agent sidebar/prompt on the site | Type: **"Find me an available charger and start charging my car."** |
| 0:45 | Agent calls `list_stations` → `start_charging`; page navigates to the live session on its own | "The site exposes its actions as WebMCP tools — the agent found the charger, started a session, and the page follows along. That kWh number is the charger metering in realtime." |
| 1:20 | Let kWh + cost climb a beat | "Pricing is per-kWh in Colombian pesos. Card payments authorize a hold up front and capture only what you actually use." |
| 1:35 | Prompt: **"Stop charging and give me the receipt."** | Agent calls `stop_charging` → `get_receipt`; receipt renders. "Session over — energy, session fee, total." |
| 1:55 | Admin dashboard, point at revenue tiles | "The property owner sees revenue, the platform's 10% fee, and their net — automatic revenue sharing per session." |
| 2:10 | Repo README architecture diagram | "Under the hood: a reusable backend component, a tiny gateway on Cloudflare Durable Objects holding the charger sockets, and a simulator so anyone can run this with zero hardware. All MIT." |
| 2:30 | Site + repo URL on screen | "OpenEV — real-world charging infrastructure an AI agent can operate and pay for. Links below." |

## Submission text (paste-ready summary)

> **OpenEV** turns any $300–$500 OCPP EV charger into a monetized charging station — QR checkout, realtime metering, hold/capture card payments, revenue sharing. The web app exposes WebMCP tools (`list_stations`, `start_charging`, `get_session`, `stop_charging`, `get_receipt`) so an in-browser agent can find a charger, start a *real* charging session, watch energy flow, stop it, and read the receipt — while the page navigates along for the human. Runs on a reactive backend with a thin OCPP gateway on Cloudflare Durable Objects; a bundled charger simulator means judges can reproduce everything with zero hardware.

Judging criteria to hit: WebMCP leverage (tools drive real infrastructure, not a toy), execution (complete product), impact (charging networks are closed + expensive), creativity (first agent-payable EV charger).
