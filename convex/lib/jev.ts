// Minimal server-side client for jev, TypeSafe's System One model (https://api.typesafe.ai/docs).
// The key is the TYPESAFE_API_KEY Convex env var; without it every jev feature is skipped.

const JEV_URL = 'https://api.typesafe.ai/v1/systemone';

export type JevChoice = { choice: string; confidence: number };

export type JevQuestion = { instructions: string; criteria: Record<string, string> };

export function jevEnabled() {
  return Boolean(process.env.TYPESAFE_API_KEY);
}

/**
 * Asks jev several choice questions about one `state` in a single call. Each answer is null when
 * jev picked something outside that question's criteria; all are null when jev is off or down.
 */
export async function askJevChoices<K extends string>(
  state: unknown,
  questions: Record<K, JevQuestion>,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<K, JevChoice | null>> {
  const names = Object.keys(questions) as K[];
  const none = Object.fromEntries(names.map((name) => [name, null])) as Record<K, JevChoice | null>;
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey || names.length === 0) return none;
  try {
    const response = await fetchImpl(JEV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'jev-latest',
        state,
        questions: Object.fromEntries(
          names.map((name) => [name, { type: 'choice', ...questions[name] }]),
        ),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      console.warn(`jev returned HTTP ${response.status}`);
      return none;
    }
    const body = (await response.json()) as {
      answers?: Record<string, { choice?: unknown; confidence?: unknown } | undefined>;
    };
    const result = { ...none };
    for (const name of names) {
      const answer = body.answers?.[name];
      if (
        typeof answer?.choice !== 'string' ||
        typeof answer.confidence !== 'number' ||
        !Object.prototype.hasOwnProperty.call(questions[name].criteria, answer.choice)
      ) {
        console.warn('jev gave an answer outside the choices');
        continue;
      }
      result[name] = { choice: answer.choice, confidence: answer.confidence };
    }
    return result;
  } catch (error) {
    console.warn(`jev is unreachable: ${(error as Error).name}`);
    return none;
  }
}
