// GRO-46: asks jev whether changed Norwegian/English string pairs mean the same, and annotates
// doubtful pairs. Warning only (never fails) until the threshold is calibrated.
//
// Usage: node scripts/ci/i18n-parity.mjs [from] [to]   (default origin/main..HEAD)
import { fileAt } from './git-diff.mjs';
import { summary } from './github.mjs';
import { askJev } from './jev.mjs';
import { changedPairs, PARITY_THRESHOLD, parityRequests } from './lib.mjs';

const LOCALES = 'src/lib/i18n/locales';
const ZERO = /^0+$/;
const [fromArg = 'origin/main', to = 'HEAD'] = process.argv.slice(2);
const from = ZERO.test(fromArg) ? `${to}~1` : fromArg;

function locales(ref) {
  const read = (lang) => {
    const text = fileAt(ref, `${LOCALES}/${lang}.json`);
    try {
      return text === undefined ? {} : JSON.parse(text);
    } catch {
      console.log(`::warning::${LOCALES}/${lang}.json is not valid JSON at ${ref}.`);
      return {};
    }
  };
  return { en: read('en'), nb: read('nb') };
}

const base = locales(from);
const head = locales(to);

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
