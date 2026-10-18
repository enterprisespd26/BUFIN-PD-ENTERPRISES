// BUFIN Offline IndexedDB Storage & Reference Data Cache
const DB_NAME = 'bufin_offline_db';
const DB_VERSION = 1;

let dbPromise = null;

export function openOfflineDb() {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);

  dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const idb = e.target.result;
        if (!idb.objectStoreNames.contains('core_ref')) {
          idb.createObjectStore('core_ref', { keyPath: 'key' });
        }
        if (!idb.objectStoreNames.contains('state_snapshot')) {
          idb.createObjectStore('state_snapshot', { keyPath: 'id' });
        }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = err => {
        console.warn('[OfflineStore] Failed to open IndexedDB:', err);
        resolve(null);
      };
    } catch (e) {
      console.warn('[OfflineStore] Exception opening IndexedDB:', e);
      resolve(null);
    }
  });

  return dbPromise;
}

/**
 * Cache core reference data (Chart of Accounts, active parties, recent journal entries, business details)
 */
export async function cacheCoreRef(stateData) {
  if (!stateData) return;
  const idb = await openOfflineDb();
  if (!idb) return;

  try {
    const tx = idb.transaction('core_ref', 'readwrite');
    const store = tx.objectStore('core_ref');

    // Chart of Accounts
    store.put({ key: 'accounts', value: stateData.accounts || [], updatedAt: Date.now() });
    // Active Parties
    store.put({ key: 'parties', value: stateData.parties || [], updatedAt: Date.now() });
    // Recent Journal Entries (last 50 entries for fast ledger reference)
    const recent = Array.isArray(stateData.entries) ? stateData.entries.slice(-50) : [];
    store.put({ key: 'recent_entries', value: recent, updatedAt: Date.now() });
    // Business profile
    store.put({ key: 'biz', value: stateData.biz || {}, updatedAt: Date.now() });
    // Scrap items
    store.put({ key: 'items', value: stateData.items || [], updatedAt: Date.now() });
  } catch (err) {
    console.warn('[OfflineStore] Error caching core reference data:', err);
  }
}

/**
 * Load core reference data from IndexedDB
 */
export async function loadCoreRef() {
  const idb = await openOfflineDb();
  if (!idb) return null;

  return new Promise(resolve => {
    try {
      const tx = idb.transaction('core_ref', 'readonly');
      const store = tx.objectStore('core_ref');
      const result = {};
      const keys = ['accounts', 'parties', 'recent_entries', 'biz', 'items'];
      let count = 0;

      keys.forEach(k => {
        const getReq = store.get(k);
        getReq.onsuccess = () => {
          if (getReq.result) {
            result[k] = getReq.result.value;
          }
          count++;
          if (count === keys.length) resolve(result);
        };
        getReq.onerror = () => {
          count++;
          if (count === keys.length) resolve(result);
        };
      });
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * Persist full state snapshot to IndexedDB
 */
export async function saveFullSnapshot(data, version) {
  if (!data) return;
  const idb = await openOfflineDb();
  if (!idb) return;

  try {
    const tx = idb.transaction('state_snapshot', 'readwrite');
    tx.objectStore('state_snapshot').put({
      id: 'current',
      version: version || 0,
      data,
      savedAt: new Date().toISOString()
    });
  } catch (e) {
    console.warn('[OfflineStore] Error saving snapshot:', e);
  }
}

/**
 * Retrieve full state snapshot from IndexedDB
 */
export async function loadFullSnapshot() {
  const idb = await openOfflineDb();
  if (!idb) return null;

  return new Promise(resolve => {
    try {
      const tx = idb.transaction('state_snapshot', 'readonly');
      const req = tx.objectStore('state_snapshot').get('current');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}
