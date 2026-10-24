// GRO-45: jev scores each PR's risk. High-risk PRs get the `needs-adversarial-review` label, and
// the gate fails until someone adds `adversarial-review-done` after an adversarial review.
// Scoring fails open: if jev is unreachable the PR is not labelled.
//
// Usage: node scripts/ci/pr-risk.mjs score|gate
import { gh, prContext, summary } from './github.mjs';
import { askJev } from './jev.mjs';
import {
  gatePasses,
  NEEDS_REVIEW_LABEL,
  REVIEW_DONE_LABEL,
  RISK_LEVELS,
  RISK_QUESTION,
  riskLevel,
} from './lib.mjs';

const { event, repo, number } = prContext();

async function score() {
  const pr = event.pull_request;
  const files = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await gh(`/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`);
    files.push(
      ...batch.map(
        (file) => `${file.status} ${file.filename} (+${file.additions} -${file.deletions})`,
      ),
    );
    if (batch.length < 100) break;
  }

  const answers = await askJev(
    { title: pr.title, description: (pr.body ?? '').slice(0, 4000), changedFiles: files },
    { risk: RISK_QUESTION },
  );
  if (!answers?.risk) return;

  const { score: value, confidence, probabilities } = answers.risk;
  const level = riskLevel(value);
  summary(
    `### jev PR risk: **${level}**\n\nscore ${value} (0 = low, 2 = high), confidence ${confidence}, probabilities ${JSON.stringify(probabilities)}`,
  );

  const current = (await gh(`/repos/${repo}/issues/${number}/labels`)).map((label) => label.name);
  try {
    for (const old of RISK_LEVELS.map((l) => `risk:${l}`)) {
      if (old !== `risk:${level}` && current.includes(old)) {
        await gh(`/repos/${repo}/issues/${number}/labels/${encodeURIComponent(old)}`, {
          method: 'DELETE',
        });
      }
    }
    // Once flagged, a PR stays flagged: a later low score does not remove the review requirement.
    const labels = [`risk:${level}`, ...(level === 'high' ? [NEEDS_REVIEW_LABEL] : [])];
    await gh(`/repos/${repo}/issues/${number}/labels`, { method: 'POST', body: { labels } });
  } catch (error) {
    // Fork PRs get a read-only token.
    console.log(`::warning::Could not update labels: ${error.message}`);
  }
}

async function gate() {
  const labels = (await gh(`/repos/${repo}/issues/${number}/labels`)).map((label) => label.name);
  if (gatePasses(labels)) {
    summary(
      labels.includes(NEEDS_REVIEW_LABEL)
        ? 'Adversarial review recorded.'
        : 'No adversarial review required.',
    );
    return;
  }
  summary(
    `jev rated this PR high risk. Run an adversarial review, address its findings, then add the \`${REVIEW_DONE_LABEL}\` label.`,
  );
  console.log(
    `::error::High-risk PR: adversarial review required (add the ${REVIEW_DONE_LABEL} label once done).`,
  );
  process.exitCode = 1;
}

const mode = process.argv[2];
if (mode === 'score') await score();
else if (mode === 'gate') await gate();
else throw new Error(`Unknown mode: ${mode}`);
