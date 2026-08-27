import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { components } from "./_generated/api";

// Emailed receipts via AgentMail (https://docs.agentmail.to) — the backend's
// own inbox sends the receipt, and replies land somewhere an agent can read.
// Skips silently when AGENTMAIL_API_KEY / AGENTMAIL_INBOX_ID are not set.

const CURRENCY_DECIMALS: Record<string, number> = { COP: 0, USD: 2, EUR: 2 };

function fmt(minor: number, currency: string): string {
  const decimals = CURRENCY_DECIMALS[currency] ?? 2;
  return `${(minor / 10 ** decimals).toLocaleString("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} ${currency}`;
}

export const sendReceipt = internalAction({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const apiKey = process.env.AGENTMAIL_API_KEY;
    const inboxId = process.env.AGENTMAIL_INBOX_ID;
    if (!apiKey || !inboxId) return null;

    const session = await ctx.runQuery(components.evCharging.sessions.getLive, {
      sessionId: args.sessionId,
    });
    if (!session || !session.amounts || !session.driverEmail) return null;
    const { amounts, tariffSnapshot } = session;
    const currency = tariffSnapshot.currency;
    const kwh = (session.energyWh / 1000).toFixed(2);

    const lines = [
      `Recibo de carga — OpenEV`,
      ``,
      `Energía entregada: ${kwh} kWh`,
      `Energía: ${fmt(amounts.energyMinor, currency)}`,
      `Cargo por sesión: ${fmt(amounts.sessionFeeMinor, currency)}`,
      ...(amounts.idleMinor > 0
        ? [`Cargo por ocupación: ${fmt(amounts.idleMinor, currency)}`]
        : []),
      `TOTAL: ${fmt(amounts.totalMinor, currency)}`,
      ``,
      session.paymentMode === "demo"
        ? `Sesión de demostración — no se realizó ningún cobro.`
        : `Gracias por cargar con nosotros.`,
    ];

    try {
      const res = await fetch(
        `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            to: [session.driverEmail],
            subject: `Tu recibo de carga — ${kwh} kWh · ${fmt(amounts.totalMinor, currency)}`,
            text: lines.join("\n"),
          }),
        },
      );
      if (!res.ok) {
        console.error(`receipt email failed: ${res.status} ${await res.text()}`);
      }
    } catch (err) {
      console.error(`receipt email error: ${String(err)}`);
    }
    return null;
  },
});
