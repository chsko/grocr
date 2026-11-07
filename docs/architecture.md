# Grocr: Architecture & data model

> Moved from the Linear document "Grocr: Architecture & data model" on 2026-11-07 (last edited
> there 2026-10-24). This is the original planning doc and is kept as history; the code in
> `convex/` and `src/` is the source of truth, and later decisions live in GitHub issues and
> [`docs/adr/`](adr/). Notable changes since: no offline mode (MMKV cache removed, the app runs in
> Expo Go), jev runs locally instead of in CI, routes live in `src/app`, the site lives in `site/`,
> and the domain is grocr.io.

Status: v0.3. Decided by Christian on 2026-10-24: Convex with cached offline list, Convex Auth, one grocery list per week, Norwegian + English, grocr.com, jev in CI. The rest is recommendation. Companion doc: [Product & UX plan](product-ux-plan.md).

## 1. Stack (latest versions checked on npm, 2026-10-24)

| Layer           | Choice                                                                                                                              | Version                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| App framework   | Expo (managed, with dev builds; not Expo Go, because native Google/Apple sign-in needs native modules)                              | SDK 58 (`expo` 58.0.x, `react-native` 0.88) |
| Navigation      | Expo Router (file-based, typed routes, deep links for invites)                                                                      | 58.0.x                                      |
| Backend         | **Convex (decided)**                                                                                                                | `convex` 1.48                               |
| Auth            | **Convex Auth (decided)**, Google + Apple OAuth                                                                                     | `@convex-dev/auth` 0.0.96                   |
| Language        | TypeScript, strict, shared types end-to-end via Convex codegen                                                                      |                                             |
| Builds/releases | EAS Build, EAS Submit (EAS Update later)                                                                                            |                                             |
| Tests           | Jest + React Native Testing Library (app), `convex-test` (backend functions, incl. cross-group access tests); Maestro E2E after MVP |                                             |
| Lint/format     | ESLint (`eslint-config-expo`, flat config) + Prettier, `tsc --noEmit` in CI                                                         |                                             |
| CI              | GitHub Actions: typecheck, lint, unit tests on every PR; EAS build on main                                                          |                                             |

## 2. Backend alternatives

The hard requirements are: shared state per family, real-time updates, invite-only access, Google sign-in, and a grocery list that keeps working with poor reception.

|                               | **Convex**                                                       | Supabase                                                  | Firebase (Firestore)                               | InstantDB                             |
| ----------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------- | ------------------------------------- |
| Real-time                     | Built in: every query is a live subscription                     | Postgres change streams; you wire subscriptions per table | Built in                                           | Built in                              |
| Offline                       | Optimistic updates; no persistent offline cache out of the box   | None built in (add PowerSync/Electric)                    | **Best: persistent offline cache built in**        | Local-first, offline built in         |
| Data model                    | Document DB with schema, indexes, ACID transactions              | Relational (Postgres), strongest querying                 | NoSQL documents, denormalization needed            | Relational-ish triples, graph queries |
| Access control                | In code: every function checks membership (testable TypeScript)  | Row-level security policies in SQL                        | Security rules language                            | Permission rules language             |
| Dev experience                | TypeScript end-to-end, generated types, local dev, `convex-test` | Good; SQL migrations, more moving parts                   | Mature; React Native Firebase needs config plugins | Very fast to start; youngest platform |
| Server logic (e.g. jev calls) | Actions + scheduled functions, same codebase                     | Edge functions (Deno)                                     | Cloud Functions                                    | Limited; needs a separate server      |
| Lock-in / maturity            | Proprietary hosted (open-source self-host option exists)         | Open source, portable Postgres                            | Google proprietary                                 | Young, open source                    |
| Cost at family scale          | Free tier ample                                                  | Free tier ample (projects pause when idle)                | Free tier ample                                    | Free tier ample                       |

