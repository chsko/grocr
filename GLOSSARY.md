# Grocr

A family's shared weekly dinner plan and the grocery list that comes from it.

## Weeks

**Week**:
Seven days in a row that begin on the family's week start day. Each week has one dinner plan and one grocery list.
_Avoid_: Calendar week (when the family's start day is not Monday), period

**Week start day**:
The weekday a family's weeks begin on. One choice for the whole family.
_Avoid_: First day of week

**This week**:
The week that has today in it.
_Avoid_: Current week (in UI copy), now

**Shopping week**:
The week the app opens on by default: this week, or next week during the last three days of a week, when the family shops ahead.
_Avoid_: Default week, active week

**Past week**:
A week whose last day is before today.

**Future week**:
A week whose first day is after today.

## Family

**Family**:
The household: the people who share dinners and the grocery list, with or without the app.
Grandparents, in-laws and friends are gift recipients, not family.
_Avoid_: Group (that is the code's word), household (in UI copy)

**Member**:
Someone in the family with the app: they signed in and joined with an invite.

**Family member without the app** (uten app):
Someone in the family with just a name, such as a small child. Any member can add or rename one;
only the owner can remove one. They can get gifts and Advent calendars, and get the app later.
_Avoid_: Child (adults can be without the app too), offline member, dependant

**Person invite**:
An invite made for one family member without the app. Whoever joins with it becomes them, and
everything planned for them is hidden from them from then on.
_Avoid_: Claim code

## Gifts

**Gift recipient**:
A person the family gives gifts to, kept from year to year. Can be linked to a family member, who then never sees anything about them.
_Avoid_: Person, contact, receiver

**Linked member**:
The family member a gift recipient is. Someone else in the family makes the link, never the member themselves, and it stays when they leave the family.
_Avoid_: Owner, self

**Archived recipient**:
A gift recipient the family no longer gives gifts to. Keeps their history but is left out of new gift occasions.

**Gift occasion**:
One time the family gives gifts, such as Christmas 2026. Only Christmas exists for now.
_Avoid_: Event, season

**Idea bank**:
Gift ideas noted on a gift recipient outside any gift occasion, waiting to be moved into one.
_Avoid_: Wish list (that is what the recipient wants, written by them)

**Gift budget**:
The amount the family plans to spend on one gift recipient for one gift occasion.

**Familien**:
The fixed gift group at the top of the gift list: every family member except the viewer. It
can't be renamed or deleted, and people come and go with the family.

**Gift group**:
A named group of gift recipients ("In-laws", "Kids"), shown as a heading in the gift list. A
recipient is in at most one. The group is done for a Christmas when every recipient in it that
the viewer may see has at least one Bought or Wrapped gift.

**Joint gift** (fellesgave):
One gift for several gift recipients together, such as a rug for Granny and Grandpa. It shows
under each of them, counts once in totals, and its price is shared evenly between their budgets.
It is hidden from every linked member it is for.
_Avoid_: Shared gift (sounds like several givers chipping in)

**Gift status**:
Where a gift is: Idea, Bought or Wrapped. Everything in the idea bank is an Idea.

**Spent**:
The sum of the prices of gifts that are Bought or Wrapped. Ideas with a price count as planned, not spent.
_Avoid_: Used, cost

**This Christmas**:
The Christmas of the current year. It becomes next year's on 1 January, so the days after Christmas still show the one just had.

## Advent calendars

**Advent calendar** (julekalender):
What the adults plan to put behind each door for one or more family members, for one year's Advent. Hidden from every member it is for.
_Avoid_: Calendar (alone, it means the date picker), julekalender in English text

**Calendar recipient**:
Someone in the family an Advent calendar is for: a member, or a family member without the app. Never a gift recipient outside the family, and never the person making the calendar.
_Avoid_: Child (adults can get one too), owner

**Calendar day**:
A day an Advent calendar has a door on, from the first Sunday in Advent (or 1 December, when Advent starts later) to Christmas Eve. A calendar has the days its family picks, not always 1 to 24 December.

**Door** (luke):
What is behind one calendar day: one thing with a gift status, an optional price and a note. A door can be empty. Its number is the date in a 1 to 24 December calendar, else its place among the calendar days (the third Advent Sunday is door 3).
_Avoid_: Hatch, window, slot

**Calendar template**:
The days a new Advent calendar starts with: 1 to 24 December, the Advent Sundays, or own days (none, to pick by hand). Days can be added and removed afterwards.
