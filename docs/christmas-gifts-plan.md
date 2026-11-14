# Christmas gifts: plan

Status: design agreed with Christian on 2026-11-14 (interview in the project thread). Not built yet.
Terms are defined in [`GLOSSARY.md`](../GLOSSARY.md) under "Gifts". The one hard-to-reverse
decision, hiding gifts from their recipient, is [ADR 0002](adr/0002-hide-gifts-from-their-recipient.md).

## Why

Every year the family buys Christmas gifts for roughly the same people. Today that lives in notes
and heads. Grocr already has the shared family, real-time sync and checklists, so a gift list fits
next to the grocery list, as long as Grocr still feels like a dinner app.

## What the family can do

1. **Keep a fixed list of gift recipients** for the family. Each recipient has a name and can be
   linked to a family member. Anyone can add a recipient at any time, also in the middle of a
   Christmas. A recipient who drops out is archived, not deleted, so their history stays.
2. **Collect ideas all year.** Each recipient has an idea bank. An idea noted in July is waiting
   when Christmas planning starts.
3. **Plan a Christmas.** "Jul 2026" is created on first use and includes every active recipient.
   Ideas from the idea bank can be moved into it. Recipients added later join the current
   Christmas too.
4. **Track each gift**: title, status **Idea → Bought → Wrapped**, and optional price (NOK), link,
   "bought by" (a family member) and note (size, colour, shop).
5. **Budget**: an optional amount per recipient per Christmas. The screen shows spent and left per
   recipient and for the whole Christmas. Spent is the sum of prices of gifts that are Bought or
   Wrapped. Last year's amount is suggested for a new Christmas.
6. **History**: a recipient shows what they got in earlier Christmases, so the family does not
   give the same thing twice.

## Who sees what

- The whole family group can see and edit the gift lists (Christian's choice: not private lists).
- **A recipient linked to a member is hidden from that member**, together with everything about
  them: their gifts, ideas, budget, history and their share of any totals. This holds for every
  member, children included; there is no separate child role. It is enforced in the Convex
  functions, never only in the UI. See ADR 0002.
- Consequences the build must handle:
  - Totals (whole-Christmas budget, spent, the Week card counts) are computed per viewer, leaving
    out the viewer's own recipient. Otherwise the numbers leak what was spent on them.
  - "Bought by" cannot be the recipient themselves.
  - A member who is linked to a recipient must not learn that the recipient exists, so no
    "1 hidden" hints and no error that differs from "not found".
  - Unlinked recipients are visible to everyone. When a recipient's name matches a member, or a
    new member joins, the app suggests linking them. A wrong or missing link is the main way a
    surprise can leak, so the link is shown clearly on the recipient.
  - Gifts never feed the grocery catalog, item suggestions, "New since you last looked" or What's
    new texts in a way that names a gift.

## Where it lives

- **Family › Christmas gifts** (nb: Familie › Julegaver). No new tab.
- **A card at the top of the Week tab** in the run-up to Christmas, with how many gifts are
  bought and wrapped and the budget left. It shows from a start date until 24 December. The start
  date is a family setting in Christmas gifts, 1 November by default, because the family often
  starts planning early.

## Not now

- Wish lists that the recipient fills in themselves.
- Sharing gift lists with other families.
- Putting gifts on the grocery list.
- Birthdays and other occasions. The data model treats a Christmas as one kind of **gift
  occasion**, so birthdays can come later without a rebuild.

## Data model sketch

Convex tables, all group scoped and checked with the helpers in `convex/lib/access.ts`:

| Table                 | Fields                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `giftRecipients`      | groupId, name, memberUserId?, archivedAt?, createdAt                                                                 |
| `giftOccasions`       | groupId, kind (`christmas`), year, createdAt. Unique per group, kind and year                                        |
| `giftOccasionBudgets` | groupId, occasionId, recipientId, amountNok                                                                          |
| `gifts`               | groupId, recipientId, occasionId? (none = idea bank), title, status, priceNok?, url?, buyerUserId?, note?, createdAt |
| `groups` (new field)  | giftCardStartsOn? `{ month, day }`, missing = 1 November                                                             |

A new access helper, for example `requireGiftAccess(ctx, recipient)`, loads the recipient, checks
membership and throws NOT_FOUND when `memberUserId` is the caller. Every gift query and mutation
goes through it, and list queries filter out the caller's own recipient.

## Build steps (one issue, can ship in parts)

1. Schema, access helper and Convex tests for the hiding rules, including totals.
2. Recipients screen with linking and archiving.
3. Christmas view: recipients, gifts, statuses, budget and totals.
4. Idea bank and moving ideas into a Christmas; history on the recipient.
5. Week card with the start date setting.
6. nb + en copy, What's new entry, dark mode check.
7. Adversarial review of the hiding rules before shipping.
