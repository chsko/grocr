# Grocr: Product & UX plan

> Moved from the Linear document "Grocr: Product & UX plan" on 2026-11-07 (last edited there
> 2026-10-24). This is the original planning doc and is kept as history. Later decisions live in
> GitHub issues, [`docs/adr/`](adr/) and [`GLOSSARY.md`](../GLOSSARY.md). Notable changes since:
> offline support was dropped (no offline mode, 2026-10-24), the domain is grocr.io (not
> grocr.com), and the week start day is a family setting (GRO-72, ADR 0001).

Status: v0.2. Decided by Christian on 2026-10-24: offline scope, product rules and one grocery list per week (see §7); the rest is recommendation. Companion doc: [Architecture & data model](architecture.md).

## 1. Problem and goal

Families decide "what's for dinner" every day and shop several times a week. Grocr lets a family keep its own dinner recipes in one place, plan the coming week from them, and get a grocery list that fills itself in. Everyone in the family sees the same planner and the same list, live.

**Core loop:** add own recipes → pick dinners for the week → ingredients land on the shared grocery list → someone shops and ticks items off → everyone sees it instantly.

## 2. Users

| Who                              | Main jobs                                                           |
| -------------------------------- | ------------------------------------------------------------------- |
| The planner (usually one parent) | Maintains recipes, plans the week, reviews the list before shopping |
| Other adults                     | Add/swap dinners, add ad-hoc items ("we're out of coffee"), shop    |
| Teens / older kids               | See what's for dinner, add requests, help shop                      |

## 3. MVP scope

**In:**

- Sign in with Google and Sign in with Apple, on both platforms (see §6.1).
- Create a group ("family"), invite members, join by invite only.
- Recipes: title, servings, structured ingredients, steps, owned by the group. Archive instead of delete.
- Week menu: one dinner slot per day, from a recipe or a free-text note ("leftovers", "pizza night").
- Grocery list: ingredients from planned dinners added automatically and merged; manual items (via the same ingredient autocomplete); check off; grouped by store section; last-seen list readable offline.
- Real-time sync for everything above.
- Account deletion in-app, plus a web page to request deletion (Google Play requires both).
- Members: remove member, leave group, owner transfer.

**v1.1 (cut from MVP to keep it small):** recipe photos, tags, "Unscheduled this week" row, staples, copy last week, multi-group UI, smart ingredient matching with jev.

**Later:** import recipe from URL, recipe suggestions/rotation ("haven't had this in 4 weeks"), pantry tracking, nutrition, breakfast/lunch slots, multiple lists per store, push notifications ("Dad added 3 items"), web app, sharing recipes between groups.

## 4. Key user flows

