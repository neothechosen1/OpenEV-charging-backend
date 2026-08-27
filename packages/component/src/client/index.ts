// Host-app entry point for @openev/charging.
//
// v0.1: host apps call component functions directly via `components.evCharging.*`
// (see apps/web/convex for a full example). A typed `EVCharging` wrapper class —
// carrying payment-provider configuration (Stripe / Wompi / Mercado Pago) — lands
// with the payment layer in Phase 2.

export { computeAmounts, runningCostMinor } from "../component/lib/pricing";
export type { TariffSnapshot, SessionAmounts } from "../component/lib/pricing";
export { parseMeterValues } from "../ocpp/parse";
export type { MeterReading } from "../ocpp/parse";
