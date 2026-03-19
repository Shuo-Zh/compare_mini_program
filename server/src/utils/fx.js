import { getWithRetry } from './httpClient.js';

const FALLBACK = {
  CNY: 1,
  USD: 7.2,
  EUR: 7.8,
  GBP: 9.1,
  HKD: 0.92
};

let cache = {
  ts: 0,
  rates: { ...FALLBACK }
};

export async function getRates() {
  const now = Date.now();
  if (now - cache.ts < 30 * 60 * 1000) return cache.rates;

  try {
    const response = await getWithRetry('https://open.er-api.com/v6/latest/CNY', { timeout: 8000, retries: 1 });
    const rates = response.data?.rates || {};
    cache = {
      ts: now,
      rates: {
        CNY: 1,
        USD: safeInvert(rates.USD, FALLBACK.USD),
        EUR: safeInvert(rates.EUR, FALLBACK.EUR),
        GBP: safeInvert(rates.GBP, FALLBACK.GBP),
        HKD: safeInvert(rates.HKD, FALLBACK.HKD)
      }
    };
  } catch (_error) {
    cache = {
      ts: now,
      rates: { ...FALLBACK }
    };
  }

  return cache.rates;
}

function safeInvert(v, fallback) {
  if (!v || Number.isNaN(v)) return fallback;
  return Number((1 / v).toFixed(4));
}

export async function toCny(amount, currency) {
  const rates = await getRates();
  const rate = rates[currency] || 1;
  return Math.round(amount * rate * 100) / 100;
}
