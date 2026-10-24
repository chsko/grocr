// Pure helpers for the jev CI checks, kept separate so they can be unit tested.

export const RISK_LEVELS = /** @type {const} */ (['low', 'medium', 'high']);

export const NEEDS_REVIEW_LABEL = 'needs-adversarial-review';
export const REVIEW_DONE_LABEL = 'adversarial-review-done';

/** The rubric jev scores PRs against (GRO-45). Index 0..2 = low..high. */
export const RISK_QUESTION = {
  type: 'score',
  instructions:
    "Rate the risk of merging this pull request to Grocr, a family dinner planner app (Expo + Convex) where several family members share recipes, a week menu and a grocery list. Risk means: a mistake could leak one family's data to another, lock users out, lose or corrupt shared data, or break syncing of the grocery list.",
  criteria: [
    'low: docs, styling, copy, tests only, tooling, or isolated UI with no data or access changes',
    'medium: new or changed app features or backend functions that read or write family data but do not change access rules, auth, schema or deletion',
    'high: touches authentication, access control or membership checks, the database schema or data migrations, account or data deletion, invites, or grocery list sync and offline rules',
  ],
};

/** Score at or above which a PR counts as high risk. Calibrate from the logged scores. */
export const HIGH_RISK_THRESHOLD = 1.5;
export const MEDIUM_RISK_THRESHOLD = 0.75;

export function riskLevel(score) {
  if (score >= HIGH_RISK_THRESHOLD) return 'high';
  if (score >= MEDIUM_RISK_THRESHOLD) return 'medium';
  return 'low';
}

/** Whether the risk gate passes for a PR with these labels. */
export function gatePasses(labels) {
  return !labels.includes(NEEDS_REVIEW_LABEL) || labels.includes(REVIEW_DONE_LABEL);
}

/** Flattens nested translation JSON into { "a.b.c": "text" }. */
export function flatten(tree, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(tree ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') Object.assign(out, flatten(value, path));
    else out[path] = String(value);
  }
  return out;
}

/**
 * The en/nb pairs a PR added or changed (either side), compared with the base branch.
 * Keys missing on one side are reported separately; the Jest parity test fails on those.
 */
export function changedPairs(base, head) {
  const baseEn = flatten(base.en);
  const baseNb = flatten(base.nb);
  const headEn = flatten(head.en);
  const headNb = flatten(head.nb);
  const pairs = [];
  const missing = [];
  for (const key of new Set([...Object.keys(headEn), ...Object.keys(headNb)])) {
    if (!(key in headEn) || !(key in headNb)) {
      missing.push(key);
      continue;
    }
    if (headEn[key] !== baseEn[key] || headNb[key] !== baseNb[key]) {
      pairs.push({ key, en: headEn[key], nb: headNb[key] });
    }
  }
  return { pairs: pairs.sort((a, b) => a.key.localeCompare(b.key)), missing: missing.sort() };
}

/** Builds one jev request per batch: the pairs as state, one named `noul` question per pair. */
export function parityRequests(pairs, batchSize = 20) {
  const requests = [];
  for (let i = 0; i < pairs.length; i += batchSize) {
    const batch = pairs.slice(i, i + batchSize);
    const state = {
      app: 'Grocr, a family dinner planner and shared grocery list app',
      strings: {},
    };
    const questions = {};
    const names = {};
    batch.forEach((pair, index) => {
      const name = `s${index}`;
      state.strings[name] = { key: pair.key, en: pair.en, nb: pair.nb };
      names[name] = pair;
      questions[name] = {
        type: 'noul',
        instructions: `For strings.${name} (translation key "${pair.key}"): do the English (en) and Norwegian bokmål (nb) texts mean the same thing in this app's UI? Placeholders like {{count}} are not translated, and i18next plural keys (_one, _other) may differ only in number.`,
      };
    });
    requests.push({ state, questions, names });
  }
  return requests;
}

/** Below this probability a pair is flagged. Warning only until calibrated (GRO-46). */
export const PARITY_THRESHOLD = 0.5;
