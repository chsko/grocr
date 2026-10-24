import { appendFileSync } from 'node:fs';

/** Writes to the GitHub Actions job summary (and the log). */
export function summary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  console.log(markdown);
}
