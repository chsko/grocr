// GRO-45: jev scores each PR's risk. High-risk PRs get the `needs-adversarial-review` label, and
// the gate fails until a repo admin or maintainer adds `adversarial-review-done` after an
// adversarial review. New pushes to a flagged PR remove that sign-off. Scoring fails open: if jev
// is unreachable or answers nonsense the PR is not labelled.
//
// Runs from the base branch (pull_request_target) and reads the PR through the API only.
//
// Usage: node scripts/ci/pr-risk.mjs score|gate
import { gh, prContext, summary } from './github.mjs';
import { askJev } from './jev.mjs';
import {
  describeFiles,
  gatePasses,
  NEEDS_REVIEW_LABEL,
  REVIEW_DONE_LABEL,
  RISK_LEVELS,
  RISK_QUESTION,
  riskLevel,
} from './lib.mjs';

const { event, repo, number } = prContext();
const issue = `/repos/${repo}/issues/${number}`;

const labelNames = async () => (await gh(`${issue}/labels`)).map((label) => label.name);

async function removeLabel(name) {
  await gh(`${issue}/labels/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

async function score() {
  const pr = event.pull_request;
  const files = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await gh(`/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`);
    files.push(...batch);
    if (batch.length < 100) break;
  }

  let current = await labelNames();
  if (event.action === 'synchronize' && current.includes(REVIEW_DONE_LABEL)) {
    // A sign-off covers the commits that were reviewed, not later pushes.
    await removeLabel(REVIEW_DONE_LABEL);
    current = current.filter((name) => name !== REVIEW_DONE_LABEL);
    summary('New commits were pushed, so the adversarial review sign-off was removed.');
  }

  const answers = await askJev(
    {
      title: pr.title,
      description: (pr.body ?? '').slice(0, 2000),
      changedFiles: describeFiles(files),
    },
    { risk: RISK_QUESTION },
  );
  const level = riskLevel(answers?.risk?.score);
  if (!level) {
    if (answers) console.log('::warning::jev returned no usable risk score; not labelling.');
    return;
  }

  const { score: value, confidence, probabilities } = answers.risk;
  summary(
    `### jev PR risk: **${level}**\n\nscore ${value} (0 = low, 2 = high), confidence ${confidence}, probabilities ${JSON.stringify(probabilities)}`,
  );

  for (const old of RISK_LEVELS.map((l) => `risk:${l}`)) {
    if (old !== `risk:${level}` && current.includes(old)) await removeLabel(old);
  }
  // Once flagged, a PR stays flagged: a later low score does not remove the review requirement.
  const labels = [`risk:${level}`, ...(level === 'high' ? [NEEDS_REVIEW_LABEL] : [])];
  await gh(`${issue}/labels`, { method: 'POST', body: { labels } });
}

/** Role (admin, maintain, write, ...) of whoever most recently added the review-done label. */
async function signOffRole() {
  const events = [];
  for (let page = 1; page <= 10; page++) {
    const batch = await gh(`${issue}/events?per_page=100&page=${page}`);
    events.push(...batch);
    if (batch.length < 100) break;
  }
  const signOff = events
    .filter((e) => e.event === 'labeled' && e.label?.name === REVIEW_DONE_LABEL)
    .at(-1);
  if (!signOff?.actor?.login) return undefined;
  const permission = await gh(`/repos/${repo}/collaborators/${signOff.actor.login}/permission`);
  return permission.role_name ?? permission.permission;
}

async function gate() {
  const labels = await labelNames();
  if (!labels.includes(NEEDS_REVIEW_LABEL)) {
    summary('No adversarial review required.');
    return;
  }
  const role = labels.includes(REVIEW_DONE_LABEL) ? await signOffRole() : undefined;
  if (gatePasses(labels, role)) {
    summary(`Adversarial review recorded (signed off by a repo ${role}).`);
    return;
  }
  summary(
    `jev rated this PR high risk. Run an adversarial review, address its findings, then a repo admin or maintainer adds the \`${REVIEW_DONE_LABEL}\` label.`,
  );
  console.log(
    `::error::High-risk PR: adversarial review required (an admin or maintainer adds ${REVIEW_DONE_LABEL} once done).`,
  );
  process.exitCode = 1;
}

const mode = process.argv[2];
if (mode === 'score') await score();
else if (mode === 'gate') await gate();
else throw new Error(`Unknown mode: ${mode}`);
