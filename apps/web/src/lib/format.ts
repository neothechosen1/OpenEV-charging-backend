const CURRENCY_DECIMALS: Record<string, number> = { COP: 0, USD: 2, EUR: 2 };
const CURRENCY_LOCALE: Record<string, string> = { COP: "es-CO", USD: "en-US", EUR: "de-DE" };

export function money(minor: number, currency: string): string {
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  return new Intl.NumberFormat(CURRENCY_LOCALE[currency] ?? "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(minor);
}

export function kwh(wh: number): string {
  return `${(wh / 1000).toFixed(2)} kWh`;
}

export function kw(watts: number | null | undefined): string {
  return watts == null ? "—" : `${(watts / 1000).toFixed(1)} kW`;
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function fmtDate(ms: number | null | undefined): string {
  return ms == null ? "—" : dateFmt.format(new Date(ms));
}

export function duration(startMs: number | null | undefined, endMs?: number | null): string {
  if (startMs == null) return "—";
  const total = Math.max(0, Math.floor(((endMs ?? Date.now()) - startMs) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function timeAgo(ms: number | null | undefined): string {
  if (ms == null) return "never";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}
