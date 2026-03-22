export function normalizeTitle(input = '') {
  return input
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim();
}

export function extractNikeDunkSignals(title = '') {
  const t = normalizeTitle(title);
  const hasNike = t.includes('nike');
  const hasDunk = t.includes('dunk');
  const lowHigh = t.includes(' low ') || t.endsWith(' low') ? 'low' : t.includes(' high ') || t.endsWith(' high') ? 'high' : '';
  const modelCode = (title.match(/\b[A-Z0-9]{6}-\d{3}\b/) || [])[0] || '';
  const colorway = guessColorway(t);

  return {
    hasNike,
    hasDunk,
    lowHigh,
    modelCode,
    colorway
  };
}

export function isNikeDunkLike(title = '') {
  const s = extractNikeDunkSignals(title);
  return s.hasNike && s.hasDunk;
}

export function matchesModelCode(title = '', targetCode = '') {
  if (!targetCode) return true;
  const normalizedTarget = targetCode.trim().toUpperCase();
  const code = extractNikeDunkSignals(title).modelCode.toUpperCase();
  return code === normalizedTarget;
}

function guessColorway(t) {
  const colors = ['black', 'white', 'blue', 'red', 'green', 'grey', 'gray', 'brown', 'pink', 'orange', 'yellow', 'navy'];
  const hit = colors.filter((c) => t.includes(c));
  return hit.slice(0, 2).join('/');
}

export function buildVariantKey(product) {
  const sig = extractNikeDunkSignals(product.title || '');
  if (sig.modelCode) return `code:${sig.modelCode}`;
  return ['nike-dunk', sig.lowHigh || 'any', sig.colorway || 'any'].join('|');
}
