// Minimal server-side client for jev, TypeSafe's System One model (https://api.typesafe.ai/docs).
// The key is the TYPESAFE_API_KEY Convex env var; without it every jev feature is skipped.

const JEV_URL = 'https://api.typesafe.ai/v1/systemone';

export type JevChoice = { choice: string; confidence: number };

export function jevEnabled() {
  return Boolean(process.env.TYPESAFE_API_KEY);
}

/** Asks jev to pick one of `criteria` for `state`. Null when jev is off, down or unsure. */
export async function askJevChoice(
  state: unknown,
  instructions: string,
  criteria: Record<string, string>,
  fetchImpl: typeof fetch = fetch,
): Promise<JevChoice | null> {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) return null;
  try {
    const response = await fetchImpl(JEV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'jev-latest',
        state,
        questions: { answer: { type: 'choice', instructions, criteria } },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      console.warn(`jev returned HTTP ${response.status}`);
      return null;
    }
    const body = (await response.json()) as {
      answers?: { answer?: { choice?: unknown; confidence?: unknown } };
    };
    const answer = body.answers?.answer;
    if (
      typeof answer?.choice !== 'string' ||
      typeof answer.confidence !== 'number' ||
      !Object.prototype.hasOwnProperty.call(criteria, answer.choice)
    ) {
      console.warn('jev gave an answer outside the choices');
      return null;
    }
    return { choice: answer.choice, confidence: answer.confidence };
  } catch (error) {
    console.warn(`jev is unreachable: ${(error as Error).name}`);
    return null;
  }
}
