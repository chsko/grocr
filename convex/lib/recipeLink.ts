/**
 * Links from a recipe to its page on the web (GRO-71), shared by the server and the app.
 * Written without the `URL` class so Hermes and the Convex runtime agree on every input.
 */

export const MAX_RECIPE_URL = 2000;

// C0/C1 controls, zero-width characters, bidi marks and overrides, and the byte order mark.
// eslint-disable-next-line no-control-regex
const HIDDEN = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/;

/**
 * The link to save for what a member typed: '' for nothing, `null` when it can't be a web page
 * (another scheme like javascript: or mailto:, hidden characters, a sign-in part, no real host), and
 * otherwise the link with https:// added when no scheme was typed.
 */
export function normalizeRecipeUrl(input: string): string | null {
  let text = input.trim();
  if (text === '') return '';
  // Control, bidi and zero-width characters can make the shown site name lie.
  if (HIDDEN.test(text)) return null;
  if (/\s/.test(text)) {
    // Share sheets often copy "Tacos | MatPrat https://www.matprat.no/...": take the one link.
    const links = text.match(/https?:\/\/\S+/gi);
    if (links?.length !== 1) return null;
    text = links[0];
  }

  let url: string;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(text);
  if (scheme && /^https?:\/\//i.test(text)) {
    url = scheme[1].toLowerCase() + text.slice(scheme[1].length);
  } else if (scheme && !/^[^:]+:\d/.test(text)) {
    // javascript:, mailto:, intent: and friends. "host:8080/..." is a port, not a scheme.
    return null;
  } else {
    url = `https://${text.replace(/^\/\//, '')}`;
  }

  const authority = /^https?:\/\/([^/?#]*)/.exec(url)![1];
  // user:pass@host can make a link look like it goes somewhere it doesn't.
  if (authority.includes('@')) return null;
  // A trailing dot (matprat.no.) is a valid fully qualified host.
  const host = authority.replace(/:\d{1,5}$/, '').replace(/\.$/, '');
  // At least one dot and no empty labels; letters outside ASCII are fine (blåbær.no).
  if (!/^[^.:[\]\\]+(\.[^.:[\]\\]+)+$/.test(host)) return null;
  return url.length > MAX_RECIPE_URL ? null : url;
}

/** The site a link goes to, for showing: "https://www.matprat.no/x" gives "matprat.no". */
export function recipeSite(url: string): string {
  const authority = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(url)?.[1] ?? url;
  return authority
    .replace(/:\d+$/, '')
    .replace(/\.$/, '')
    .replace(/^www\./i, '')
    .toLowerCase();
}
