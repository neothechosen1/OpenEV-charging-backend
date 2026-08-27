/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as charging from "../charging.js";
import type * as http from "../http.js";
import type * as lib_stripeWebhook from "../lib/stripeWebhook.js";
import type * as lib_wompiWebhook from "../lib/wompiWebhook.js";
import type * as receipts from "../receipts.js";
import type * as stripe from "../stripe.js";
import type * as tools from "../tools.js";
import type * as wompi from "../wompi.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  charging: typeof charging;
  http: typeof http;
  "lib/stripeWebhook": typeof lib_stripeWebhook;
  "lib/wompiWebhook": typeof lib_wompiWebhook;
  receipts: typeof receipts;
  stripe: typeof stripe;
  tools: typeof tools;
  wompi: typeof wompi;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  evCharging: import("@openev/charging/_generated/component.js").ComponentApi<"evCharging">;
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
};
