/** Lower case without accents, so "rene" finds "René". Å keeps its ring; æ and ø have none. */
export function searchable(text: string) {
  return text.toLocaleLowerCase().normalize('NFD').replace(/[̀-̉̋-ͯ]/g, '').normalize('NFC').trim();
}

/** Whether any of the texts contains what was typed. An empty search matches everything. */
export function matchesSearch(query: string, ...texts: (string | null | undefined)[]) {
  const q = searchable(query);
  if (q === '') return true;
  return texts.some((text) => text != null && searchable(text).includes(q));
}
