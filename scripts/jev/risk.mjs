// GRO-45, run locally before pushing to main: jev scores the risk of a set of commits.
//
//   npm run jev:risk                 before pushing: scores origin/main..HEAD. If jev rates it high,
//                                    do the adversarial review first and add an
//                                    "Adversarial-Review: <summary>" trailer to the commit message.
//   node scripts/jev/risk.mjs <from> <to>   scores another range.
//
// Fails open: if jev is unreachable or answers nonsense, nothing is flagged.
import { commitMessages, diffFiles } from './git-diff.mjs';
import { askJev } from './jev.mjs';
import { describeFiles, hasReviewTrailer, RISK_QUESTION, riskLevel } from './lib.mjs';

const ZERO = /^0+$/;
const [from = 'origin/main', to = 'HEAD'] = process.argv.slice(2);
const base = ZERO.test(from) ? `${to}~1` : from; // first push of a branch has no "before"

const files = diffFiles(base, to);
if (files.length === 0) {
  console.log('No changes to score.');
  process.exit(0);
}
const messages = commitMessages(base, to);

const answers = await askJev(
  { commits: messages.map((m) => m.slice(0, 1000)), changedFiles: describeFiles(files) },
  { risk: RISK_QUESTION },
);
const level = riskLevel(answers?.risk?.score);
if (!level) process.exit(0);

const { score, confidence } = answers.risk;
const reviewed = messages.some(hasReviewTrailer);
const line = `jev risk for ${base}..${to}: ${level} (score ${score}, confidence ${confidence})`;
console.log(line);

if (level !== 'high') process.exit(0);
if (reviewed) {
  console.log('High risk, and the commits record an adversarial review.');
  process.exit(0);
}

console.log(
  'High risk: run an adversarial review before pushing, then add an "Adversarial-Review: <summary>" trailer.',
);
