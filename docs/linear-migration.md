# Linear to GitHub issue map

On 2026-11-07 every issue in the Linear team **Grocr** (project **Grocr MVP**, plus GRO-52 which had no project) moved to GitHub Issues, and the two Linear documents moved to [`product-ux-plan.md`](product-ux-plan.md) and [`architecture.md`](architecture.md). The Linear issues were archived afterwards. Old commits, memory notes and docs still say `GRO-<n>`; use this table to find the issue. Each issue title also ends in `(GRO-<n>)`, so searching for the id works too.

Done issues are closed as completed and canceled ones as not planned. Open issues carry `status: backlog` (GRO-40 was In Progress). Linear priorities became `priority: ...` labels, epics have the `epic` label with their children as sub-issues, and Linear comments are copied into each issue body.

| Linear | GitHub                                          | Title                                                                                  | Linear state |
| ------ | ----------------------------------------------- | -------------------------------------------------------------------------------------- | ------------ |
| GRO-1  | [#2](https://github.com/chsko/grocr/issues/2)   | Epic: Decisions to unblock the build                                                   | Done         |
| GRO-2  | [#3](https://github.com/chsko/grocr/issues/3)   | Epic: Foundations (repo, backend, CI, offline spike)                                   | Done         |
| GRO-3  | [#4](https://github.com/chsko/grocr/issues/4)   | Epic: Sign-in and accounts                                                             | Done         |
| GRO-4  | [#5](https://github.com/chsko/grocr/issues/5)   | Epic: Family groups and invites                                                        | Done         |
| GRO-5  | [#6](https://github.com/chsko/grocr/issues/6)   | Epic: Recipes and ingredient catalog                                                   | Done         |
| GRO-6  | [#7](https://github.com/chsko/grocr/issues/7)   | Epic: Week menu                                                                        | Done         |
| GRO-7  | [#8](https://github.com/chsko/grocr/issues/8)   | Epic: Shared grocery list                                                              | Done         |
| GRO-8  | [#9](https://github.com/chsko/grocr/issues/9)   | Epic: Release readiness                                                                | Backlog      |
| GRO-9  | [#10](https://github.com/chsko/grocr/issues/10) | Epic: v1.1 smart ingredients and extras                                                | Backlog      |
| GRO-10 | [#11](https://github.com/chsko/grocr/issues/11) | Decide offline requirement for shopping                                                | Done         |
| GRO-11 | [#12](https://github.com/chsko/grocr/issues/12) | Decide backend and auth provider                                                       | Done         |
| GRO-12 | [#13](https://github.com/chsko/grocr/issues/13) | Decide product rules: ownership, roles, groups, list                                   | Done         |
| GRO-13 | [#14](https://github.com/chsko/grocr/issues/14) | Decide app language(s), units, app name and domain                                     | Done         |
| GRO-14 | [#15](https://github.com/chsko/grocr/issues/15) | Define how jev fits the development workflow                                           | Done         |
| GRO-15 | [#16](https://github.com/chsko/grocr/issues/16) | Scaffold Expo app with Expo Router and TypeScript                                      | Done         |
| GRO-16 | [#17](https://github.com/chsko/grocr/issues/17) | Set up Convex project, schema and access helper                                        | Done         |
| GRO-17 | [#18](https://github.com/chsko/grocr/issues/18) | Lint, format, typecheck and tests in CI                                                | Done         |
| GRO-18 | [#19](https://github.com/chsko/grocr/issues/19) | Spike: offline grocery list on cold start                                              | Canceled     |
| GRO-19 | [#20](https://github.com/chsko/grocr/issues/20) | Set up EAS Build profiles                                                              | Done         |
| GRO-20 | [#21](https://github.com/chsko/grocr/issues/21) | Google sign-in on iOS and Android                                                      | Done         |
| GRO-21 | [#22](https://github.com/chsko/grocr/issues/22) | Sign in with Apple on iOS and Android                                                  | Done         |
| GRO-22 | [#23](https://github.com/chsko/grocr/issues/23) | Set up Convex Auth and user profile                                                    | Done         |
| GRO-23 | [#24](https://github.com/chsko/grocr/issues/24) | In-app account deletion                                                                | Done         |
| GRO-24 | [#25](https://github.com/chsko/grocr/issues/25) | Create family group and first-run onboarding                                           | Done         |
| GRO-25 | [#26](https://github.com/chsko/grocr/issues/26) | Invite links and short codes                                                           | Done         |
| GRO-26 | [#27](https://github.com/chsko/grocr/issues/27) | Family screen: members, remove, leave, transfer ownership                              | Done         |
| GRO-27 | [#28](https://github.com/chsko/grocr/issues/28) | Cross-group access control tests                                                       | Done         |
| GRO-28 | [#29](https://github.com/chsko/grocr/issues/29) | Ingredient catalog with autocomplete                                                   | Done         |
| GRO-29 | [#30](https://github.com/chsko/grocr/issues/30) | Recipe create and edit                                                                 | Done         |
| GRO-30 | [#31](https://github.com/chsko/grocr/issues/31) | Recipe list, search and detail                                                         | Done         |
| GRO-31 | [#32](https://github.com/chsko/grocr/issues/32) | Merge two catalog ingredients                                                          | Done         |
| GRO-32 | [#33](https://github.com/chsko/grocr/issues/33) | Week view with dinner per day                                                          | Done         |
| GRO-33 | [#34](https://github.com/chsko/grocr/issues/34) | Plan, change and remove a dinner                                                       | Done         |
| GRO-34 | [#35](https://github.com/chsko/grocr/issues/35) | Unit parsing, conversion, scaling and merge module                                     | Done         |
| GRO-35 | [#36](https://github.com/chsko/grocr/issues/36) | Auto-add and sync grocery lines from the week menu                                     | Done         |
| GRO-36 | [#37](https://github.com/chsko/grocr/issues/37) | Weekly grocery list screen with merged lines and check-off                             | Done         |
| GRO-37 | [#38](https://github.com/chsko/grocr/issues/38) | Manual items and editing merged lines                                                  | Done         |
| GRO-38 | [#39](https://github.com/chsko/grocr/issues/39) | Offline cache for grocery list and week                                                | Canceled     |
| GRO-39 | [#40](https://github.com/chsko/grocr/issues/40) | Web pages: invite fallback, deletion request, privacy policy                           | Done         |
| GRO-40 | [#73](https://github.com/chsko/grocr/issues/73) | TestFlight and Play internal testing release                                           | In Progress  |
| GRO-41 | [#41](https://github.com/chsko/grocr/issues/41) | jev ingredient match suggestions                                                       | Backlog      |
| GRO-42 | [#42](https://github.com/chsko/grocr/issues/42) | Staples, photos, tags, unscheduled dinners, copy last week                             | Backlog      |
| GRO-43 | [#43](https://github.com/chsko/grocr/issues/43) | Multi-group UI and group switcher                                                      | Backlog      |
| GRO-44 | [#44](https://github.com/chsko/grocr/issues/44) | Set up i18n for Norwegian and English                                                  | Done         |
| GRO-45 | [#45](https://github.com/chsko/grocr/issues/45) | CI: jev PR risk score gates adversarial review                                         | Canceled     |
| GRO-46 | [#46](https://github.com/chsko/grocr/issues/46) | CI: jev translation consistency check (nb/en)                                          | Canceled     |
| GRO-47 | [#47](https://github.com/chsko/grocr/issues/47) | Dark mode                                                                              | Done         |
| GRO-48 | [#48](https://github.com/chsko/grocr/issues/48) | Fix layout shifts on Week, Groceries and Recipes; slide weeks in                       | Done         |
| GRO-49 | [#49](https://github.com/chsko/grocr/issues/49) | Get started tour on first use                                                          | Done         |
| GRO-50 | [#50](https://github.com/chsko/grocr/issues/50) | Subtle transitions when switching tabs                                                 | Canceled     |
| GRO-51 | [#51](https://github.com/chsko/grocr/issues/51) | Families define their own grocery sections, and jev sorts into them                    | Done         |
| GRO-52 | [#52](https://github.com/chsko/grocr/issues/52) | Plan: 5 NOK/month family subscription at store launch                                  | Backlog      |
| GRO-53 | [#53](https://github.com/chsko/grocr/issues/53) | Mark grocery items as "at home" before shopping                                        | Done         |
| GRO-54 | [#54](https://github.com/chsko/grocr/issues/54) | Recipe lines left on the list after saving the line editor unchanged                   | Done         |
| GRO-55 | [#55](https://github.com/chsko/grocr/issues/55) | Food icons for recipes, guessed from the title                                         | Done         |
| GRO-56 | [#56](https://github.com/chsko/grocr/issues/56) | Rename the family from the Family tab                                                  | Done         |
| GRO-57 | [#57](https://github.com/chsko/grocr/issues/57) | Design polish from the impeccable review and small UX fixes                            | Done         |
| GRO-58 | [#58](https://github.com/chsko/grocr/issues/58) | Open findings from the design review: long-press discoverability, Family rows, iPad    | Backlog      |
| GRO-59 | [#59](https://github.com/chsko/grocr/issues/59) | iOS-native polish on plain NativeTabs: large titles, search bar, recipe previews       | Backlog      |
| GRO-60 | [#60](https://github.com/chsko/grocr/issues/60) | Production Convex backend and production build profile                                 | Backlog      |
| GRO-61 | [#61](https://github.com/chsko/grocr/issues/61) | Build the family subscription with RevenueCat                                          | Backlog      |
| GRO-62 | [#62](https://github.com/chsko/grocr/issues/62) | Staples: each week's list offers what the family buys every week                       | Done         |
| GRO-63 | [#63](https://github.com/chsko/grocr/issues/63) | Family items screen: rename, merge and categorize items                                | Done         |
| GRO-64 | [#64](https://github.com/chsko/grocr/issues/64) | Copy last week's dinners on the Week tab                                               | Backlog      |
| GRO-65 | [#65](https://github.com/chsko/grocr/issues/65) | Show "new version ready" banner for OTA updates                                        | Done         |
| GRO-66 | [#66](https://github.com/chsko/grocr/issues/66) | "What's new" sheet and list under Family                                               | Done         |
| GRO-67 | [#67](https://github.com/chsko/grocr/issues/67) | Suggest known items when adding to the grocery list; stop suggestion dropdown blinking | Done         |
| GRO-68 | [#68](https://github.com/chsko/grocr/issues/68) | Rate recipes and show when each was last made                                          | Done         |
| GRO-69 | [#69](https://github.com/chsko/grocr/issues/69) | Suggest dinners for the empty days of a week                                           | Done         |
| GRO-70 | [#70](https://github.com/chsko/grocr/issues/70) | Highlight grocery items added since you last looked at the list                        | Done         |
| GRO-71 | [#71](https://github.com/chsko/grocr/issues/71) | Link a recipe to an external recipe page instead of writing steps                      | Done         |
| GRO-72 | [#72](https://github.com/chsko/grocr/issues/72) | Make the right week obvious                                                            | Done         |
