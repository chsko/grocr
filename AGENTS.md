This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

This project uses **pnpm only** (never npm, npx, yarn or bun). Run tools with `pnpm exec`, one-off CLIs with `pnpm dlx`.

```bash
pnpm exec expo install <package>  # ALWAYS use instead of pnpm add — resolves SDK-compatible versions
pnpm exec expo start              # start the dev server
pnpm exec expo lint               # lint
pnpm exec tsc --noEmit            # typecheck
pnpm exec expo-doctor             # diagnose dependency and config issues
pnpm exec expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `pnpm dlx eas-cli@latest <command>`; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `pnpm exec expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## Grocr conventions

- Dependencies: pnpm with a 7-day cooldown (`minimumReleaseAge` in `pnpm-workspace.yaml`). Don't bypass it with `minimumReleaseAgeExclude` without asking Christian. New install scripts must be allowed explicitly under `allowBuilds`.
- Run `pnpm check` before declaring a change done (format, lint, typecheck, Jest, Vitest).
- Colors come from the active palette (light or dark): `useColors()` and `makeStyles((colors) => ({...}))` from `src/lib/appearance.ts`, never hex literals. Use `tomato` for text and icons, `tomatoFill` with `onTomato` for filled buttons and checks.
- All user-facing text goes through i18next with keys in both `src/lib/i18n/locales/en.json` and `nb.json`.
- Dates are local `YYYY-MM-DD` strings in the family's timezone; use `src/lib/week.ts`.
- Convex functions: never trust client-supplied user or group ids. Load the document, then call the helpers in `convex/lib/access.ts`. Add a cross-family test in `convex/*.test.ts` for every new function.
- Grocery mutations set absolute state (never toggle), so retries and two people ticking at once are safe. The app requires a connection; there is no offline mode (decided 2026-10-24).
