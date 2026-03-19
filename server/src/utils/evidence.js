import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const EVIDENCE_DIR = path.join(process.cwd(), 'data', 'evidence');

export async function saveEvidence({ platform, url, html }) {
  await fs.mkdir(EVIDENCE_DIR, { recursive: true });

  const ts = Date.now();
  const hash = crypto.createHash('sha256').update(String(html || ''), 'utf8').digest('hex').slice(0, 16);
  const safePlatform = normalizePlatform(platform);

  const fileName = `${safePlatform}-${ts}-${hash}.html`;
  const absPath = path.join(EVIDENCE_DIR, fileName);

  const header = `<!--\nplatform: ${platform}\nurl: ${url}\nsavedAt: ${new Date(ts).toISOString()}\nsha256_16: ${hash}\n-->\n`;
  await fs.writeFile(absPath, header + String(html || ''), 'utf8');

  return {
    evidencePath: path.join('data', 'evidence', fileName).replace(/\\/g, '/'),
    evidenceUrlPath: `/evidence/${encodeURIComponent(fileName)}`,
    hash16: hash,
  };
}

function normalizePlatform(platform) {
  const p = String(platform || '').toLowerCase();
  if (p.includes('taobao') || p.includes('淘宝')) return 'taobao';
  if (p.includes('farfetch')) return 'farfetch';
  if (p.includes('jd') || p.includes('jingdong') || p.includes('京东')) return 'jd';
  if (p.includes('bookst') || p.includes('book') || p.includes('toscrape')) return 'books';
  if (!p) return 'unknown';
  return p.replace(/[^a-z0-9_-]/g, '_') || 'unknown';
}
