// GRO-45, adapted to pushing straight to main: jev scores the risk of a set of commits.
//
//   npm run jev:risk                 before pushing: scores origin/main..HEAD. If jev rates it high,
//                                    do the adversarial review first and add an
//                                    "Adversarial-Review: <summary>" trailer to the commit message.
//   node scripts/ci/risk.mjs <before> <after>
//                                    in CI on each push to main: if a high-risk push has no
//                                    Adversarial-Review trailer, opens a GitHub issue to review it.
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
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import('node:fs');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${line}\n`);
}

if (level !== 'high') process.exit(0);
if (reviewed) {
  console.log('High risk, and the commits record an adversarial review.');
  process.exit(0);
}

if (!process.env.GITHUB_ACTIONS) {
  console.log(
    'High risk: run an adversarial review before pushing, then add an "Adversarial-Review: <summary>" trailer.',
  );
  process.exit(0);
}

// In CI: the push already landed, so open an issue to make sure it gets reviewed.
const repo = process.env.GITHUB_REPOSITORY;
const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    title: `Adversarial review needed: ${to.slice(0, 7)}`,
    labels: ['needs-adversarial-review'],
    body: `jev rated the push ${base.slice(0, 7)}..${to.slice(0, 7)} high risk (score ${score}) and no commit has an \`Adversarial-Review:\` trailer.\n\nChanged files:\n${files.map((f) => `- ${f.filename}`).join('\n')}`,
  }),
});
console.log(
  response.ok
    ? '::warning::High-risk push without an adversarial review; opened an issue.'
    : `::warning::Could not open the review issue (HTTP ${response.status}).`,
);
