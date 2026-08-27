# OpenEV — monetize any OCPP EV charger

Open-source [Convex](https://convex.dev) component + backend that turns any **OCPP 1.6J**-compatible EV charger (IYILO, Autel, Eaton, Wallbox, Zaptec, and most other brands) into a monetized charging station: QR checkout, live metering, card payments with hold/capture, revenue sharing — no proprietary network, no payment terminal on the charger, no app install for drivers.

**Live demo:** https://laudable-shrimp-94.convex.site · Public API: [`/api/public/stations`](https://laudable-shrimp-94.convex.site/api/public/stations)

```
        EV charger (any OCPP 1.6J brand)          Driver's phone
                 │  wss://…/ocpp/{identity}              │ scans QR on the charger
                 ▼                                       ▼
   OCPP Gateway — Cloudflare Durable Object     Web app (Vite + React)
   (1 object per charger, WebSocket             /c/:qr checkout · /s/:id live
    hibernation, free plan OK)                  session · /admin dashboard
                 │  events ▲ commands                    │
                 ▼         │                             ▼
      ┌────────────── CONVEX (system of record) ─────────────────┐
      │  @openev/charging component                              │
      │  chargers · sessions · tariffs · meter data · payments   │
      │  revenue splits · commands · audit log                   │
      │        │                                                 │
      │        ├── Stripe (authorize → capture actual amount)    │
      │        ├── Wompi (prepaid — Colombia, roadmap)           │
      │        └── Mercado Pago (roadmap)                        │
      └──────────────────────────────────────────────────────────┘
```

## Why

Commercial EV charging platforms cost thousands of dollars per charger and lock property owners into proprietary payment networks. A compatible OCPP charger costs $300–$500. OpenEV is the missing open-source middle: point the charger at this backend, print a QR code, connect a payment processor, and start selling charging.

## Monorepo

| Path | What |
|---|---|
| `packages/component` | `@openev/charging` — the reusable Convex component: schema, OCPP session lifecycle, tariff engine (frozen per-session snapshots), revenue math, payments ledger, command queue |
| `apps/web` | Demo host app: driver QR checkout, live charging page, operator dashboard, WebMCP tools. Deploys to Convex static hosting |
| `apps/gateway` | Thin OCPP 1.6J transport on Cloudflare Workers + Durable Objects. No business logic |
| `apps/simulator` | A fake OCPP charger ([ocpp-rpc](https://github.com/mikuso/ocpp-rpc)) — demo the whole system with zero hardware |

## Quick start (no hardware needed)

```bash
git clone https://github.com/neothechosen1/OpenEV-charging-backend
cd OpenEV-charging-backend && pnpm install

# 1. Backend (creates a free Convex dev deployment)
cd apps/web && npx convex dev --once
npx convex env set GATEWAY_SHARED_SECRET $(openssl rand -hex 24)
npx convex run charging:seedDemo   # prints your demo QR token

# 2. Gateway (put the same secret + your .convex.site URL in apps/gateway/.dev.vars)
pnpm dev:gateway                   # ws://localhost:8787

# 3. Fake charger + web app
pnpm simulate
pnpm dev:web                       # open http://localhost:5173
```

Open `/#/c/<qrToken>`, press **Start demo session**, and watch kWh + cost climb in realtime. Press stop, get a receipt, and see the revenue split on `/#/admin`.

## Connect a real charger

Any charger that lets you configure a custom OCPP backend works — that's the point. Requirements:

- **OCPP 1.6J** (JSON over WebSocket) — the protocol virtually every charger ships
- Remote start/stop support
- MeterValues reporting (energy; power optional)

Point the charger at `wss://<your-gateway>/ocpp/<chargerIdentity>`, register the identity in the dashboard/backend first (unknown identities are rejected at boot), and print the connector's QR. IYILO, Autel, Eaton, Wallbox and similar are examples of OCPP-configurable brands — always verify the specific model/firmware exposes third-party backend configuration.

## Payments

Unknown-final-amount payments are the hard part of EV charging. OpenEV models two modes:

- **HOLD** (Stripe, implemented): authorize an estimated maximum at checkout (`capture_method: manual`), auto-stop charging before the hold is exceeded, capture only the actual final amount — the rest releases automatically. Signed webhooks, dedup, idempotent capture-or-cancel.
- **PREPAID** (Wompi/PSE/Nequi — Colombia, roadmap): bank debits can't be held, so drivers buy a fixed package and charging auto-stops at its value.

```bash
npx convex env set STRIPE_SECRET_KEY sk_test_...       # test mode!
npx convex env set STRIPE_WEBHOOK_SECRET whsec_...     # optional; confirm also runs server-side on redirect
```

All money is integer minor units + ISO currency (COP/USD/EUR out of the box, nothing hardcoded). Tariffs support per-kWh price, session fee, and idle fees; each session freezes a tariff snapshot so history never changes. Revenue reporting splits gross → electricity cost → platform fee (bps) → operator net.

## AI agents (WebMCP)

The driver web app registers six [WebMCP](https://webmcp.dev) tools — `list_stations`, `get_charger`, `start_charging`, `get_session`, `stop_charging`, `get_receipt` — so an in-browser AI agent can find a charger, start a real charging session, watch the energy flow, stop it, and read the receipt, while the page navigates along for the human. Real-world infrastructure an agent can operate.

## Deploy

```bash
# Backend + frontend → https://<deployment>.convex.site
cd apps/web
npx convex deploy
npx @convex-dev/static-hosting upload --build --prod

# Gateway → Cloudflare Workers (free plan; Durable Objects are SQLite-backed)
cd ../gateway
wrangler secret put GATEWAY_SHARED_SECRET   # same value as the Convex env var
wrangler deploy
```

## Tests

```bash
pnpm test   # pricing math, session lifecycle, duplicate StopTransaction idempotency,
            # duplicate StartTransaction retry, hold-overrun auto-stop, unknown-charger rejection
```

## Security notes

Charger identities are registered before boot is accepted; QR tokens are opaque 128-bit values; the gateway↔backend link uses a shared secret; payment webhooks are signature-verified and deduplicated; payment operations are idempotent; drivers' card data never touches this codebase (processor-hosted checkout only). Backend software is **not** an electrical safety mechanism — breakers, wiring, and certified hardware remain required.

## Roadmap

Dynamic load management (`SetChargingProfile`), RFID resident billing, Wompi + Mercado Pago adapters, OCPI interfaces, OCPP 2.0.1, typed `EVCharging` client class, per-role auth for the dashboard.

MIT © 2026 — built for the Convex All Gas and OpenAI WebMCP hackathons.
