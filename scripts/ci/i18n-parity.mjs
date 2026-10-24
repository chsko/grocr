// GRO-46: asks jev whether changed Norwegian/English string pairs mean the same, and annotates
// doubtful pairs on the PR. Warning only (never fails) until the threshold is calibrated.
//
// Usage: node scripts/ci/i18n-parity.mjs <base-ref>
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { summary } from './github.mjs';
import { askJev } from './jev.mjs';
import { changedPairs, PARITY_THRESHOLD, parityRequests } from './lib.mjs';

const LOCALES = 'src/lib/i18n/locales';
const baseRef = process.argv[2] ?? 'origin/main';

function readAt(ref, path) {
  try {
    return JSON.parse(
      execFileSync('git', ['show', `${ref}:${path}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    );
  } catch {
    return {};
  }
}

const base = {
  en: readAt(baseRef, `${LOCALES}/en.json`),
  nb: readAt(baseRef, `${LOCALES}/nb.json`),
};
const head = {
  en: JSON.parse(readFileSync(`${LOCALES}/en.json`, 'utf8')),
  nb: JSON.parse(readFileSync(`${LOCALES}/nb.json`, 'utf8')),
};

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
