import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { CreditCard, PlugZap, Zap } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Badge, Card, Dot, Shell, Skeleton, btnGhost, btnPrimary } from "../ui";
import { money } from "../lib/format";

export default function Driver() {
  const { qrToken = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const preview = useQuery(api.charging.previewByQr, { qrToken });
  const demoCheckout = useMutation(api.charging.demoCheckout);
  const createCheckout = useAction(api.stripe.createCheckout);
  const createPrepaid = useAction(api.wompi.createPrepaid);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"card" | "cop" | "demo" | null>(null);
  const [notice, setNotice] = useState<string | null>(
    searchParams.get("canceled") ? "Payment canceled — nothing was charged." : null,
  );

  if (preview === undefined) {
    return (
      <Shell>
        <div className="mx-auto max-w-md space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-56" />
        </div>
      </Shell>
    );
  }
  if (preview === null) {
    return (
      <Shell>
        <Card className="mx-auto max-w-md">
          <div className="py-8 text-center">
            <PlugZap className="mx-auto mb-2 text-subtle" size={24} />
            <p className="font-medium">This code isn't linked to a charger.</p>
            <p className="mt-1 text-sm text-muted">
              Check the label on the charger or contact the property.
            </p>
          </div>
        </Card>
      </Shell>
    );
  }

  const email$ = email.trim() === "" ? undefined : email.trim();
  const canStart = preview.chargerOnline && !preview.busy;

  const startDemo = async () => {
    setBusy("demo");
    setNotice(null);
    try {
      const info = await demoCheckout({ qrToken, driverEmail: email$ });
      navigate(`/s/${info.sessionId}`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not start the session.");
      setBusy(null);
    }
  };

  const startCard = async () => {
    setBusy("card");
    setNotice(null);
    try {
      const result = await createCheckout({
        qrToken,
        origin: window.location.origin + window.location.pathname.replace(/\/$/, ""),
        driverEmail: email$,
      });
      if (!result.available) {
        setNotice("Card payments aren't set up here yet — try the demo session.");
        setBusy(null);
        return;
      }
      window.location.href = result.url;
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not open the payment page.");
      setBusy(null);
    }
  };

  const startPrepaid = async () => {
    setBusy("cop");
    setNotice(null);
    try {
      const result = await createPrepaid({
        qrToken,
        origin: window.location.origin + window.location.pathname.replace(/\/$/, ""),
        driverEmail: email$,
      });
      if (!result.available) {
        setNotice("PSE/Nequi payments aren't set up here yet — try the demo session.");
        setBusy(null);
        return;
      }
      window.location.href = result.url;
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not open the payment page.");
      setBusy(null);
    }
  };

  return (
    <Shell>
      <div className="mx-auto max-w-md space-y-4">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold">{preview.chargerName}</h1>
              <p className="text-sm text-muted">{preview.propertyName}</p>
              <p className="text-xs text-subtle">{preview.propertyAddress}</p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <Dot on={preview.chargerOnline} />
              {preview.chargerOnline ? "Online" : "Offline"}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge tone="info">
              Connector {preview.connectorNumber} · {preview.connectorType}
            </Badge>
            <Badge tone="neutral">Up to {preview.maxPowerKw} kW</Badge>
            <Badge tone={preview.busy ? "warn" : "ok"}>
              {preview.busy ? "In use" : preview.status}
            </Badge>
          </div>
        </Card>

        <Card title="Pricing">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Energy</dt>
              <dd className="tnum font-medium">
                {preview.pricePerKwhMinor != null
                  ? `${money(preview.pricePerKwhMinor, preview.currency)} / kWh`
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Session fee</dt>
              <dd className="tnum font-medium">
                {preview.sessionFeeMinor != null
                  ? money(preview.sessionFeeMinor, preview.currency)
                  : "—"}
              </dd>
            </div>
            <div className="flex justify-between border-t border-line pt-2">
              <dt className="text-muted">Card hold (max)</dt>
              <dd className="tnum font-medium">
                {money(preview.authorizedMinor, preview.currency)}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-subtle">
            You only pay for the energy you actually use. The hold is released
            automatically for the unused part.
          </p>
        </Card>

        <Card title="Start charging">
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Email for receipt (optional)</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-line bg-raised px-3 py-2.5 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          {notice && (
            <p className="mt-3 rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
              {notice}
            </p>
          )}
          {!canStart && (
            <p className="mt-3 rounded-lg bg-sunken px-3 py-2 text-sm text-muted">
              {preview.busy
                ? "This connector is currently in use."
                : "The charger appears offline right now. Try again in a moment."}
            </p>
          )}
          <div className="mt-4 grid gap-2">
            <button
              className={btnPrimary}
              disabled={!canStart || busy !== null}
              onClick={startCard}
            >
              <CreditCard size={16} />
              {busy === "card" ? "Opening secure checkout…" : "Pay with card"}
            </button>
            {preview.currency === "COP" && (
              <button
                className={btnGhost}
                disabled={!canStart || busy !== null}
                onClick={startPrepaid}
              >
                <CreditCard size={16} />
                {busy === "cop"
                  ? "Opening secure checkout…"
                  : `Prepay ${money(preview.authorizedMinor, "COP")} · PSE / Nequi / tarjeta`}
              </button>
            )}
            <button
              className={btnGhost}
              disabled={!canStart || busy !== null}
              onClick={startDemo}
            >
              <Zap size={16} />
              {busy === "demo" ? "Starting…" : "Start demo session (no charge)"}
            </button>
          </div>
        </Card>
      </div>
    </Shell>
  );
}