**Decision (2026-10-24): Convex**, with offline = cached list viewable and tickable offline, synced on reconnect (GRO-10, #11). It gives real-time sync and transactional writes (important when two people edit the list at once) with the least code, keeps all logic in one TypeScript codebase, and makes access control unit-testable.

Its weak spot is offline, and the gap is specific: while the app stays open, the Convex client already keeps unsent mutations and resends them on reconnect. What it lacks is a saved copy of query results, so **opening the app with no signal shows an empty list**. Mitigation for v1 (validated in a spike before building features): save the last grocery list and week to device storage (MMKV) and show it read-only-plus-check-off while offline; make every list mutation idempotent so resending is safe. A persisted mutation queue that survives the app being killed is added only if the spike shows it matters. If Christian says full offline editing is a hard v1 requirement, **InstantDB** or **Firebase** become the stronger choices and this recommendation should be revisited before any code is written.

## 3. Authentication

Google and Apple sign-in on both platforms (Apple satisfies App Store Guideline 4.8 and avoids lock-out in mixed iPhone/Android families).

| Option                                               | Pros                                                                                                                                                      | Cons                                                                                                                                                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Clerk + Convex                                    | First-party Expo SDK with native Google and Apple sign-in, Apple on Android via web flow; official Convex integration (JWT); session handling done for us | A third vendor; user records live in Clerk and must be mirrored; we still build Convex-side deletion cleanup and must verify Apple token revocation                                                                 |
| **B. Convex Auth (decided 2026-10-24,** GRO-11, #12) | Everything in Convex, no extra vendor, no extra cost; account deletion is plain Convex code                                                               | Still pre-1.0 (0.0.96); Google/Apple on Expo use a browser-based OAuth redirect (expo-auth-session / expo-web-browser) rather than native buttons; we build deep-link handling and Apple token revocation ourselves |
| C. Better Auth (Convex component)                    | Open source, data in our DB                                                                                                                               | More setup; younger React Native story                                                                                                                                                                              |

## 4. Data model (Convex schema sketch)

All content tables carry `groupId`. Every query/mutation that takes a document id **loads the document first and checks membership against its stored** `groupId` (helper `requireMemberOf(ctx, doc)`), and verifies that every referenced id (recipe, ingredient, grocery row) belongs to the same group. No client-supplied user or group ids are trusted. `convex-test` suites include cross-group access attempts.

Users and sessions are Convex Auth's own `authTables` (`users`, `authAccounts`, `authSessions`, ...); app profile fields extend its `users` table, so no mirroring is needed.

```ts
users:        { name, email, image, ... }   // Convex Auth users table, extended with app fields
groups:       { name, ownerId, weekStartsOn: 0..6, timezone, createdAt }
memberships:  { groupId, userId, role: "owner" | "member", joinedAt }  // index by_user, by_group, by_group_user
invites:      { groupId, tokenHash, shortCode, createdBy, email?, expiresAt,
                maxUses /* default 1 */, uses, revokedAt? }             // index by_tokenHash, by_shortCode, by_group

ingredients:  { groupId, name, normalizedName, section, defaultUnit?,
                isStaple /* v1.1 */, aliases: string[] }               // index by_group_normalizedName
recipes:      { groupId, title, servings, steps: string[], tags: string[],
                imageStorageId? /* v1.1 */, sourceUrl?, createdBy, updatedAt, archivedAt?,
                ingredients: Array<{ ingredientId, qty?, unit?, note? }> }  // index by_group, search index on title

mealPlanEntries: { groupId, date: "YYYY-MM-DD", slot: "dinner",
                   recipeId?, freeText?, servings, addedBy, createdAt }  // index by_group_date (weeks = date-range queries)

groceryLists: { groupId, startDate: "YYYY-MM-DD", endDate: "YYYY-MM-DD",
                carryOverDismissed?: boolean }                          // index by_group_startDate; one per group per week

groceryItems: { groupId, listId, ingredientId?, name, qty?, unit?, section,
                checked, checkedBy?, checkedAt?, edited: boolean,
                source: { kind: "meal", mealPlanEntryId, recipeId } | { kind: "manual", addedBy },
                createdAt }                                             // index by_list, by_entry
```

Notes:

- **Recipe ingredients are embedded** in the recipe document (always read together, small). The catalog (`ingredients`) is per group so each family builds its own vocabulary and sections.
- **Grocery lines are one row per source** (materialized with provenance). The UI groups rows by `ingredientId` (or normalized name) and sums convertible units. This keeps un-planning and per-line check-off trivial and avoids lost updates when two people tick different sources of "onion" at once. Checking a merged row checks all its rows in one mutation.
- **One grocery list per week (decided 2026-10-24,** GRO-12, #13). A `groceryLists` row is created lazily for a week the first time something is added to it. Each list stores its own `startDate`/`endDate`, so changing the group's week start only affects lists created afterwards; a meal entry's rows go to the list whose range contains its date (created if missing). Merging happens within a list only. _(Superseded by [ADR 0001](adr/0001-realign-grocery-lists-on-week-start-change.md): existing lists now move when the week start changes.)_
- **Invites** store only a hash of a random 128-bit token; the link carries the token. A short human-typable code is the fallback when the link is lost during install or sign-in (the app saves the token before starting sign-in). Default: single use, 48 hour expiry, revocable, optionally email-bound. `invites.accept` is rate-limited.
- **Dates** are stored as local calendar dates (strings) in the group's timezone, so "Tuesday" never shifts across DST or travel. Weeks are date-range queries, so changing the group's week start needs no migration. "Today" on the server is always computed from `group.timezone`.
- **Account deletion** (in-app button, one Convex mutation) deletes the Convex Auth user, accounts and sessions, removes memberships, anonymizes `addedBy`/`createdBy`, transfers ownership to the longest-standing member, and deletes the group if they were the last member. Sign in with Apple tokens must be revoked by calling Apple's revoke endpoint from a Convex action.

## 5. Key backend operations

| Operation                                                      | Behavior                                                                                                                                                         |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mealPlan.add(groupId, date, recipeId, servings)`              | Inserts the entry and, in the same transaction, one grocery row per recipe ingredient (scaled by servings) on the list for that date's week (created if missing) |
| `mealPlan.remove(entryId)`                                     | Deletes the entry and its grocery rows where `checked = false and edited = false`; remaining rows become `source.kind = "manual"`                                |
| `mealPlan.setServings`                                         | Rescales its unedited, unchecked rows; if checked rows exist and servings increased, adds a delta row                                                            |
| `recipes.update`                                               | Updates recipe; re-syncs unedited, unchecked rows of entries dated today or later (group timezone); new ingredients add rows                                     |
| `recipes.archive`                                              | Archive only; planned entries and their rows are untouched                                                                                                       |
| `grocery.setChecked(rowIds[], checked)`                        | Sets (never flips) the state of all rows behind a merged line; idempotent, safe to resend                                                                        |
| `grocery.editMerged(rowIds[], qty, unit)`                      | Marks all rows edited, keeps the new amount on one row, deletes the others                                                                                       |
| `grocery.addManual(listId, ingredientId or name, qty?, unit?)` | Adds to the list being viewed; goes through catalog autocomplete so manual items merge too; idempotent via client-generated id                                   |
| `grocery.carryOver(fromListId, toListId)`                      | Moves unchecked rows from last week's list to this week's (they become manual rows); or `dismissCarryOver`                                                       |
| `grocery.clearChecked(listId)`                                 | Deletes checked rows on that list                                                                                                                                |
| `ingredients.merge(fromId, intoId)`                            | Rewrites recipe ingredients and grocery rows, adds alias                                                                                                         |
| `invites.create / accept / revoke`                             | Accept is idempotent and rate-limited; validates hash or short code, expiry, uses; creates membership                                                            |
| `members.remove / groups.leave / groups.transferOwnership`     | Owner removes members; anyone can leave; last owner leaving transfers ownership                                                                                  |

## 6. jev (TypeSafe System One) usage

Credentials verified on 2026-10-24: `TYPESAFE_API_KEY` works against `POST https://api.typesafe.ai/v1/systemone` (schema at `https://api.typesafe.ai/openapi.json`). Example test: "2 dl milk" vs "200 ml whole milk", question type `noul` ("same grocery product?") returned 0.8.

jev is **not** in the MVP. Planned uses (v1.1 epic, behind a flag):

1. **Ingredient matching:** when a user types a new ingredient name, ask jev (`noul`) whether it matches the top 3 lexical candidates in the catalog and _suggest_ the match. Thresholds for any automatic linking must first be calibrated on a labelled set of real ingredient pairs (the single test above scored 0.8 for a pair that arguably are different products).
2. **Store section:** `choice` question over the fixed section list (Produce, Dairy, Meat & fish, Bakery, Dry goods, Frozen, Household, Other).
3. **Paste-to-split recipe import:** `choice`/`noul` to clean up unit and name parsing.

Rules: the API key lives only in Convex environment variables and is used only from a Convex action (`ingredients.classify`); results are cached on the catalog item so each name is classified once; the app always works without jev.

**Development workflow (decided 2026-10-24,** GRO-14, #15**):** jev runs in CI (key as a GitHub Actions secret) for (1) a PR risk `score` that requires the adversarial review on high-risk PRs and (2) a `noul` check that Norwegian and English strings mean the same. Both fail open while thresholds are calibrated. _(Changed the same day: no jev workflow in GitHub Actions; jev runs locally via `scripts/jev`.)_

## 7. Real-time and conflict handling

- Convex queries are reactive: Week, Groceries and Recipes screens subscribe and re-render on any member's change.
- Mutations are serializable transactions, and list mutations set absolute state rather than toggling, so "two people tick the same item", resent mutations after reconnect, or "remove dinner while someone ticks its onion" all resolve correctly (a checked row is never auto-deleted).
- Optimistic updates for check-off and add-item so the UI responds instantly.

## 8. Project structure (proposal)

```
grocr/
  app/              # expo-router routes: (auth), (tabs)/week, groceries, recipes, family, join/[token]
  web/              # static site: invite fallback (short code + store links), account deletion request, privacy policy
  src/components/   # UI components
  src/features/     # recipes, mealplan, grocery, groups (hooks + UI per feature)
  src/lib/units.ts  # unit parsing/conversion (pure, heavily unit-tested)
  convex/           # schema.ts, functions per domain, auth.config.ts, lib/access.ts
  e2e/              # Maestro flows (after MVP)
```

_(As built: routes are in `src/app/`, the site is in `site/`.)_

## 9. Risks

| Risk                                             | Mitigation                                                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Blank list when opening the app offline in store | Spike in Foundations epic: cached list + idempotent mutations; revisit backend if full offline editing is required |
| Sign in with Apple forgotten until review        | In auth epic from day one                                                                                          |
| Unit merging edge cases                          | Pure, table-driven tested module; only mass/volume convert; show unmerged rather than merge wrongly                |
| Cross-family data access via document ids        | Load-then-check helper on every function; cross-group tests in CI                                                  |
| Invite links leaking via forwarding              | Single-use, 48h default; owner sees and can remove new members                                                     |
| Convex Auth pre-1.0                              | Pin the version, keep auth code behind a thin wrapper, cover sign-in flows with tests; Clerk remains the fallback  |
| Invite link handling needs a domain              | Pick a domain early; simple static fallback page                                                                   |

## 10. Review log

- 2026-10-24: adversarial review of v0.1. Accepted and applied: idempotent `setChecked` instead of toggle; offline mitigation retargeted at "blank list on cold start"; rule for editing merged lines; load-then-check access control on document ids; account deletion details (Play web page, Apple token revocation, owner transfer); Apple sign-in on Android; stricter invite defaults plus short-code fallback; timezone-aware "today"; delta rows on servings increase; date-range weeks instead of stored `weekStart`; recipe archive and catalog merge ops; MVP trimmed; jev moved to v1.1; idempotent `users.ensure`; restricted unit conversion.
- 2026-10-24: Christian decided Convex backend with cached offline list (GRO-10, #11) and Convex Auth instead of Clerk (GRO-11, #12). `users.ensure` / Clerk webhook no longer needed.
- 2026-10-24: Christian decided one grocery list per week (GRO-12, #13); added `groceryLists`, `listId` on rows, carry-over of unchecked items.
