# Hide gifts from their recipient

Until now every member of a family group sees everything in the group. Christmas gift lists break
that: a gift must stay a surprise. We decided (Christian, 2026-11-14) that gift lists are shared
with the whole group, and that a gift recipient linked to a member is hidden from that member,
with all its gifts, ideas, budget, history and its share of totals. The rule is enforced in the
Convex functions, and a hidden recipient looks exactly like one that does not exist.

Only the other members can link someone: linking yourself is refused before anything is looked
up, because an "already linked" answer would tell you a recipient for you exists. The link stays
when the member leaves the family, so a child who moves out and is invited back still sees
nothing. Only deleting the account removes it.

## Considered Options

- **Private lists per person, shared with chosen co-planners**: no new visibility rule, but
  partners would have to set up sharing every year and the family could easily buy the same gift
  twice. Rejected.
- **A child role that cannot see gifts at all**: rejected; hiding per recipient already keeps the
  surprise for children, and a role would add a new concept to the whole app.

## Consequences

Totals are computed per viewer. The link between recipient and member is now security relevant:
a missing link exposes gifts, so the app suggests links when names match or a member joins.

Hiding follows the account, not the person. An adversarial review (#87) found three ways around
it that the app does not close, because each needs a deliberate act and closing them would mean
guessing who a new account belongs to:

- A member who joins the family with a second account sees the recipient linked to their first.
- A member who deletes their account (which unlinks them) and joins again with a new one sees
  their old recipient and its history.
- A recipient that is created without a link is visible to the member it is for until someone
  links it; once linked it disappears for them, which tells them it was them. The suggestions on
  the recipients screen are there to make linking the first step.
