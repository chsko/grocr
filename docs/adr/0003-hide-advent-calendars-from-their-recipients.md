# Hide Advent calendars from their recipients

Advent calendars (#88) are planned by the adults for other members of the family. Like gifts
(ADR 0002), a calendar must stay a surprise, so a calendar is hidden from every member it is
for: the calendar, its doors, its totals and its line on the Week card. A hidden calendar looks
exactly like one that does not exist, and making yourself a recipient is refused before
anything is looked up, so the answer can't tell you whether a calendar for you exists. The
rule is enforced in the Convex functions (`convex/advent.ts`), which reach calendars only
through one loader. We decided this with Christian on 2026-11-17.

Unlike gifts, a calendar's recipients are users, not gift recipients. Christian chose to allow
only family members in the app as recipients, so there is no link step to forget. That closes
the gift lists' "unlinked recipient" gap for calendars: a calendar is hidden from the moment it
is made.

## Considered Options

- **Recipients as gift recipients (Personer)**: would let small children without an account
  get a calendar, and reuse the gift links, but would carry over the unlinked-recipient leak
  and mix two features. Rejected by Christian (only family members).
- **Private calendars for their maker**: no new visibility rule, but the other parent could not
  help plan or fill tomorrow's door. Rejected.

## Consequences

Recipients are stored one per row (`adventRecipients`) with an index by user, so deleting an
account finds every calendar it was for, also in families left earlier; a calendar left with
no recipients is deleted. Leaving a family changes nothing, so a member who rejoins with the
same account still sees nothing. As with gifts, hiding follows the account: a second account,
or deleting the account and joining again, is not covered.
