import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { components } from "./_generated/api";

// Wompi (Bancolombia) — Colombia's local rail: cards, PSE bank debit, Nequi.
// PSE/Nequi charge instantly (no holds), so Wompi runs in PREPAID mode:
// the driver pays a fixed package via a single-use payment link; charging
// auto-stops when the package value is consumed (the generic overrun guard).

const wompiApi = () => process.env.WOMPI_API_URL ?? "https://sandbox.wompi.co";

// Internal COP minor units are whole pesos; Wompi wants cents.
const toWompiCents = (minor: number) => Math.round(minor * 100);

export const createPrepaid = action({
  args: {
    qrToken: v.string(),
    origin: v.string(),
    driverEmail: v.optional(v.string()),
    packageMinor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const privateKey = process.env.WOMPI_PRIVATE_KEY;
    if (!privateKey) return { available: false as const };
    if (!/^https?:\/\//.test(args.origin)) throw new Error("bad origin");

    const info = await ctx.runMutation(components.evCharging.sessions.createFromQr, {
      qrToken: args.qrToken,
      driverEmail: args.driverEmail,
      paymentMode: "prepaid",
      authorizedMinor: args.packageMinor,
    });
    if (info.tariffSnapshot.currency !== "COP") {
      throw new Error("this payment method only supports COP");
    }
    const paymentId = await ctx.runMutation(components.evCharging.payments.create, {
      organizationId: info.organizationId,
      sessionId: info.sessionId,
      provider: "wompi",
      mode: "prepaid",
      currency: "COP",
      authorizedMinor: info.authorizedMinor,
    });

    const res = await fetch(`${wompiApi()}/v1/payment_links`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${privateKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: `Carga EV ${info.chargerName}`.slice(0, 36),
        description: `Paquete de carga en ${info.propertyName}. La carga se detiene al consumir el valor pagado.`,
        single_use: true,
        collect_shipping: false,
        currency: "COP",
        amount_in_cents: toWompiCents(info.authorizedMinor),
        redirect_url: `${args.origin}/#/s/${info.sessionId}`,
        sku: paymentId,
      }),
    });
    const json = (await res.json()) as {
      data?: { id: string };
      error?: { reason?: string; messages?: unknown };
    };
    if (!res.ok || !json.data?.id) {
      await ctx.runMutation(components.evCharging.payments.markFailed, { paymentId });
      throw new Error(`payment link failed (${res.status})`);
    }
    await ctx.runMutation(components.evCharging.payments.setProviderRef, {
      paymentId,
      providerRef: `plink:${json.data.id}`,
    });
    return {
      available: true as const,
      url: `https://checkout.wompi.co/l/${json.data.id}`,
      sessionId: info.sessionId as string,
    };
  },
});

/** Prepaid bookkeeping when a session ends: record what was consumed. */
export const finalizeForSession = internalAction({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(components.evCharging.sessions.getLive, {
      sessionId: args.sessionId,
    });
    if (!session || !session.amounts || !session.paymentId) return null;
    const payment = await ctx.runQuery(components.evCharging.payments.get, {
      paymentId: session.paymentId,
    });
    if (!payment || payment.provider !== "wompi" || payment.status !== "authorized") {
      return null;
    }
    await ctx.runMutation(components.evCharging.payments.markCaptured, {
      paymentId: session.paymentId,
      capturedMinor: Math.min(session.amounts.totalMinor, payment.authorizedMinor),
    });
    return null;
  },
});
