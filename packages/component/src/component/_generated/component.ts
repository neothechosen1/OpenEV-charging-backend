/* eslint-disable */
/**
 * Generated `ComponentApi` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type { FunctionReference } from "convex/server";

/**
 * A utility for referencing a Convex component's exposed API.
 *
 * Useful when expecting a parameter like `components.myComponent`.
 * Usage:
 * ```ts
 * async function myFunction(ctx: QueryCtx, component: ComponentApi) {
 *   return ctx.runQuery(component.someFile.someQuery, { ...args });
 * }
 * ```
 */
export type ComponentApi<Name extends string | undefined = string | undefined> =
  {
    admin: {
      listSessions: FunctionReference<
        "query",
        "internal",
        { limit?: number },
        any,
        Name
      >;
      overview: FunctionReference<"query", "internal", {}, any, Name>;
    };
    chargers: {
      boot: FunctionReference<
        "mutation",
        "internal",
        {
          firmwareVersion?: string;
          model?: string;
          ocppIdentity: string;
          serialNumber?: string;
          vendor?: string;
        },
        any,
        Name
      >;
      disconnected: FunctionReference<
        "mutation",
        "internal",
        { ocppIdentity: string },
        any,
        Name
      >;
      heartbeat: FunctionReference<
        "mutation",
        "internal",
        { ocppIdentity: string },
        any,
        Name
      >;
      register: FunctionReference<
        "mutation",
        "internal",
        {
          connectors: Array<{
            connectorNumber: number;
            connectorType: string;
            maxPowerKw: number;
            tariffId?: string;
          }>;
          name: string;
          ocppIdentity: string;
          organizationId: string;
          propertyId: string;
        },
        any,
        Name
      >;
      statusNotification: FunctionReference<
        "mutation",
        "internal",
        {
          connectorNumber: number;
          errorCode?: string;
          ocppIdentity: string;
          ocppStatus: string;
        },
        any,
        Name
      >;
    };
    commands: {
      markResult: FunctionReference<
        "mutation",
        "internal",
        { commandId: string; ok: boolean; resultPayload?: any },
        any,
        Name
      >;
      takePending: FunctionReference<
        "mutation",
        "internal",
        { ocppIdentity: string },
        any,
        Name
      >;
    };
    payments: {
      create: FunctionReference<
        "mutation",
        "internal",
        {
          authorizedMinor: number;
          currency: string;
          mode: "hold" | "prepaid";
          organizationId: string;
          provider: "stripe" | "wompi" | "mercadopago" | "demo";
          sessionId: string;
        },
        any,
        Name
      >;
      get: FunctionReference<
        "query",
        "internal",
        { paymentId: string },
        any,
        Name
      >;
      markAuthorized: FunctionReference<
        "mutation",
        "internal",
        { paymentId: string; providerRef?: string },
        any,
        Name
      >;
      markCanceled: FunctionReference<
        "mutation",
        "internal",
        { paymentId: string },
        any,
        Name
      >;
      markCaptured: FunctionReference<
        "mutation",
        "internal",
        { capturedMinor: number; paymentId: string },
        any,
        Name
      >;
      markFailed: FunctionReference<
        "mutation",
        "internal",
        { paymentId: string },
        any,
        Name
      >;
      markProcessed: FunctionReference<
        "mutation",
        "internal",
        { key: string },
        any,
        Name
      >;
      setProviderRef: FunctionReference<
        "mutation",
        "internal",
        { paymentId: string; providerRef: string },
        any,
        Name
      >;
    };
    sessions: {
      createFromQr: FunctionReference<
        "mutation",
        "internal",
        {
          authorizedMinor?: number;
          driverEmail?: string;
          paymentMode: "hold" | "prepaid" | "demo";
          qrToken: string;
        },
        any,
        Name
      >;
      getLive: FunctionReference<
        "query",
        "internal",
        { sessionId: string },
        any,
        Name
      >;
      markAuthorized: FunctionReference<
        "mutation",
        "internal",
        { paymentId?: string; sessionId: string },
        any,
        Name
      >;
      meterValues: FunctionReference<
        "mutation",
        "internal",
        {
          ocppIdentity: string;
          ocppTransactionId?: number;
          reading: {
            amperage?: number;
            energyWh?: number;
            powerW?: number;
            soc?: number;
            voltage?: number;
          };
        },
        any,
        Name
      >;
      previewByQr: FunctionReference<
        "query",
        "internal",
        { qrToken: string },
        any,
        Name
      >;
      requestStop: FunctionReference<
        "mutation",
        "internal",
        { sessionId: string },
        any,
        Name
      >;
      startTransaction: FunctionReference<
        "mutation",
        "internal",
        {
          connectorNumber: number;
          idTag: string;
          meterStartWh: number;
          ocppIdentity: string;
        },
        any,
        Name
      >;
      stopTransaction: FunctionReference<
        "mutation",
        "internal",
        {
          meterStopWh?: number;
          ocppIdentity: string;
          ocppTransactionId: number;
          reason?: string;
        },
        any,
        Name
      >;
    };
    setup: {
      seedDemo: FunctionReference<"mutation", "internal", {}, any, Name>;
    };
    stations: {
      listPublic: FunctionReference<"query", "internal", {}, any, Name>;
    };
    tariffs: {
      create: FunctionReference<
        "mutation",
        "internal",
        {
          currency: string;
          idleFeePerMinuteMinor: number;
          idleGraceMinutes: number;
          name: string;
          organizationId: string;
          pricePerKwhMinor: number;
          propertyId?: string;
          sessionFeeMinor: number;
        },
        any,
        Name
      >;
      listByOrganization: FunctionReference<
        "query",
        "internal",
        { organizationId: string },
        any,
        Name
      >;
    };
  };
