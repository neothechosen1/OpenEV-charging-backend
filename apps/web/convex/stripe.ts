import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { components } from "./_generated/api";

// Internal money is integer minor units where COP = whole pesos.
// Stripe expects its own smallest units (COP is two-decimal at Stripe).
const STRIPE_UNIT_MULTIPLIER: Record<string, number> = { COP: 100, USD: 1, EUR: 1 };

function toStripeAmount(minor: number, currency: string): number {
  return Math.round(minor * (STRIPE_UNIT_MULTIPLIER[currency.toUpperCase()] ?? 1));
}

async function stripeRequest(
  method: "GET" | "POST",
  path: string,
  params?: Record<string, string>,
): Promise<Record<string, unknown>> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("card payments are not configured");
  const body = params ? new URLSearchParams(params).toString() : undefined;
  const res = await fetch(
    `https://api.stripe.com/v1${path}${method === "GET" && body ? `?${body}` : ""}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(method === "POST"
          ? { "content-type": "application/x-www-form-urlencoded" }
          : {}),
      },
      ...(method === "POST" ? { body } : {}),
    },
  );
  const json = (await res.json()) as Record<string, unknown> & {
    error?: { message?: string; code?: string };
  };
  if (!res.ok) {
    const err = new Error(json.error?.message ?? `stripe ${res.status}`);
    (err as Error & { stripeCode?: string }).stripeCode = json.error?.code;
    throw err;
  }
  return json;
}

/**
 * Card checkout with an authorization hold: the driver authorizes an estimated
 * maximum; we capture only the actual final amount after the charge ends.
 */
export const createCheckout = action({
  args: {
    qrToken: v.string(),
    origin: v.string(),
    driverEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!process.env.STRIPE_SECRET_KEY) return { available: false as const };
    if (!/^https?:\/\//.test(args.origin)) throw new Error("bad origin");

    const info = await ctx.runMutation(components.evCharging.sessions.createFromQr, {
      qrToken: args.qrToken,
      driverEmail: args.driverEmail,
      paymentMode: "hold",
    });
    const paymentId = await ctx.runMutation(components.evCharging.payments.create, {
      organizationId: info.organizationId,
      sessionId: info.sessionId,
      provider: "stripe",
      mode: "hold",
      currency: info.tariffSnapshot.currency,
      authorizedMinor: info.authorizedMinor,
    });
    const currency = info.tariffSnapshot.currency.toLowerCase();
    const checkout = await stripeRequest("POST", "/checkout/sessions", {
      mode: "payment",
      "payment_intent_data[capture_method]": "manual",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": currency,
      "line_items[0][price_data][unit_amount]": String(
        toStripeAmount(info.authorizedMinor, info.tariffSnapshot.currency),
      ),
      "line_items[0][price_data][product_data][name]": `EV charging — ${info.chargerName}`,
      "line_items[0][price_data][product_data][description]":
        "Temporary authorization. You are only charged for the energy you actually use.",
      ...(args.driverEmail ? { customer_email: args.driverEmail } : {}),
      "metadata[sessionId]": info.sessionId,
      "metadata[paymentId]": paymentId,
      success_url: `${args.origin}/#/s/${info.sessionId}?cs={CHECKOUT_SESSION_ID}`,
      cancel_url: `${args.origin}/#/c/${args.qrToken}?canceled=1`,
    });
    await ctx.runMutation(components.evCharging.payments.setProviderRef, {
      paymentId,
      providerRef: checkout.id as string,
    });
    return {
      available: true as const,
      url: checkout.url as string,
      sessionId: info.sessionId as string,
    };
  },
});

/**
 * Server-side confirmation after the driver returns from checkout.
 * We never trust the redirect alone — we ask the payment processor directly.
 * Idempotent; the webhook does the same thing when configured.
 */
export const confirmCheckout = action({
  args: { sessionId: v.string(), checkoutSessionId: v.string() },
  handler: async (ctx, args) => {
    if (!/^cs_/.test(args.checkoutSessionId)) throw new Error("bad checkout id");
    const checkout = await stripeRequest(
      "GET",
      `/checkout/sessions/${args.checkoutSessionId}`,
      { "expand[]": "payment_intent" },
    );
    const metadata = checkout.metadata as { sessionId?: string; paymentId?: string };
    if (metadata?.sessionId !== args.sessionId) throw new Error("session mismatch");
    if (checkout.status !== "complete") return { ok: false as const, reason: "not paid" };
    const paymentIntent = checkout.payment_intent as { id: string; status: string };
    if (
      paymentIntent.status !== "requires_capture" &&
      paymentIntent.status !== "succeeded"
    ) {
      return { ok: false as const, reason: "not authorized" };
    }
    await ctx.runMutation(components.evCharging.payments.markAuthorized, {
      paymentId: metadata.paymentId!,
      providerRef: paymentIntent.id,
    });
    await ctx.runMutation(components.evCharging.sessions.markAuthorized, {
      sessionId: args.sessionId,
      paymentId: metadata.paymentId!,
    });
    return { ok: true as const };
  },
});

/** Capture the actual final amount (≤ the hold) once charging ends. */
export const captureForSession = internalAction({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.runQuery(components.evCharging.sessions.getLive, {
      sessionId: args.sessionId,
    });
    if (!session || !session.amounts || !session.paymentId) return null;
    const payment = await ctx.runQuery(components.evCharging.payments.get, {
      paymentId: session.paymentId,
    });
    if (!payment || payment.provider !== "stripe" || payment.status !== "authorized") {
      return null;
    }
    const intentId = payment.providerRef;
    if (!intentId || !intentId.startsWith("pi_")) return null;
    const amountMinor = Math.min(session.amounts.totalMinor, payment.authorizedMinor);
    try {
      if (amountMinor <= 0) {
        await stripeRequest("POST", `/payment_intents/${intentId}/cancel`, {});
        await ctx.runMutation(components.evCharging.payments.markCanceled, {
          paymentId: session.paymentId,
        });
        return null;
      }
      await stripeRequest("POST", `/payment_intents/${intentId}/capture`, {
        amount_to_capture: String(toStripeAmount(amountMinor, payment.currency)),
      });
      await ctx.runMutation(components.evCharging.payments.markCaptured, {
        paymentId: session.paymentId,
        capturedMinor: amountMinor,
      });
    } catch (err) {
      // Below-minimum captures: release the hold instead of failing forever.
      if ((err as { stripeCode?: string }).stripeCode === "amount_too_small") {
        await stripeRequest("POST", `/payment_intents/${intentId}/cancel`, {});
        await ctx.runMutation(components.evCharging.payments.markCanceled, {
          paymentId: session.paymentId,
        });
        return null;
      }
      throw err;
    }
    return null;
  },
});
