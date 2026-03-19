import axios from 'axios';

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
];

export async function getWithRetry(url, options = {}) {
  const {
    retries = 2,
    timeout = 12000,
    headers = {},
    validateStatus
  } = options;

  let lastError;
  for (let i = 0; i <= retries; i += 1) {
    try {
      const response = await axios.get(url, {
        timeout,
        // Force plain text to avoid axios auto-JSON parsing which breaks evidence capture and regex scrapers.
        responseType: 'text',
        transformResponse: [(data) => data],
        transitional: { forcedJSONParsing: false },
        headers: {
          'user-agent': USER_AGENTS[i % USER_AGENTS.length],
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
          ...headers
        },
        validateStatus
      });

      return response;
    } catch (error) {
      lastError = error;
      await sleep(250 * (i + 1));
    }
  }

  throw lastError;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
