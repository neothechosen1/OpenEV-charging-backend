/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as chargers from "../chargers.js";
import type * as commands from "../commands.js";
import type * as lib_ids from "../lib/ids.js";
import type * as lib_pricing from "../lib/pricing.js";
import type * as payments from "../payments.js";
import type * as sessions from "../sessions.js";
import type * as setup from "../setup.js";
import type * as stations from "../stations.js";
import type * as tariffs from "../tariffs.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  admin: typeof admin;
  chargers: typeof chargers;
  commands: typeof commands;
  "lib/ids": typeof lib_ids;
  "lib/pricing": typeof lib_pricing;
  payments: typeof payments;
  sessions: typeof sessions;
  setup: typeof setup;
  stations: typeof stations;
  tariffs: typeof tariffs;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {};
