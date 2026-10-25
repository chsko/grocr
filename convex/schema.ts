import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// Data model from the "Grocr: Architecture & data model" doc, §4. Every content table carries
// `groupId`, and every function checks membership against the stored `groupId` (lib/access.ts).

export const role = v.union(v.literal('owner'), v.literal('member'));

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
  })
    .index('email', ['email'])
    .index('phone', ['phone']),

  groups: defineTable({
    name: v.string(),
    ownerId: v.id('users'),
    // 0 = Sunday ... 6 = Saturday. Monday (1) by default.
    weekStartsOn: v.number(),
    // IANA timezone, e.g. "Europe/Oslo". Server-side "today" is computed from this.
    timezone: v.string(),
    // Grocery list section order, matching the family's store. Missing = default order.
    sectionOrder: v.optional(v.array(v.string())),
    // jev calls made for this family today (UTC), to cap spend.
    jevUsage: v.optional(v.object({ day: v.string(), count: v.number() })),
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

  invites: defineTable({
    groupId: v.id('groups'),
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
    isStaple: v.optional(v.boolean()),
    aliases: v.array(v.string()),
  }).index('by_group_normalizedName', ['groupId', 'normalizedName']),

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
      }),
    ),
  })
    .index('by_group', ['groupId'])
    .searchIndex('search_title', { searchField: 'title', filterFields: ['groupId'] }),

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
  }).index('by_group_startDate', ['groupId', 'startDate']),

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
    edited: v.boolean(),
    // A meal row someone removed or merged away. Hidden from the list, but it tells sync that
    // this dinner's ingredient was handled by hand, so it is not added back.
    removed: v.optional(v.boolean()),
    source: groceryItemSource,
    createdAt: v.number(),
  })
    .index('by_list', ['listId'])
    .index('by_entry', ['source.mealPlanEntryId']),
});
