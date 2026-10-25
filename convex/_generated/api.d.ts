/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as account from "../account.js";
import type * as auth from "../auth.js";
import type * as classify from "../classify.js";
import type * as devSignIn from "../devSignIn.js";
import type * as grocery from "../grocery.js";
import type * as groups from "../groups.js";
import type * as http from "../http.js";
import type * as ingredients from "../ingredients.js";
import type * as invites from "../invites.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_catalog from "../lib/catalog.js";
import type * as lib_devSignIn from "../lib/devSignIn.js";
import type * as lib_groceryRows from "../lib/groceryRows.js";
import type * as lib_inviteCode from "../lib/inviteCode.js";
import type * as lib_jev from "../lib/jev.js";
import type * as lib_merge from "../lib/merge.js";
import type * as lib_recipeIcons from "../lib/recipeIcons.js";
import type * as lib_units from "../lib/units.js";
import type * as lib_week from "../lib/week.js";
import type * as mealPlan from "../mealPlan.js";
import type * as recipes from "../recipes.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  account: typeof account;
  auth: typeof auth;
  classify: typeof classify;
  devSignIn: typeof devSignIn;
  grocery: typeof grocery;
  groups: typeof groups;
  http: typeof http;
  ingredients: typeof ingredients;
  invites: typeof invites;
  "lib/access": typeof lib_access;
  "lib/catalog": typeof lib_catalog;
  "lib/devSignIn": typeof lib_devSignIn;
  "lib/groceryRows": typeof lib_groceryRows;
  "lib/inviteCode": typeof lib_inviteCode;
  "lib/jev": typeof lib_jev;
  "lib/merge": typeof lib_merge;
  "lib/recipeIcons": typeof lib_recipeIcons;
  "lib/units": typeof lib_units;
  "lib/week": typeof lib_week;
  mealPlan: typeof mealPlan;
  recipes: typeof recipes;
  users: typeof users;
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

export declare const components: {};
