import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// Data model from the "Grocr: Architecture & data model" doc, §4. Every content table carries
// `groupId`, and every function checks membership against the stored `groupId` (lib/access.ts).

export const role = v.union(v.literal('owner'), v.literal('member'));

export const giftOccasionKind = v.literal('christmas');
export const giftStatus = v.union(v.literal('idea'), v.literal('bought'), v.literal('wrapped'));

export const groceryItemSource = v.union(
  v.object({
    kind: v.literal('meal'),
    mealPlanEntryId: v.id('mealPlanEntries'),
    recipeId: v.id('recipes'),
  }),
  v.object({ kind: v.literal('manual'), addedBy: v.optional(v.id('users')) }),
);

export default defineSchema({
  ...authTables,

  // Convex Auth's users table, extended with app fields as the auth epic needs them.
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // When they finished or skipped the get-started tour; missing shows it (GRO-49).
    tourDoneAt: v.optional(v.number()),
    // Number of the newest "What's new" entry they have seen (GRO-66); entries live in the app.
    whatsNewSeen: v.optional(v.number()),
  })
    .index('email', ['email'])
    .index('phone', ['phone']),

  // Apple refresh tokens, kept only so account deletion can revoke Sign in with Apple.
  appleTokens: defineTable({
    userId: v.id('users'),
    clientId: v.string(),
    refreshToken: v.string(),
  }).index('by_user', ['userId']),

  groups: defineTable({
    name: v.string(),
    ownerId: v.id('users'),
    // 0 = Sunday ... 6 = Saturday. Monday (1) by default.
    weekStartsOn: v.number(),
    // IANA timezone, e.g. "Europe/Oslo". Server-side "today" is computed from this.
    timezone: v.string(),
    // The family's grocery list sections in store order (GRO-51). Missing = the built-in ones,
    // in `sectionOrder` if set. See familySections in lib/catalog.ts.
    sections: v.optional(v.array(v.object({ key: v.string(), name: v.optional(v.string()) }))),
    // Store order of the built-in sections from before GRO-51; cleared once `sections` is saved.
    sectionOrder: v.optional(v.array(v.string())),
    // jev calls made for this family today (UTC), to cap spend.
    jevUsage: v.optional(v.object({ day: v.string(), count: v.number() })),
    // From when the Christmas gifts card shows on Week, as "MM-DD" (#78). Missing = 1 November.
    giftCardStart: v.optional(v.string()),
    createdAt: v.number(),
  }),

  memberships: defineTable({
    groupId: v.id('groups'),
    userId: v.id('users'),
    role,
    joinedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_group', ['groupId'])
    .index('by_group_user', ['groupId', 'userId']),

  // Household members without the app (#95), such as small children: just a name. Members with
  // the app are their memberships. An invite made for one of them (`invites.familyMemberId`)
  // claims the row: `userId` is set, and from then on they are a member like any other.
  familyMembers: defineTable({
    groupId: v.id('groups'),
    name: v.string(),
    // Set once someone joined with the invite made for them.
    userId: v.optional(v.id('users')),
    createdAt: v.number(),
  })
    .index('by_group', ['groupId'])
    .index('by_user', ['userId']),

  invites: defineTable({
    groupId: v.id('groups'),
    // An invite for one family member without the app: joining with it makes you them.
    familyMemberId: v.optional(v.id('familyMembers')),
    tokenHash: v.string(),
    shortCode: v.string(),
    createdBy: v.id('users'),
    email: v.optional(v.string()),
    expiresAt: v.number(),
    maxUses: v.number(),
    uses: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index('by_tokenHash', ['tokenHash'])
    .index('by_shortCode', ['shortCode'])
    .index('by_group', ['groupId']),

  // Failed invite-code lookups per user in the current window, so codes cannot be guessed.
  inviteAttempts: defineTable({
    userId: v.id('users'),
    windowStart: v.number(),
    failures: v.number(),
  }).index('by_user', ['userId']),

  ingredients: defineTable({
    groupId: v.id('groups'),
    name: v.string(),
    normalizedName: v.string(),
    section: v.string(),
    // Who set the section: the keyword guess, jev, or a family member (never overridden).
    sectionSource: v.optional(v.union(v.literal('guess'), v.literal('jev'), v.literal('user'))),
    defaultUnit: v.optional(v.string()),
    // Bought most weeks (milk, bread, coffee): each week's list offers it (GRO-62).
    isStaple: v.optional(v.boolean()),
    aliases: v.array(v.string()),
  })
    .index('by_group_normalizedName', ['groupId', 'normalizedName'])
    .index('by_group_staple', ['groupId', 'isStaple']),

  // Names merged into another catalog item (ingredients.merge), so typing them finds that item.
  ingredientAliases: defineTable({
    groupId: v.id('groups'),
    normalizedName: v.string(),
    ingredientId: v.id('ingredients'),
  })
    .index('by_group_name', ['groupId', 'normalizedName'])
    .index('by_ingredient', ['ingredientId']),

  recipes: defineTable({
    groupId: v.id('groups'),
    title: v.string(),
    servings: v.number(),
    steps: v.array(v.string()),
    tags: v.array(v.string()),
    /** One of RECIPE_ICONS; missing means guessed from the title. */
    icon: v.optional(v.string()),
    /** jev's pick for a title the keywords don't know; dropped when the title changes. */
    guessedIcon: v.optional(v.string()),
    /** The title jev was last asked about, so saves don't ask again. */
    iconAskedFor: v.optional(v.string()),
    imageStorageId: v.optional(v.id('_storage')),
    sourceUrl: v.optional(v.string()),
    createdBy: v.optional(v.id('users')),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
    ingredients: v.array(
      v.object({
        ingredientId: v.id('ingredients'),
        qty: v.optional(v.number()),
        unit: v.optional(v.string()),
        note: v.optional(v.string()),
        /** The recipe section the line is in, such as "Saus" (#101); see lib/recipeSections. */
        recipeSection: v.optional(v.string()),
      }),
    ),
  })
    .index('by_group', ['groupId'])
    .searchIndex('search_title', { searchField: 'title', filterFields: ['groupId'] }),

  // One member's stars (1-5) for a recipe (GRO-68). Per member, so a family can disagree; only
  // current members count toward the family average.
  recipeRatings: defineTable({
    groupId: v.id('groups'),
    recipeId: v.id('recipes'),
    userId: v.id('users'),
    stars: v.number(),
    updatedAt: v.number(),
  })
    .index('by_recipe_user', ['recipeId', 'userId'])
    .index('by_group', ['groupId'])
    .index('by_user', ['userId']),

  mealPlanEntries: defineTable({
    groupId: v.id('groups'),
    date: v.string(), // "YYYY-MM-DD" in the group's timezone
    slot: v.literal('dinner'),
    recipeId: v.optional(v.id('recipes')),
    freeText: v.optional(v.string()),
    servings: v.number(),
    addedBy: v.optional(v.id('users')),
    createdAt: v.number(),
  })
    .index('by_group_date', ['groupId', 'date'])
    .index('by_recipe_date', ['recipeId', 'date']),

  groceryLists: defineTable({
    groupId: v.id('groups'),
    startDate: v.string(),
    endDate: v.string(),
    carryOverDismissed: v.optional(v.boolean()),
    // Someone said "not this week" to the staples offer (GRO-62).
    staplesDismissed: v.optional(v.boolean()),
    // Staples this list already had (added from the offer, cleared after the shop, or taken off
    // by hand), so they are not offered again this week.
    staplesHandled: v.optional(v.array(v.id('ingredients'))),
  }).index('by_group_startDate', ['groupId', 'startDate']),

  // What a member has seen of a week's grocery list (GRO-70): the createdAt of the newest row
  // the app showed them, so lines others added after it can be marked as new. Only moves forward.
  groceryListViews: defineTable({
    groupId: v.id('groups'),
    listId: v.id('groceryLists'),
    userId: v.id('users'),
    seenAt: v.number(),
  })
    .index('by_list_user', ['listId', 'userId'])
    .index('by_user_group_seenAt', ['userId', 'groupId', 'seenAt'])
    .index('by_group', ['groupId']),

  groceryItems: defineTable({
    groupId: v.id('groups'),
    listId: v.id('groceryLists'),
    ingredientId: v.optional(v.id('ingredients')),
    name: v.string(),
    qty: v.optional(v.number()),
    unit: v.optional(v.string()),
    section: v.string(),
    checked: v.boolean(),
    checkedBy: v.optional(v.id('users')),
    checkedAt: v.optional(v.number()),
    // Someone has it at home already (ticked off before going shopping), so it is not bought.
    // Never set together with `checked`.
    atHome: v.optional(v.boolean()),
    edited: v.boolean(),
    // A meal row someone removed or merged away. Hidden from the list, but it tells sync that
    // this dinner's ingredient was handled by hand, so it is not added back.
    removed: v.optional(v.boolean()),
    source: groceryItemSource,
    // Who made sync add a meal row (planned the dinner, raised servings, edited the recipe), so
    // GRO-70 can tell their own additions from others'. Missing on older rows: the planner.
    insertedBy: v.optional(v.id('users')),
    createdAt: v.number(),
  })
    .index('by_list', ['listId'])
    .index('by_entry', ['source.mealPlanEntryId']),

  // Christmas gifts (#78, ADR 0002). A gift recipient linked to a member is hidden from that
  // member, with everything about them; every function goes through convex/gifts.ts loaders.
  // A named group of gift recipients ("In-laws", "Kids"), shown as a heading in the gift list.
  giftGroups: defineTable({
    groupId: v.id('groups'),
    name: v.string(),
    createdAt: v.number(),
  }).index('by_group', ['groupId']),

  giftRecipients: defineTable({
    groupId: v.id('groups'),
    name: v.string(),
    memberUserId: v.optional(v.id('users')),
    // The family member without the app this person is (#95). Members with the app are found
    // by `memberUserId`. Either way they are in the fixed Familien group while in the family.
    familyMemberId: v.optional(v.id('familyMembers')),
    // The one gift group this person is in, if any.
    giftGroupId: v.optional(v.id('giftGroups')),
    archivedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index('by_group', ['groupId'])
    .index('by_group_member', ['groupId', 'memberUserId'])
    .index('by_member', ['memberUserId'])
    .index('by_family_member', ['familyMemberId']),

  // A gift for one occasion (Christmas of a year), or an idea in the recipient's idea bank when
  // the occasion fields are missing. Both occasion fields are set together or not at all.
  gifts: defineTable({
    groupId: v.id('groups'),
    recipientId: v.id('giftRecipients'),
    // A joint gift ("fellesgave") is also for these people, besides `recipientId`. It shows
    // under each of them, is hidden from every linked member among them, and its price is
    // shared evenly between their budgets.
    alsoForIds: v.optional(v.array(v.id('giftRecipients'))),
    occasionKind: v.optional(giftOccasionKind),
    occasionYear: v.optional(v.number()),
    title: v.string(),
    // Always 'idea' in the idea bank.
    status: giftStatus,
    price: v.optional(v.number()),
    url: v.optional(v.string()),
    note: v.optional(v.string()),
    buyerUserId: v.optional(v.id('users')),
    createdAt: v.number(),
  })
    .index('by_recipient_occasion', ['recipientId', 'occasionKind', 'occasionYear'])
    .index('by_group_occasion', ['groupId', 'occasionKind', 'occasionYear']),

  // What the family plans to spend on one recipient for one occasion, in kroner.
  giftBudgets: defineTable({
    groupId: v.id('groups'),
    recipientId: v.id('giftRecipients'),
    occasionKind: giftOccasionKind,
    occasionYear: v.number(),
    amount: v.number(),
  })
    .index('by_recipient_occasion', ['recipientId', 'occasionKind', 'occasionYear'])
    .index('by_group_occasion', ['groupId', 'occasionKind', 'occasionYear']),

  // Advent calendars (#88, ADR 0003): the adults plan what goes behind each door of a calendar
  // for one or more family members. A calendar is hidden from every one of its recipients;
  // every function goes through the loaders in convex/advent.ts.
  adventCalendars: defineTable({
    groupId: v.id('groups'),
    year: v.number(),
    // Missing = the recipients' names, put together by the app in the reader's language.
    name: v.optional(v.string()),
    // Its days as local dates ("YYYY-MM-DD"), sorted, from first Sunday in Advent to 24 Dec.
    days: v.array(v.string()),
    createdBy: v.optional(v.id('users')),
    createdAt: v.number(),
  })
    .index('by_group_year', ['groupId', 'year'])
    .index('by_creator', ['createdBy']),

  // Who an Advent calendar is for, one row each: a member (`userId`) or a family member without
  // the app (`familyMemberId`, #95). When that member joins with their invite, `userId` is set
  // too, which hides the calendar from them. A deleted account is found in every family.
  adventRecipients: defineTable({
    groupId: v.id('groups'),
    calendarId: v.id('adventCalendars'),
    userId: v.optional(v.id('users')),
    familyMemberId: v.optional(v.id('familyMembers')),
  })
    .index('by_calendar', ['calendarId'])
    .index('by_group_user', ['groupId', 'userId'])
    .index('by_user', ['userId'])
    .index('by_family_member', ['familyMemberId']),

  // What is behind one door: at most one per calendar and day.
  adventDoors: defineTable({
    groupId: v.id('groups'),
    calendarId: v.id('adventCalendars'),
    day: v.string(),
    title: v.string(),
    status: giftStatus,
    price: v.optional(v.number()),
    note: v.optional(v.string()),
  }).index('by_calendar_day', ['calendarId', 'day']),
});
