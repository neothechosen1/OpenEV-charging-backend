# Convex All Gas Hackathon — submission checklist & demo script

**Deadline: Sep 22, 2026, 12:00 PM PT** · Register/submit via [luma.com/convex-allgas-hackathon](https://luma.com/convex-allgas-hackathon) · Winners Sep 25.

## Requirements checklist

- [x] New app started on/after Aug 25 (repo created Aug 26)
- [x] Convex as the backend (component + host app, realtime everywhere)
- [x] Frontend deployed on **Convex static hosting**: https://laudable-shrimp-94.convex.site
- [x] Public GitHub repo: https://github.com/neothechosen1/OpenEV-charging-backend
- [x] Built with an AI agent + the Convex plugin/MCP
- [ ] **Firecrawl integration (functional)** — implemented: Dashboard → "Electricity cost" → import the property's real utility tariff page (Firecrawl `v2/scrape` with JSON extraction). Needs `FIRECRAWL_API_KEY` set (participants get 20,000 credits — grab the key after registering).
- [ ] **AgentMail integration (functional)** — implemented: drivers who leave an email get an automatic receipt sent from the backend's own agent inbox on session completion. Needs `AGENTMAIL_API_KEY` + `AGENTMAIL_INBOX_ID`.
- [ ] Demo video **under 3 minutes**
- [ ] **Social media post** (judged!) — post the demo clip on X, tag @convex
- [ ] Team ≤ 4, listed on submission

Set the sponsor keys on **prod**:

```bash
cd apps/web
npx convex env set FIRECRAWL_API_KEY fc-... --prod
npx convex env set AGENTMAIL_API_KEY ... --prod
npx convex env set AGENTMAIL_INBOX_ID receipts@....agentmail.to --prod
```

## Judging angles (from the rules)

Practical usefulness over dev tools → lead with the *charging station product*, not the component. Substantial Convex usage → realtime session metering, reactive command queue, component architecture, scheduled payment capture. Creative sponsor use → Firecrawl imports *real* electricity tariffs; AgentMail receipts come from an inbox an agent can also read and answer.

## Demo video script (<3:00)

| Time | Screen | Beat |
|---|---|---|
| 0:00 | Charger photo + "$400" | Commercial charging backends: thousands per charger + lock-in. |
| 0:15 | Live site | OpenEV: open-source backend that makes any standards-based charger a paid station. Live in Cali, COP pricing. |
| 0:30 | Phone: scan printed QR → checkout page | Driver scans, sees price per kWh, pays — card hold or PSE/Nequi prepaid. No app. |
| 0:50 | Live session page | Charger meters in realtime — kWh and pesos climbing. This is the charger talking OCPP through a tiny edge gateway into the backend. |
| 1:15 | Press Stop → receipt | Backend computes the exact bill, captures only what was used, emails the receipt (AgentMail). |
| 1:35 | Dashboard | Owner's view: chargers online, energy sold, revenue — split into platform fee and owner net, automatically. |
| 1:55 | Electricity cost card → paste utility URL → Import | Firecrawl reads the utility's tariff page and sets the real electricity cost — margins stay honest. |
| 2:15 | Repo + architecture diagram | Reusable backend component, gateway on the edge, simulator included — clone to first charged session in 10 minutes. MIT. |
| 2:40 | URLs on screen | "OpenEV — sell electrons, not subscriptions." |

## Reproduce-for-judges (put in submission text)

```bash
git clone https://github.com/neothechosen1/OpenEV-charging-backend && cd OpenEV-charging-backend
pnpm install && cd apps/web && npx convex dev --once
npx convex env set GATEWAY_SHARED_SECRET $(openssl rand -hex 24)
npx convex run charging:seedDemo        # → QR token
pnpm dev:gateway & pnpm simulate & pnpm dev:web
```
