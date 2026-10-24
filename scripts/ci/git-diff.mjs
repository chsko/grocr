// Reads a commit range from the local git repo in the shape the jev checks use.
import { execFileSync } from 'node:child_process';

const git = (...args) =>
  execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });

const STATUS = { A: 'added', M: 'modified', D: 'removed', R: 'renamed', C: 'copied', T: 'changed' };

/** Changed files between two commits, with line counts and patches. */
export function diffFiles(from, to) {
  const numstat = new Map();
  for (const line of git('diff', '--numstat', '--no-renames', from, to).split('\n')) {
    const [add, del, file] = line.split('\t');
    if (file) numstat.set(file, { additions: Number(add) || 0, deletions: Number(del) || 0 });
  }
  return git('diff', '--name-status', '--no-renames', from, to)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [code, filename] = line.split('\t');
      return {
        filename,
        status: STATUS[code[0]] ?? code,
        ...numstat.get(filename),
        patch: git('diff', from, to, '--', filename),
      };
    });
}

/** A file's text at a commit, or undefined if it does not exist there. */
export function fileAt(ref, path) {
  try {
    return git('show', `${ref}:${path}`);
  } catch {
    return undefined;
  }
}

/** Commit messages in the range (from, to]. */
export function commitMessages(from, to) {
  return git('log', '--format=%B%x00', `${from}..${to}`)
    .split('\0')
    .filter((m) => m.trim());
}
