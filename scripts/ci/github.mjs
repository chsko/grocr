// Tiny GitHub REST helper for CI scripts (uses the workflow's GITHUB_TOKEN).
import { Buffer } from 'node:buffer';
import { appendFileSync, readFileSync } from 'node:fs';

const API = process.env.GITHUB_API_URL ?? 'https://api.github.com';

export function prContext() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  return { event, repo: process.env.GITHUB_REPOSITORY, number: event.pull_request.number };
}

export async function gh(path, { method = 'GET', body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`GitHub ${method} ${path}: HTTP ${response.status} ${await response.text()}`);
  }
  return response.status === 204 ? null : response.json();
}

/** A repository file's text at a commit, or undefined if it does not exist there. */
export async function fileAt(repo, path, ref) {
  try {
    const file = await gh(`/repos/${repo}/contents/${path}?ref=${ref}`);
    return Buffer.from(file.content, 'base64').toString('utf8');
  } catch (error) {
    if (String(error.message).includes('HTTP 404')) return undefined;
    throw error;
  }
}

export function summary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  console.log(markdown);
}
