async function get(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

const enc = encodeURIComponent;

export const stories = () => get('/api/stories');
export const story = (name) => get(`/api/stories/${enc(name)}`);
export const file = (name, path) => get(`/api/stories/${enc(name)}/file?path=${enc(path)}`);
