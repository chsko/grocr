// Minimal client for jev, TypeSafe's System One model (https://api.typesafe.ai/docs).
// Used only in CI; the key comes from the TYPESAFE_API_KEY secret.

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone';

/**
 * Asks jev the given questions about `state`. Returns the answers keyed by question name, or
 * null when jev is not configured or unreachable: every jev check fails open.
 */
export async function askJev(
  state,
  questions,
  { apiKey = process.env.TYPESAFE_API_KEY, fetchImpl = fetch } = {},
) {
  if (!apiKey) {
    console.log('::warning::TYPESAFE_API_KEY is not set; skipping the jev check.');
    return null;
  }
  try {
    const response = await fetchImpl(JEV_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'jev-latest', state, questions }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500);
      console.log(`::warning::jev returned HTTP ${response.status}; skipping. ${detail}`);
      return null;
    }
    const body = await response.json();
    return body.answers;
  } catch (error) {
    console.log(`::warning::jev is unreachable (${error.message}); skipping.`);
    return null;
  }
}
