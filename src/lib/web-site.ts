/**
 * The public website (grocr.io/app) carries only the Christmas gift lists. These are the routes
 * it has; every other route file is listed in APP_ONLY_ROUTES so the root layout can guard it
 * off (Expo Router registers every file, guarded or not). web-site.test.ts keeps both complete.
 */
export const WEB_ROUTES = ['index', 'sign-in', 'gifts', 'gift/[id]', 'gift-recipients'];

export const APP_ONLY_ROUTES = [
  '(tabs)',
  'welcome',
  'join',
  'tour',
  'recipe/[id]',
  'recipe/edit',
  'pick-dinner',
  'suggest-week',
  'invite',
  'sections',
  'items',
  'staples',
  'week-start',
  'whats-new',
];
