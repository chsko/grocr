# Grocr

Family weekly dinner planner: your own recipes, a week menu, and a shared grocery list that
fills itself from the menu. iOS and Android, built with Expo and Convex.

Planning, decisions and the architecture doc live in Linear (team **Grocr**, project
**Grocr MVP**).

## Stack

- Expo SDK 58, Expo Router (routes in `src/app`), strict TypeScript, React Compiler
- Convex backend (`convex/`) with Convex Auth
- i18next with Norwegian bokmål and English (`src/lib/i18n`), following the device language
- Jest + React Native Testing Library for the app, Vitest + `convex-test` for the backend

## Getting started

Grocr uses pnpm only (version pinned in `package.json`; `corepack enable` picks it up). Never npm.
`pnpm-workspace.yaml` sets a 7-day dependency cooldown and blocks install scripts except esbuild.

```sh
pnpm install
pnpm go                 # starts Expo for Expo Go; scan the QR code with your iPhone camera
```

The app runs in Expo Go for now (Expo Go must be on the same SDK, 58). `pnpm start` targets a
development build instead (`expo-dev-client`), which native Google/Apple sign-in will need later.

The committed `.env` points the app at the shared dev deployment (`silent-otter-909`, Convex
project **grocr**). `pnpm exec convex dev` gives you your own deployment in `.env.local`, which wins.
Convex Auth on the deployment needs `JWT_PRIVATE_KEY`, `JWKS` and `SITE_URL` (`grocr://`); they
are set on the dev deployment. Production has no deployment yet.

## Open it on a phone without a computer (EAS Update)

Every push to `main` publishes the JavaScript to EAS Update on the `main` channel. This runs on
Expo's servers (`.eas/workflows/publish-update.yml`, through the GitHub connection on expo.dev).
The runtime version follows the SDK (`exposdk:58.0.0`), so Expo Go can open it: on the iPhone,
open `exp://u.expo.dev/597e5728-3ace-4f42-9a7a-3199f175b48e?runtime-version=exposdk:58.0.0&channel-name=main`
(or the QR code for the update on expo.dev). Native changes (new native modules, plugins,
permissions) need a module Expo Go already bundles, or a development build.

## Scripts

| Command            | What it does                                             |
| ------------------ | -------------------------------------------------------- |
| `pnpm check`       | Everything CI runs: format check, lint, typecheck, tests |
| `pnpm format`      | Prettier                                                 |
| `pnpm lint`        | ESLint (`eslint-config-expo`)                            |
| `pnpm typecheck`   | `tsc` for the app and for `convex/`                      |
| `pnpm test`        | App tests (Jest)                                         |
| `pnpm test:convex` | Backend and CI-script tests (Vitest, `convex-test`)      |

## Project layout

```
src/app/            Expo Router routes: (tabs)/week, groceries, recipes, family
src/components/     UI components
src/lib/            i18n, week/date helpers, Convex client
convex/             schema.ts, functions per domain, lib/access.ts (membership checks)
scripts/jev/        jev (TypeSafe System One) helpers
```

## Access rules

Every Convex function that takes an id loads the document first and checks that the signed-in
user is a member of the document's `groupId` (`convex/lib/access.ts`). Documents in another
family are reported as not found. Every new function needs a cross-family test.

## Workflow and CI

Changes are pushed straight to `main` (rebase on conflict). Before every push:

1. `pnpm check` must pass.
2. `pnpm jev:risk` asks jev (TypeSafe System One) how risky the unpushed commits are. If it says
   **high**, run an adversarial review first and add an `Adversarial-Review: <summary>` trailer to
   the commit message.

On every push to `main`, GitHub Actions runs **CI**: format, lint, typecheck, Jest and Vitest.

jev runs locally only and needs `TYPESAFE_API_KEY` in the environment. Besides `jev:risk`:

- `pnpm jev:i18n` asks whether changed Norwegian/English string pairs mean the same.
- `pnpm jev <state> <questions>` asks jev anything, e.g. to weigh a design or product choice
  (see `scripts/jev/ask.mjs`).
