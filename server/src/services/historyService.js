import {
  saveRun as saveRunJsonl,
  listRuns as listRunsJsonl,
  getRunById as getRunByIdJsonl,
  getTrendsFromJsonl,
  getJsonlPath
} from './historyStore.js';
import {
  saveRunSqlite,
  listRunsSqlite,
  getRunByIdSqlite,
  getTrendsSqlite,
  updateRunImagePathSqlite,
  getSqlitePath
} from './historySqliteStore.js';

const backend = (process.env.HISTORY_BACKEND || 'sqlite').toLowerCase();

export async function saveRun(payload) {
  if (backend === 'jsonl') return saveRunJsonl(payload);
  try {
    return await saveRunSqlite(payload);
  } catch (_error) {
    return saveRunJsonl(payload);
  }
}

export async function listRuns(limit = 20) {
  if (backend === 'jsonl') return listRunsJsonl(limit);
  try {
    return await listRunsSqlite(limit);
  } catch (_error) {
    return listRunsJsonl(limit);
  }
}

export async function getRunById(id) {
  if (backend === 'jsonl') return getRunByIdJsonl(id);
  try {
    return await getRunByIdSqlite(id);
  } catch (_error) {
    return getRunByIdJsonl(id);
  }
}

export async function getTrends(filters = {}) {
  if (backend === 'jsonl') return getTrendsFromJsonl(filters);
  try {
    return await getTrendsSqlite(filters);
  } catch (_error) {
    return getTrendsFromJsonl(filters);
  }
}

export async function updateRunImagePath(id, imagePath) {
  if (backend === 'jsonl') return;
  try {
    await updateRunImagePathSqlite(id, imagePath);
  } catch (_error) {
    // ignore
  }
}

export function getStorageInfo() {
  return {
    preferred: backend,
    sqlitePath: getSqlitePath(),
    jsonlPath: getJsonlPath()
  };
}
