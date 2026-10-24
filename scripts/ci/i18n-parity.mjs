// GRO-46: asks jev whether changed Norwegian/English string pairs mean the same, and annotates
// doubtful pairs on the PR. Warning only (never fails) until the threshold is calibrated.
//
// Runs from the base branch (pull_request_target) and reads both versions of the locale files
// through the API, so no PR code is checked out or run.
//
// Usage: node scripts/ci/i18n-parity.mjs
import { fileAt, prContext, summary } from './github.mjs';
import { askJev } from './jev.mjs';
import { changedPairs, PARITY_THRESHOLD, parityRequests } from './lib.mjs';

const LOCALES = 'src/lib/i18n/locales';
const { event, repo } = prContext();
const pr = event.pull_request;

async function locales(owner, sha) {
  const read = async (lang) => {
    const text = await fileAt(owner, `${LOCALES}/${lang}.json`, sha);
    try {
      return text === undefined ? {} : JSON.parse(text);
    } catch {
      console.log(`::warning::${LOCALES}/${lang}.json is not valid JSON at ${sha}.`);
      return {};
    }
  };
  return { en: await read('en'), nb: await read('nb') };
}

const base = await locales(repo, pr.base.sha);
const head = await locales(pr.head.repo?.full_name ?? repo, pr.head.sha);

const { pairs, missing } = changedPairs(base, head);
for (const key of missing) {
  console.log(`::warning file=${LOCALES}/nb.json::"${key}" exists in only one language.`);
}
if (pairs.length === 0) {
  summary('No changed translation pairs.');
  process.exit(0);
}

const rows = [];
for (const { state, questions, names } of parityRequests(pairs)) {
  const answers = await askJev(state, questions);
  if (!answers) process.exit(0); // fail open
  for (const [name, pair] of Object.entries(names)) {
    const p = answers[name]?.noul;
    if (p === undefined) continue;
    rows.push(`| \`${pair.key}\` | ${p.toFixed(2)} | ${pair.en} | ${pair.nb} |`);
    if (p < PARITY_THRESHOLD) {
      console.log(
        `::warning file=${LOCALES}/nb.json,title=Translation mismatch?::"${pair.key}": jev rates ${p.toFixed(2)} that en "${pair.en}" and nb "${pair.nb}" mean the same.`,
      );
    }
  }
}
summary(
  `### jev nb/en parity\n\n| key | same meaning | en | nb |\n| -- | -- | -- | -- |\n${rows.join('\n')}`,
);
