/**
 * 相関図の放射状レイアウト。主人公（なければ最もつながりの多い人物）を中心に、つながりの近さで輪を作る。
 * 決定的で、同じ入力は同じ座標になる。兄弟の並びは ids の順。
 * 力学配置と違い、箱いっぱいに広がり、章を変えても配置の癖が出ない。
 *
 * @param {{ ids: string[], links: [string, string][], rootId?: string, width: number, height: number, margin?: {x:number,y:number} }} input
 * @returns {Record<string, {x:number, y:number}>} 箱の左上を原点とする座標
 */
export function radialLayout({ ids, links, rootId, width, height, margin = { x: 72, y: 40 } }) {
  if (!ids.length) return {};
  const cx = width / 2, cy = height / 2;
  const order = new Map(ids.map((id, i) => [id, i]));
  const adj = new Map(ids.map((id) => [id, []]));
  for (const [a, b] of links) {
    if (adj.has(a) && adj.has(b) && a !== b) { adj.get(a).push(b); adj.get(b).push(a); }
  }
  for (const list of adj.values()) list.sort((p, q) => order.get(p) - order.get(q));

  const root = ids.includes(rootId) ? rootId : ids.reduce((best, id) => (adj.get(id).length > adj.get(best).length ? id : best), ids[0]);
  const depth = new Map([[root, 0]]);
  const children = new Map(ids.map((id) => [id, []]));
  const queue = [root];
  for (let i = 0; i < queue.length; i++) {
    for (const next of adj.get(queue[i])) {
      if (depth.has(next)) continue;
      depth.set(next, depth.get(queue[i]) + 1);
      children.get(queue[i]).push(next);
      queue.push(next);
    }
  }
  for (const id of ids) {
    if (depth.has(id)) continue;
    depth.set(id, 1);
    children.get(root).push(id);
  }

  const leaves = new Map();
  const countLeaves = (id) => {
    const kids = children.get(id);
    const n = kids.length ? kids.reduce((sum, k) => sum + countLeaves(k), 0) : 1;
    leaves.set(id, n);
    return n;
  };
  countLeaves(root);
  /* 子の多い人物に角度を取られすぎないよう、葉の数をそのまま使わず弱める */
  const weight = (id) => leaves.get(id) ** 0.55;

  const maxDepth = Math.max(...depth.values());
  const radius = (d) => (maxDepth === 1 ? 0.8 : 0.68 + (0.32 * (d - 1)) / (maxDepth - 1));
  const rx = Math.max(width / 2 - margin.x, 20), ry = Math.max(height / 2 - margin.y, 20);

  const out = { [root]: { x: cx, y: cy } };
  const place = (id, start, end) => {
    let cursor = start;
    for (const kid of children.get(id)) {
      const span = ((end - start) * weight(kid)) / children.get(id).reduce((sum, k) => sum + weight(k), 0);
      const angle = cursor + span / 2;
      const r = radius(depth.get(kid));
      out[kid] = { x: cx + Math.cos(angle) * r * rx, y: cy + Math.sin(angle) * r * ry };
      place(kid, cursor, cursor + span);
      cursor += span;
    }
  };
  place(root, -Math.PI / 2 - Math.PI / Math.max(children.get(root).length, 1), (3 * Math.PI) / 2 - Math.PI / Math.max(children.get(root).length, 1));
  return out;
}
