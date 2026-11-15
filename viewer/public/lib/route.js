/** #/ → ホーム、#/s/<物語>[/<成果物>][?k=v] → 物語。URL が画面状態のすべて。 */

export function parse(hash) {
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
  const q = Object.fromEntries(new URLSearchParams(query));
  if (seg[0] === 's' && seg[1]) return { name: 'story', story: seg[1], docId: seg[2] ?? 'overview', q };
  return { name: 'home', q };
}

export function href(story, docId = 'overview', q = {}) {
  const query = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '' && v != null)).toString();
  const base = `#/s/${encodeURIComponent(story)}${docId === 'overview' ? '' : `/${docId}`}`;
  return query ? `${base}?${query}` : base;
}

export const HOME = '#/';
