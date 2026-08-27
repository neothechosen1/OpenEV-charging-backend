// Tolerant parsing of OCPP 1.6J MeterValues payloads.
// Different charger firmwares report different units/measurands — this is the
// multi-brand normalization layer. Pure functions, usable from Convex or the gateway.

export interface MeterReading {
  energyWh?: number;
  powerW?: number;
  voltage?: number;
  amperage?: number;
  soc?: number;
}

interface SampledValue {
  value: string;
  measurand?: string;
  unit?: string;
}

interface MeterValue {
  timestamp?: string;
  sampledValue?: SampledValue[];
}

export function parseMeterValues(payload: {
  meterValue?: MeterValue[];
}): MeterReading {
  const out: MeterReading = {};
  for (const mv of payload.meterValue ?? []) {
    for (const sv of mv.sampledValue ?? []) {
      const value = Number(sv.value);
      if (!Number.isFinite(value)) continue;
      // Per spec, a missing measurand means Energy.Active.Import.Register.
      const measurand = sv.measurand ?? "Energy.Active.Import.Register";
      switch (measurand) {
        case "Energy.Active.Import.Register":
          out.energyWh = sv.unit === "kWh" ? value * 1000 : value;
          break;
        case "Power.Active.Import":
          out.powerW = sv.unit === "kW" ? value * 1000 : value;
          break;
        case "Voltage":
          out.voltage = value;
          break;
        case "Current.Import":
          out.amperage = value;
          break;
        case "SoC":
          out.soc = value;
          break;
      }
    }
  }
  return out;
}
