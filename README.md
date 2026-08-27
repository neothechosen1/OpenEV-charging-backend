# OpenEV — monetize any OCPP EV charger

Open-source [Convex](https://convex.dev) backend + component that turns any **OCPP 1.6J**-compatible EV charger (IYILO, Autel, Eaton, Wallbox, and most other brands) into a monetized charging station: QR checkout, live metering, Stripe / Wompi / Mercado Pago payments, and revenue sharing — no proprietary network, no payment terminal on the charger.

```
EV charger ──OCPP 1.6J (WebSocket)──▶ Gateway (Cloudflare Durable Object)
                                          │
                                          ▼
                                   Convex component
                        sessions · tariffs · metering · revenue
                                          │
                              Stripe · Wompi · Mercado Pago
                                          │
                                          ▼
                              Driver scans QR → pays → charges
```

## Monorepo

| Path | What |
|---|---|
| `packages/component` | `@openev/charging` — the reusable Convex component (schema, session lifecycle, tariff engine, revenue math) |
| `apps/web` | Vite + React demo app (driver QR checkout + admin dashboard) — the host Convex app |
| `apps/gateway` | Thin OCPP 1.6J gateway on Cloudflare Workers + Durable Objects (holds charger WebSockets) |
| `apps/simulator` | Fake OCPP charger for demos and tests — no hardware needed |

## Quick start (10 minutes)

```bash
pnpm install
pnpm dev:convex     # creates/links a Convex dev deployment
pnpm dev:gateway    # local gateway on :8787
pnpm simulate       # fake charger connects to the gateway
pnpm dev:web        # driver + admin UI
```

Status: 🚧 in active development (hackathon build, Aug–Sep 2026). MIT licensed.
