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

// Return shapes of the component's public queries, for host apps and frontends.
// (Component ids cross the boundary as plain strings.)

export interface PublicConnector {
  connectorNumber: number;
  connectorType: string;
  maxPowerKw: number;
  status: string;
  available: boolean;
  qrToken: string;
  pricePerKwhMinor: number | null;
  sessionFeeMinor: number | null;
  currency: string;
}

export interface PublicCharger {
  name: string;
  vendor: string | null;
  model: string | null;
  online: boolean;
  connectors: PublicConnector[];
}

export interface PublicStation {
  name: string;
  address: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  chargers: PublicCharger[];
}

export interface AdminConnector {
  connectorId: string;
  connectorNumber: number;
  connectorType: string;
  maxPowerKw: number;
  status: string;
  qrToken: string;
  currentSessionId: string | null;
  pricePerKwhMinor: number | null;
  currency: string;
}

export interface AdminCharger {
  chargerId: string;
  name: string;
  propertyName: string;
  vendor: string | null;
  model: string | null;
  firmwareVersion: string | null;
  status: string;
  online: boolean;
  lastHeartbeatAt: number | null;
  connectors: AdminConnector[];
}

export interface AdminOverview {
  organization: { name: string; currency: string; platformFeeBps: number };
  property: {
    propertyId: string;
    name: string;
    electricityCostPerKwhMinor: number;
    currency: string;
  } | null;
  kpis: {
    chargersTotal: number;
    chargersOnline: number;
    activeSessions: number;
    energyTodayWh: number;
    revenueTodayMinor: number;
    platformFeeTodayMinor: number;
    electricityCostTodayMinor: number;
    operatorNetTodayMinor: number;
    sessionsToday: number;
    currency: string;
  };
  chargers: AdminCharger[];
}

export interface AdminSessionRow {
  sessionId: string;
  createdAt: number;
  chargerName: string;
  status: string;
  paymentMode: "hold" | "prepaid" | "demo";
  driverEmail: string | null;
  energyWh: number;
  startedAt: number | null;
  stoppedAt: number | null;
  totalMinor: number | null;
  platformFeeMinor: number | null;
  currency: string;
  stopReason: string | null;
}
