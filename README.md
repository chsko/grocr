# Grocr

Family weekly dinner planner: your own recipes, a week menu, and a shared grocery list that
fills itself from the menu. iOS and Android, built with Expo and Convex.

Planning, decisions and the architecture doc live in Linear (team **Grocr**, project
**Grocr MVP**).

## Stack

- Expo SDK 58, Expo Router (routes in `src/app`), strict TypeScript, React Compiler
- Convex backend (`convex/`) with Convex Auth
- i18next with Norwegian bokmål and English (`src/lib/i18n`), following the device language
- MMKV for the offline grocery list cache (`src/features/grocery`)
- Jest + React Native Testing Library for the app, Vitest + `convex-test` for the backend

## Getting started

```sh
npm ci
npx convex dev          # signs in, creates a dev deployment and writes .env.local
npx expo run:ios        # or run:android; needs a development build (not Expo Go)
```

`EXPO_PUBLIC_CONVEX_URL` must be set (see `.env.example`); `npx convex dev` writes it for you.

## Scripts

| Command               | What it does                                             |
| --------------------- | -------------------------------------------------------- |
| `npm run check`       | Everything CI runs: format check, lint, typecheck, tests |
| `npm run format`      | Prettier                                                 |
| `npm run lint`        | ESLint (`eslint-config-expo`)                            |
| `npm run typecheck`   | `tsc` for the app and for `convex/`                      |
| `npm test`            | App tests (Jest)                                         |
| `npm run test:convex` | Backend and CI-script tests (Vitest, `convex-test`)      |

## Project layout

```
src/app/            Expo Router routes: (tabs)/week, groceries, recipes, family
src/components/     UI components
src/features/       Feature hooks and UI (grocery offline cache so far)
src/lib/            i18n, week/date helpers, storage, Convex client
convex/             schema.ts, functions per domain, lib/access.ts (membership checks)
scripts/ci/         jev CI checks
```

## Access rules

Every Convex function that takes an id loads the document first and checks that the signed-in
user is a member of the document's `groupId` (`convex/lib/access.ts`). Documents in another
family are reported as not found. Every new function needs a cross-family test.

## Workflow and CI

Changes are pushed straight to `main` (rebase on conflict). Before every push:

1. `npm run check` must pass.
2. `npm run jev:risk` asks jev (TypeSafe System One) how risky the unpushed commits are. If it says
   **high**, run an adversarial review first and add an `Adversarial-Review: <summary>` trailer to
   the commit message.

On every push to `main`, GitHub Actions runs:

- **CI**: format, lint, typecheck, Jest and Vitest.
- **jev**: re-scores the push and opens a `needs-adversarial-review` issue if a high-risk push has
  no `Adversarial-Review` trailer, and flags changed Norwegian/English string pairs that may not
  mean the same (`npm run jev:i18n` runs the same check locally).

The jev steps need the `TYPESAFE_API_KEY` Actions secret and pass with a warning if jev is
unavailable.
