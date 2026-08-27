import { useState } from "react";
import { Link } from "react-router-dom";
import { useAction, useMutation, useQuery } from "convex/react";
import { QrCode, OctagonX, Download } from "lucide-react";
import { api } from "../../convex/_generated/api";
import {
  Badge,
  Card,
  Dot,
  Kpi,
  QrModal,
  Shell,
  Skeleton,
  sessionLabel,
  sessionTone,
} from "../ui";
import { duration, fmtDate, kwh, money, timeAgo } from "../lib/format";

const th = "px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-subtle";
const td = "px-4 py-3 align-middle";

export default function Admin() {
  const data = useQuery(api.charging.adminOverview, {});
  const sessions = useQuery(api.charging.adminSessions, { limit: 25 });
  const stopSession = useMutation(api.charging.stopSession);
  const suggestCost = useAction(api.tools.suggestElectricityCost);
  const [qr, setQr] = useState<{ url: string; title: string } | null>(null);
  const [tariffUrl, setTariffUrl] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  if (data === undefined) {
    return (
      <Shell>
        <div className="space-y-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      </Shell>
    );
  }
  if (data === null) {
    return (
      <Shell>
        <Card>
          <p className="py-8 text-center text-sm text-muted">
            No organization yet. Seed the demo data to get started.
          </p>
        </Card>
      </Shell>
    );
  }

  const { kpis } = data;
  const currency = kpis.currency;
  const qrBase = `${window.location.origin}${window.location.pathname}#/c/`;

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">{data.organization.name}</h1>
          <p className="text-sm text-muted">
            Operator dashboard · last 24 hours
          </p>
        </div>
        <p className="text-xs text-muted">
          Platform fee {data.organization.platformFeeBps / 100}%
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Chargers online"
          value={
            <span className="flex items-center gap-2">
              <Dot on={kpis.chargersOnline > 0} />
              {kpis.chargersOnline}/{kpis.chargersTotal}
            </span>
          }
        />
        <Kpi label="Active sessions" value={kpis.activeSessions} />
        <Kpi label="Energy sold" value={kwh(kpis.energyTodayWh)} sub={`${kpis.sessionsToday} completed sessions`} />
        <Kpi
          label="Revenue"
          value={money(kpis.revenueTodayMinor, currency)}
          sub={`Fee ${money(kpis.platformFeeTodayMinor, currency)} · Net ${money(kpis.operatorNetTodayMinor, currency)}`}
        />
      </div>

      {data.property && (
        <Card title="Electricity cost" className="mt-6">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-40">
              <div className="text-xs text-subtle">{data.property.name} — current</div>
              <div className="tnum text-lg font-semibold">
                {money(data.property.electricityCostPerKwhMinor, data.property.currency)}
                <span className="text-sm font-normal text-muted"> / kWh</span>
              </div>
            </div>
            <label className="min-w-56 flex-1">
              <span className="text-xs font-medium text-subtle">
                Import from your utility's tariff page
              </span>
              <input
                className="mt-1 w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                placeholder="https://www.your-utility.com/tarifas"
                value={tariffUrl}
                onChange={(e) => setTariffUrl(e.target.value)}
              />
            </label>
            <button
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-raised px-4 py-2.5 text-sm font-medium hover:bg-sunken disabled:opacity-50"
              disabled={importBusy || !tariffUrl.trim()}
              onClick={async () => {
                setImportBusy(true);
                setImportMsg(null);
                try {
                  const result = await suggestCost({
                    url: tariffUrl.trim(),
                    propertyId: data.property!.propertyId,
                  });
                  setImportMsg(
                    result.available
                      ? `Updated to ${money(result.copPerKwh, "COP")}/kWh${result.rateName ? ` (${result.rateName})` : ""}.`
                      : "Import isn't configured yet on this deployment.",
                  );
                } catch (err) {
                  setImportMsg(err instanceof Error ? err.message : "Import failed.");
                } finally {
                  setImportBusy(false);
                }
              }}
            >
              <Download size={15} />
              {importBusy ? "Reading page…" : "Import"}
            </button>
          </div>
          {importMsg && <p className="mt-2 text-sm text-muted">{importMsg}</p>}
          <p className="mt-2 text-xs text-subtle">
            Used for your margin report only — it never changes what drivers pay.
          </p>
        </Card>
      )}

      <Card title="Chargers" className="mt-6">
        <div className="-m-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-sunken">
              <tr>
                <th className={th}>Charger</th>
                <th className={th}>Property</th>
                <th className={th}>Connectors</th>
                <th className={th}>Price</th>
                <th className={th}>Last seen</th>
                <th className={`${th} text-right`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.chargers.map((charger) => {
                const activeConnector = charger.connectors.find(
                  (c) => c.currentSessionId,
                );
                return (
                  <tr key={charger.chargerId} className="border-t border-line hover:bg-sunken/50">
                    <td className={td}>
                      <div className="flex items-center gap-2 font-medium">
                        <Dot on={charger.online} />
                        {charger.name}
                      </div>
                      {(charger.vendor || charger.model) && (
                        <div className="text-xs text-subtle">
                          {[charger.vendor, charger.model].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </td>
                    <td className={`${td} text-muted`}>{charger.propertyName}</td>
                    <td className={td}>
                      <div className="flex flex-wrap gap-1.5">
                        {charger.connectors.map((c) => (
                          <Badge
                            key={c.connectorId}
                            tone={
                              c.status === "Charging"
                                ? "ok"
                                : c.status === "Available"
                                  ? "info"
                                  : c.status === "Faulted"
                                    ? "danger"
                                    : "neutral"
                            }
                          >
                            {c.connectorNumber} · {c.connectorType} · {c.status}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className={`${td} tnum text-muted`}>
                      {charger.connectors[0]?.pricePerKwhMinor != null
                        ? `${money(charger.connectors[0].pricePerKwhMinor, charger.connectors[0].currency)}/kWh`
                        : "—"}
                    </td>
                    <td className={`${td} text-muted`}>{timeAgo(charger.lastHeartbeatAt)}</td>
                    <td className={`${td}`}>
                      <div className="flex items-center justify-end gap-1.5">
                        {activeConnector?.currentSessionId && (
                          <>
                            <Link
                              to={`/s/${activeConnector.currentSessionId}`}
                              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary-soft"
                            >
                              View session
                            </Link>
                            <button
                              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-danger hover:bg-danger/5"
                              title="Stop session"
                              onClick={() =>
                                void stopSession({
                                  sessionId: activeConnector.currentSessionId!,
                                })
                              }
                            >
                              <OctagonX size={16} />
                            </button>
                          </>
                        )}
                        {charger.connectors[0] && (
                          <button
                            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-2 text-muted hover:bg-sunken"
                            title="Show QR code"
                            onClick={() =>
                              setQr({
                                url: `${qrBase}${charger.connectors[0].qrToken}`,
                                title: `${charger.name} — connector ${charger.connectors[0].connectorNumber}`,
                              })
                            }
                          >
                            <QrCode size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {data.chargers.length === 0 && (
                <tr>
                  <td className={`${td} text-center text-muted`} colSpan={6}>
                    No chargers registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Recent sessions" className="mt-6">
        <div className="-m-5 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-sunken">
              <tr>
                <th className={th}>Started</th>
                <th className={th}>Charger</th>
                <th className={`${th} text-right`}>Energy</th>
                <th className={`${th} text-right`}>Duration</th>
                <th className={`${th} text-right`}>Total</th>
                <th className={th}>Payment</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {(sessions ?? []).map((s) => (
                <tr key={s.sessionId} className="border-t border-line hover:bg-sunken/50">
                  <td className={`${td} text-muted`}>
                    <Link to={`/s/${s.sessionId}`} className="hover:text-primary">
                      {fmtDate(s.startedAt ?? s.createdAt)}
                    </Link>
                  </td>
                  <td className={td}>{s.chargerName}</td>
                  <td className={`${td} tnum text-right`}>{kwh(s.energyWh)}</td>
                  <td className={`${td} tnum text-right text-muted`}>
                    {duration(s.startedAt, s.stoppedAt)}
                  </td>
                  <td className={`${td} tnum text-right font-medium`}>
                    {s.totalMinor != null ? money(s.totalMinor, s.currency) : "—"}
                  </td>
                  <td className={td}>
                    <Badge tone={s.paymentMode === "demo" ? "neutral" : "info"}>
                      {s.paymentMode === "demo"
                        ? "Demo"
                        : s.paymentMode === "hold"
                          ? "Card"
                          : "Prepaid"}
                    </Badge>
                  </td>
                  <td className={td}>
                    <Badge tone={sessionTone[s.status] ?? "neutral"}>
                      {sessionLabel[s.status] ?? s.status}
                    </Badge>
                  </td>
                </tr>
              ))}
              {sessions?.length === 0 && (
                <tr>
                  <td className={`${td} text-center text-muted`} colSpan={7}>
                    Sessions will appear here as drivers start charging.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {qr && <QrModal url={qr.url} title={qr.title} onClose={() => setQr(null)} />}
    </Shell>
  );
}
