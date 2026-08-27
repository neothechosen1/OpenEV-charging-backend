import { useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { MapPin, PlugZap } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Badge, Card, Dot, Shell, Skeleton, cx, btnGhost } from "../ui";
import { money } from "../lib/format";

export default function Home() {
  const stations = useQuery(api.charging.publicStations, {});
  return (
    <Shell>
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-4xl sm:text-5xl">
          Scan. Pay. Charge.
        </h1>
        <p className="mt-3 text-muted">
          OpenEV turns any standards-based (OCPP) EV charger into a monetized
          charging station — QR checkout, live metering, and automatic payouts.
        </p>
      </div>

      <div className="mt-10 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-subtle">
          Public stations
        </h2>
        {stations === undefined && (
          <div className="space-y-3">
            <Skeleton className="h-28" />
            <Skeleton className="h-28" />
          </div>
        )}
        {stations !== undefined && stations.length === 0 && (
          <Card>
            <div className="py-6 text-center text-sm text-muted">
              <PlugZap className="mx-auto mb-2 text-subtle" size={22} />
              No public stations yet. Open the dashboard to register your first
              charger.
            </div>
          </Card>
        )}
        {stations?.map((station) => (
          <Card key={station.name}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold">{station.name}</h3>
                <p className="mt-0.5 flex items-center gap-1 text-sm text-muted">
                  <MapPin size={13} />
                  {station.address}, {station.city}
                </p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {station.chargers.map((charger) => (
                <div
                  key={charger.name}
                  className="rounded-lg border border-line bg-surface p-3"
                >
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Dot on={charger.online} />
                    {charger.name}
                    <span className="text-xs font-normal text-subtle">
                      {charger.online ? "Online" : "Offline"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {charger.connectors.map((connector) => (
                      <Link
                        key={connector.connectorNumber}
                        to={`/c/${connector.qrToken}`}
                        className={cx(btnGhost, "px-3 py-2 text-xs")}
                      >
                        <span className="font-semibold">
                          {connector.connectorType}
                        </span>
                        <span className="text-muted">
                          {connector.maxPowerKw} kW
                        </span>
                        {connector.pricePerKwhMinor != null && (
                          <span className="tnum text-muted">
                            {money(connector.pricePerKwhMinor, connector.currency)}/kWh
                          </span>
                        )}
                        <Badge tone={connector.available ? "ok" : "neutral"}>
                          {connector.available ? "Available" : connector.status}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </Shell>
  );
}
