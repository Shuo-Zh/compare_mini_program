// Lightweight text similarity for "same item" grouping across platforms.
// This is intentionally heuristic and best-effort (no ML).

export function normalizeTitle(input) {
  const s = String(input || '')
    .toLowerCase()
    .replace(/&amp;/g, '&')
    .replace(/[\u2010-\u2015]/g, '-') // dashes
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove common noise tokens.
  return s
    .replace(/\b(women|woman|men|man|kids|new|season|sale|exclusive|official)\b/g, ' ')
    .replace(/\b(size|sizes|colour|color)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenizeTitle(title) {
  const s = normalizeTitle(title);
  if (!s) return [];
  // Keep meaningful 2+ length tokens; numbers are allowed (style codes etc).
  const toks = s.split(' ').filter((t) => t.length >= 2);
  // De-duplicate but keep order.
  const seen = new Set();
  const out = [];
  for (const t of toks) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export function jaccard(aTokens, bTokens) {
  const a = new Set(aTokens || []);
  const b = new Set(bTokens || []);
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const uni = a.size + b.size - inter;
  return uni ? inter / uni : 0;
}

export function extractStyleCode(title) {
  // Fashion style codes are often 6-14 alphanum. Keep uppercase for stability.
  const s = String(title || '').toUpperCase();
  const m = s.match(/\b[A-Z0-9]{6,14}\b/);
  return m ? m[0] : '';
}

export function groupSimilarProducts(products, { threshold = 0.8 } = {}) {
  const rows = Array.isArray(products) ? products : [];
  const n = rows.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  const tokens = rows.map((p) => tokenizeTitle(p.title || p.name || ''));
  const style = rows.map((p) => p?.signals?.modelCode || p?.sku || p?.modelCode || extractStyleCode(p.title || ''));
  const brand = rows.map((p) => extractBrand(p?.brand || p?.title || ''));
  const priceCny = rows.map((p) => Number(p?.priceCny || p?.price || 0));

  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }

  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  }

  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      // Fast gates: require at least one shared token among first few, unless style code matches.
      if (style[i] && style[i] === style[j]) {
        union(i, j);
        continue;
      }

      // Strong brand+price+token signal.
      if (brand[i] && brand[i] === brand[j]) {
        const shared = sharedTokens(tokens[i], tokens[j]);
        if (shared >= 2 && priceClose(priceCny[i], priceCny[j])) {
          union(i, j);
          continue;
        }
      }

      const sim = jaccard(tokens[i], tokens[j]);
      if (sim >= threshold) {
        union(i, j);
        continue;
      }

      // Containment fallback for very short titles.
      const ni = normalizeTitle(rows[i].title || '');
      const nj = normalizeTitle(rows[j].title || '');
      if (ni && nj && (ni.includes(nj) || nj.includes(ni)) && sim >= 0.55) {
        union(i, j);
      }
    }
  }

  const groups = new Map(); // root -> indices
  for (let i = 0; i < n; i += 1) {
    const r = find(i);
    const arr = groups.get(r) || [];
    arr.push(i);
    groups.set(r, arr);
  }

  let gid = 0;
  const groupByIndex = new Array(n).fill('');
  const outGroups = [];

  for (const indices of groups.values()) {
    if (indices.length < 2) continue; // only mark when there's a cross-item match
    gid += 1;
    const id = `G${gid}`;
    for (const idx of indices) groupByIndex[idx] = id;
    outGroups.push({
      id,
      size: indices.length,
      sampleTitle: rows[indices[0]]?.title || '',
      items: indices.map((idx) => ({
        platform: rows[idx]?.platform || '',
        id: rows[idx]?.id || '',
        title: rows[idx]?.title || '',
        url: rows[idx]?.url || '',
        priceCny: rows[idx]?.priceCny || rows[idx]?.price || 0,
      })),
    });
  }

  return { groupByIndex, groups: outGroups };
}

function extractBrand(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  // If input is already a brand field, keep the first token.
  const tokens = s.split(/\s+/).filter(Boolean);
  if (!tokens.length) return '';
  return tokens[0].toLowerCase();
}

function sharedTokens(a = [], b = []) {
  const set = new Set(a || []);
  let count = 0;
  for (const t of b || []) {
    if (set.has(t)) count += 1;
  }
  return count;
}

function priceClose(a, b) {
  const x = Number(a || 0);
  const y = Number(b || 0);
  if (!x || !y) return false;
  const ratio = Math.max(x, y) / Math.min(x, y);
  return ratio <= 1.3;
}
