// Pure pricing math. All amounts are integer minor units.

export interface TariffSnapshot {
  currency: string;
  pricePerKwhMinor: number;
  sessionFeeMinor: number;
  idleFeePerMinuteMinor: number;
  idleGraceMinutes: number;
  electricityCostPerKwhMinor: number;
  platformFeeBps: number;
}

export interface SessionAmounts {
  energyMinor: number;
  sessionFeeMinor: number;
  idleMinor: number;
  totalMinor: number;
  platformFeeMinor: number;
  electricityCostMinor: number;
  operatorNetMinor: number;
}

export function computeAmounts(
  snapshot: TariffSnapshot,
  energyWh: number,
  idleMinutes: number,
): SessionAmounts {
  const energyMinor = Math.round((energyWh * snapshot.pricePerKwhMinor) / 1000);
  const billableIdle = Math.max(0, idleMinutes - snapshot.idleGraceMinutes);
  const idleMinor = Math.round(billableIdle * snapshot.idleFeePerMinuteMinor);
  const totalMinor = energyMinor + snapshot.sessionFeeMinor + idleMinor;
  const platformFeeMinor = Math.floor((totalMinor * snapshot.platformFeeBps) / 10000);
  const electricityCostMinor = Math.round(
    (energyWh * snapshot.electricityCostPerKwhMinor) / 1000,
  );
  return {
    energyMinor,
    sessionFeeMinor: snapshot.sessionFeeMinor,
    idleMinor,
    totalMinor,
    platformFeeMinor,
    electricityCostMinor,
    operatorNetMinor: totalMinor - platformFeeMinor,
  };
}

/** Current cost of a running session (no idle billing while charging). */
export function runningCostMinor(snapshot: TariffSnapshot, energyWh: number): number {
  return computeAmounts(snapshot, energyWh, 0).totalMinor;
}
