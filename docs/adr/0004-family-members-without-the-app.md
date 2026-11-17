# Family members without the app

Until now the family was the people who had joined with an account. Small children have no
phone, so they were not in it: the gift list needed its own people and a hand-made "Family"
gift group, and an Advent calendar could only be for someone with an account. We decided with
Christian (2026-11-17, #95) that the family is the household, with or without the app.

A family member without the app is a row with a name (`familyMembers`), added by any member
and removed only by the owner. Each one has a gift recipient (`giftRecipients.familyMemberId`),
and calendars can be for them (`adventRecipients.familyMemberId`). They get the app through an
invite made for that person (`invites.familyMemberId`). Joining with it claims the row: its
`userId` is set and copied onto their gift recipient (`memberUserId`) and calendar rows
(`userId`), so the hiding of ADR 0002 and ADR 0003 works unchanged from that moment.

Every member also gets a gift recipient linked to them when they create or join a family (and
once for existing members, by `family:backfillRecipients`). The fixed Familien group in the gift
list is every recipient whose member is in the family now, or whose family member has no app
yet. A member is one recipient: linking another recipient to them by hand (such as a plain
"Emma" from before she joined, which the app suggests) merges the other one into it, gifts,
ideas and budgets included. Linking is never refused for a member who already has one, since
the answer could depend on joint gifts hidden from the caller.

## Considered Options

- **A new member must be joined by hand to the old row**: the "unlinked recipient" gap of ADR
  0002 again: until someone links them, the child sees what is planned for them. Rejected.
- **All the family's people, members too, in one table that everything points at**: cleaner in
  the long run, but every query that hides by user id would change at once. Rejected for now;
  copying the user id on claim keeps the hiding code as it is.
- **Grandparents and in-laws in the family too**: rejected by Christian; the family also runs
  dinners and the grocery list, and gift groups already cover the rest.

## Consequences

Things planned for a family member without the app are visible to every member until they
join with their invite; then they disappear for them at once. The ordinary invite still makes
someone new. A person removed by the owner keeps their gift recipient as a plain person, with
its history, and is taken off calendars (a calendar left with no one is deleted). A member who
leaves becomes a plain person in the gift list and stays on calendars, as before.

As in ADR 0002 and 0003, hiding follows the account: joining with a second account, or
deleting the account and joining again, is not covered. Someone who was already linked to a
recipient and then joins with a person invite has two recipients, both hidden from them.
