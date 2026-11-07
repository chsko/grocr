# Realign grocery lists when the week start day changes

Grocery lists are keyed by the date their week starts, so changing a family's week start day would leave every existing list on dates the app no longer asks for. We decided (Christian, 2026-11-07) that the change moves each list to the new week that covers most of its days (the new week containing the old week's fourth day), and moves grocery lines that came from a dinner to the list of the week that dinner's date now falls in. Dinners themselves never move: they belong to a date, not a week. Lines carried over to another week by hand stay where the family put them, and lists that ended more than eight weeks ago are only re-dated, so the change stays small for families with years of lists.

## Considered Options

- **Only change future weeks**: old lists keep their old dates. Rejected because those lists become unreachable or overlap the new weeks, and a list half in one week and half in the next is exactly the "wrong week" confusion this change set out to fix.
