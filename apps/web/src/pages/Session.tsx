import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { BatteryCharging, CheckCircle2, OctagonX } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Badge, Card, Shell, Skeleton, btnDanger, sessionLabel, sessionTone } from "../ui";
import { duration, kw, kwh, money } from "../lib/format";

export default function Session() {
  const { sessionId = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const live = useQuery(api.charging.liveSession, { sessionId });
  const stopSession = useMutation(api.charging.stopSession);
  const confirmCheckout = useAction(api.stripe.confirmCheckout);
  const [stopBusy, setStopBusy] = useState(false);
  const [confirming, setConfirming] = useState(searchParams.has("cs"));
  const confirmedRef = useRef(false);
  const [, forceTick] = useState(0);

  // Returned from card checkout: confirm server-side, then drop the param.
  useEffect(() => {
    const checkoutSessionId = searchParams.get("cs");
    if (!checkoutSessionId || confirmedRef.current) return;
    confirmedRef.current = true;
    void confirmCheckout({ sessionId, checkoutSessionId })
      .finally(() => {
        setConfirming(false);
        searchParams.delete("cs");
        setSearchParams(searchParams, { replace: true });
      });
  }, [searchParams, sessionId, confirmCheckout, setSearchParams]);

  // 1s tick so elapsed time counts up between meter updates.
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (live === undefined) {
    return (
      <Shell>
        <div className="mx-auto max-w-md space-y-3">
          <Skeleton className="h-64" />
        </div>
      </Shell>
    );
  }
  if (live === null) {
    return (
      <Shell>
        <Card className="mx-auto max-w-md">
          <p className="py-8 text-center text-sm text-muted">Session not found.</p>
        </Card>
      </Shell>
    );
  }

  const currency = live.tariffSnapshot.currency;
  const active = live.status === "charging" || live.status === "stopping";
  const waiting =
    confirming || live.status === "authorized" || live.status === "pending_payment";

  return (
    <Shell>
      <div className="mx-auto max-w-md space-y-4">
        <Card>
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-semibold">Charging session</h1>
            <Badge tone={sessionTone[live.status] ?? "neutral"}>
              {confirming ? "Confirming payment" : sessionLabel[live.status] ?? live.status}
            </Badge>
          </div>

          {waiting && (
            <div className="mt-6 flex flex-col items-center py-6 text-center">
              <BatteryCharging className="animate-pulse text-primary" size={40} />
              <p className="mt-3 font-medium">
                {confirming
                  ? "Confirming your payment…"
                  : live.status === "pending_payment"
                    ? "Waiting for payment…"
                    : "Telling the charger to start…"}
              </p>
              <p className="mt-1 text-sm text-muted">
                Plug in your vehicle if you haven't yet.
              </p>
            </div>
          )}

          {active && (
            <div className="mt-6 text-center">
              <div className="tnum font-mono text-5xl font-semibold text-primary">
                {(live.energyWh / 1000).toFixed(3)}
                <span className="ml-1 text-lg text-muted">kWh</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div className="rounded-lg bg-sunken p-2.5">
                  <div className="text-xs text-subtle">Power</div>
                  <div className="tnum font-medium">{kw(live.lastPowerW)}</div>
                </div>
                <div className="rounded-lg bg-sunken p-2.5">
                  <div className="text-xs text-subtle">Time</div>
                  <div className="tnum font-medium">{duration(live.startedAt)}</div>
                </div>
                <div className="rounded-lg bg-sunken p-2.5">
                  <div className="text-xs text-subtle">Cost so far</div>
                  <div className="tnum font-medium">{money(live.costMinor, currency)}</div>
                </div>
              </div>
              <button
                className={`${btnDanger} mt-6 w-full`}
                disabled={stopBusy || live.status === "stopping"}
                onClick={async () => {
                  setStopBusy(true);
                  try {
                    await stopSession({ sessionId });
                  } finally {
                    setStopBusy(false);
                  }
                }}
              >
                <OctagonX size={16} />
                {live.status === "stopping" ? "Stopping…" : "Stop charging"}
              </button>
            </div>
          )}

          {live.status === "completed" && live.amounts && (
            <div className="mt-6">
              <div className="flex flex-col items-center text-center">
                <CheckCircle2 className="text-success" size={36} />
                <p className="mt-2 font-medium">Charging complete</p>
                <p className="text-sm text-muted">
                  {kwh(live.energyWh)} delivered in {duration(live.startedAt, live.stoppedAt)}
                </p>
              </div>
              <dl className="mt-5 space-y-2 border-t border-line pt-4 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted">
                    Energy · {kwh(live.energyWh)} ×{" "}
                    {money(live.tariffSnapshot.pricePerKwhMinor, currency)}/kWh
                  </dt>
                  <dd className="tnum">{money(live.amounts.energyMinor, currency)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Session fee</dt>
                  <dd className="tnum">{money(live.amounts.sessionFeeMinor, currency)}</dd>
                </div>
                {live.amounts.idleMinor > 0 && (
                  <div className="flex justify-between">
                    <dt className="text-muted">Idle fee</dt>
                    <dd className="tnum">{money(live.amounts.idleMinor, currency)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
                  <dt>Total</dt>
                  <dd className="tnum">{money(live.amounts.totalMinor, currency)}</dd>
                </div>
              </dl>
              <p className="mt-3 rounded-lg bg-sunken px-3 py-2 text-center text-xs text-muted">
                {live.paymentMode === "demo"
                  ? "Demo session — nothing was charged."
                  : live.payment?.status === "captured"
                    ? `Paid by card · ${money(live.payment.capturedMinor ?? live.amounts.totalMinor, currency)} charged, rest of the hold released.`
                    : live.payment?.status === "canceled"
                      ? "No charge — the card hold was fully released."
                      : "Finalizing your card payment…"}
              </p>
            </div>
          )}

          {(live.status === "failed" || live.status === "expired") && (
            <div className="mt-6 py-6 text-center">
              <p className="font-medium">This session didn't start.</p>
              <p className="mt-1 text-sm text-muted">
                {live.stopReason === "CanceledByDriver"
                  ? "It was canceled."
                  : "The charger rejected the start request. Nothing was charged."}
              </p>
            </div>
          )}
        </Card>
        <p className="text-center text-sm">
          <Link to="/" className="text-primary hover:underline">
            Find another charger
          </Link>
        </p>
      </div>
    </Shell>
  );
}
