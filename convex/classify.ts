import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { isSection } from './lib/catalog';
import { askJevChoice } from './lib/jev';

// jev refines the keyword guess for a new catalog item a moment after it is added, so unknown
// words ("halloumi", "sriracha") stop landing in "other". A member's own choice always wins.

/** jev must be at least this sure before it replaces the keyword guess. */
export const MIN_CONFIDENCE = 0.6;

const SECTION_CRITERIA = {
  produce: 'Fruit, vegetables, fresh herbs, salad (frukt og grønt)',
  meat: 'Fresh or cured meat, poultry, fish and seafood (kjøtt og fisk)',
  dairy: 'Milk, cheese, butter, yoghurt, cream, eggs (meieri og egg)',
  bakery: 'Bread, rolls, tortillas, cakes (bakeri)',
  dry: 'Pasta, rice, flour, cans, jars, sauces, spices, oils, snacks, drinks (tørrvarer)',
  frozen: 'Frozen food (frysevarer)',
  household: 'Non-food: cleaning, paper, toiletries (husholdning)',
  other: 'Anything that fits none of the above (annet)',
};

export const ingredient = internalQuery({
  args: { ingredientId: v.id('ingredients') },
  handler: async (ctx, { ingredientId }) => await ctx.db.get('ingredients', ingredientId),
});

export const section = internalAction({
  args: { ingredientId: v.id('ingredients') },
  handler: async (ctx, { ingredientId }) => {
    const doc = await ctx.runQuery(internal.classify.ingredient, { ingredientId });
    if (doc === null || doc.sectionSource === 'user') return;
    const answer = await askJevChoice(
      { item: doc.name, store: 'Norwegian grocery store' },
      'Which grocery store section is this item found in? The name may be Norwegian or English.',
      SECTION_CRITERIA,
    );
    if (answer === null || answer.confidence < MIN_CONFIDENCE) return;
    await ctx.runMutation(internal.classify.applySection, { ingredientId, section: answer.choice });
  },
});

/** Stores jev's section unless a member has set one in the meantime. */
export const applySection = internalMutation({
  args: { ingredientId: v.id('ingredients'), section: v.string() },
  handler: async (ctx, { ingredientId, section }) => {
    const doc = await ctx.db.get('ingredients', ingredientId);
    if (doc === null || doc.sectionSource === 'user' || !isSection(section)) return;
    await ctx.db.patch('ingredients', ingredientId, { section, sectionSource: 'jev' });
  },
});