1. **First run:** Sign in → "Create a family" or "I have an invite" → (create) name the group → empty-state prompts to add the first 3 recipes.
2. **Invite:** Family screen → "Invite" → share sheet with a link (`grocr.com/join/<token>`) that opens the app if installed; otherwise the web page shows a short invite code and store links → invitee installs, signs in, and types the code under "I have an invite" → sees group name and inviter → "Join". The token is saved before the sign-in round trip so it survives it. Links are single-use and expire after 48 hours by default; the owner sees who joined and can remove them.
3. **Add recipe:** Recipes tab → "+" → title, servings → ingredients (one row each: quantity, unit, name, with autocomplete from the family's ingredient list) → steps → save.
4. **Plan the week:** Week tab → tap a day → pick from recipe list (search, "recently cooked") → optionally change servings → ingredients appear on the grocery list with a small "from Tacos (Tue)" tag.
5. **Shop:** Groceries tab opens next week's list Friday to Sunday, otherwise this week's (with a This week / Next week switcher) → items grouped by section (Produce, Dairy, ...) → tap to check → checked items fall to a collapsed "In cart" group → "Clear checked" when done.
6. **Change of plans:** remove Tuesday's dinner → its unchecked ingredients leave the list (checked ones and manually edited ones stay, turned into manual items).

## 5. Design alternatives

### 5.1 Navigation

| Option                         | Description                                                                | Pros                                                           | Cons                                                          |
| ------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| **A. Four tabs (recommended)** | Week · Groceries · Recipes · Family                                        | Familiar; each core job is one tap away; matches the core loop | Four tabs on a small app can feel heavy at first              |
| B. Week-centric home           | Single home = this week; groceries and recipes are pushed screens / sheets | Very focused, fewer screens                                    | Groceries (the in-store screen) is buried; bad while shopping |
| C. Two tabs (Plan, Shop)       | Plan = week + recipes; Shop = list                                         | Simple mental model                                            | Recipes management gets cramped inside Plan                   |

**Recommendation: A.** Always open on Week in v1; revisit smarter start screens later.

### 5.2 Week menu shape

| Option                                              | Description                                                      | Pros                                                                   | Cons                                    |
| --------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------- |
| **A. Calendar weeks with dated days (recommended)** | Mon–Sun (week start configurable per group), one dinner per date | Clear "what's on Tuesday"; history for free; supports "copy last week" | Slightly more UI than a list            |
| B. Unordered "this week's dinners" list             | Pick 5–7 dinners, cook in any order                              | Flexible, matches how some families actually cook                      | No "what's tonight"; weak history       |
| C. Rolling next 7 days                              | Always today + 6                                                 | No week boundary to think about                                        | Confusing with a weekly shopping rhythm |

**Recommendation: A.** In v1.1, add an "Unscheduled this week" row for dinners bought for but not assigned to a day (gives B's flexibility).

### 5.3 How the grocery list is built

| Option                                                  | Description                                                                                                                                         | Pros                                                                                             | Cons                                                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| A. Fully derived                                        | List is computed on read from the menu + manual items + a table of check-marks                                                                      | Never out of sync                                                                                | Editing a derived line ("only need 1 onion, we have one") gets awkward; complex queries |
| **B. Materialized lines with provenance (recommended)** | Planning a dinner inserts one list line per ingredient, each remembering which menu entry it came from. Display merges lines of the same ingredient | Simple to edit, check and delete per line; un-planning removes exactly its lines; easy real-time | Must handle recipe edits after planning (see below)                                     |
| C. Snapshot on demand                                   | "Generate list" button builds the list from the week                                                                                                | Very simple, user in control                                                                     | Not "automatic" as requested; stale lists                                               |

**Recommendation: B.** Rules (one place, mirrored in the architecture doc):

- Un-planning a dinner deletes its lines that are **unchecked and unedited**. Edited or checked lines stay and become manual items.
- Editing a recipe updates unchecked, unedited lines of planned entries dated **today or later** in the family's timezone. New ingredients create new lines.
- Changing servings rescales unchecked, unedited lines. If lines were already checked and servings go up, a new line for the extra amount is added, so nothing is silently under-bought.
- **Editing a merged line** ("3 onions" → "1 onion") marks every line behind it as edited, puts the new amount on one line and removes the others. Rescaling and recipe sync then leave it alone.
- Archiving a recipe leaves already planned dinners and their lines untouched.
- **One grocery list per week (decided).** Each calendar week has its own list; a planned dinner's lines go to the list of the week it is planned in. Manual items go to the list currently shown. Weeks start on Monday by default (configurable per family). The family shops the weekend before the week (decided), so the Groceries tab opens on **next week's list from Friday to Sunday** and on this week's list otherwise, with a This week / Next week switcher. When a new week starts and last week's list still has unchecked items, the app offers "Move N unchecked items to this week" (one tap, or dismiss). Past weeks stay viewable as history.

### 5.4 Merging ingredients on the list

"2 onions" (tacos) + "1 onion" (soup) should show as **3 onions**, with both sources visible on tap.

| Option                                                                   | Pros                                                                                                                                   | Cons                                                                                                    |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **A. Family ingredient catalog + unit conversion (recommended for MVP)** | Deterministic, offline, predictable; autocomplete makes recipes consistent                                                             | Users must pick catalog items; "milk" vs "whole milk" stays separate unless merged by hand              |
| B. A + jev matching (v1.1)                                               | jev suggests whether a new ingredient name matches an existing catalog item and which store section it belongs to; API access verified | Network call, probabilistic; thresholds must be calibrated on real data before auto-linking; needs undo |
| C. Free text, no merging                                                 | Trivial                                                                                                                                | Duplicate lines; poor shopping experience                                                               |

Unit rules (kept small for v1): same ingredient and same unit → sum. Metric mass (g/kg) and volume (ml/dl/l) convert within their family ("2 dl + 300 ml milk" → "5 dl milk"). Spoons, pieces, cans and anything else are never converted; different units are shown side by side ("1 can + 200 g tomatoes"). Scaled amounts round to sensible steps (whole eggs, quarter cans). When in doubt, show unmerged rather than merge wrongly. A "merge these two ingredients" action in the catalog rewrites recipes and list lines.

### 5.5 Staples

Salt, oil, pepper should not land on every list. **Recommendation (v1.1):** catalog items can be marked "staple"; staples go under a collapsed "Check you have" group instead of the main list.

### 5.6 Recipe ingredients input

| Option                                                                       | Pros                        | Cons                                                      |
| ---------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------- |
| **A. Structured rows (qty, unit, name), paste-to-split later (recommended)** | Enables merging and scaling | Slower to type                                            |
| B. Free-text lines parsed later                                              | Fast entry                  | Parsing errors surface at shopping time, the worst moment |

## 6. Constraints that shape the design

1. **iOS needs a privacy-preserving login option** next to Google (App Store Review Guideline 4.8). Sign in with Apple is the simplest way to meet it. Offer Apple on Android too (web flow), otherwise a parent who signed up with Apple on an iPhone, possibly with a hidden relay email, is locked out on an Android tablet.
2. **Account deletion** must be available in-app, and Google Play also requires a web deletion-request page. Apple requires revoking Sign in with Apple tokens on deletion. If the owner deletes their account, ownership passes to the longest-standing member.
3. **Shopping happens with poor reception.** The biggest risk is opening the app in the store with no signal and seeing a blank list. Checking items off must feel instant and must not be lost. This drives the offline discussion in the architecture doc.
4. Invite links need universal links (iOS) / app links (Android) and a small web page (invite code fallback + account deletion request), on **grocr.com** (decided; later changed to grocr.io).

## 7. Open product questions

1. ~~Offline scope~~ **Decided:** see the last-synced list and tick items offline, synced when back online. No full offline editing. _(Reversed 2026-10-24: no offline support for now.)_
2. ~~Recipe ownership~~ **Decided:** recipes belong to the family group.
3. ~~Multiple groups~~ **Decided:** one family per person in the v1 UI; schema allows more; switcher in v1.1.
4. ~~Roles~~ **Decided:** owner manages members; everyone edits recipes, menu and lists.
5. ~~Language~~ **Decided:** Norwegian (bokmål) and English, following the device language, with i18n from the first screen. Metric units.
6. ~~List per week?~~ **Decided:** one list per week (see §5.3).
