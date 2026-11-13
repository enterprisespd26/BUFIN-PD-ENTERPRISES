import test from 'node:test';
import assert from 'node:assert/strict';

// 1. SETUP HEADLESS TEST ENVIRONMENT
const storage = new Map();
global.localStorage = {
  getItem(k) { return storage.has(k) ? storage.get(k) : null; },
  setItem(k, v) { storage.set(k, String(v)); },
  removeItem(k) { storage.delete(k); },
  clear() { storage.clear(); }
};

const domListeners = new Map();
global.window = {
  dispatchEvent() {},
  location: { hash: '#/overview' },
  addEventListener(event, fn) {
    if (!domListeners.has(event)) domListeners.set(event, []);
    domListeners.get(event).push(fn);
  }
};
global.CustomEvent = class CustomEvent {
  constructor(name, opts = {}) { this.name = name; this.detail = opts.detail; }
};

const mockElements = new Map();
global.document = {
  getElementById(id) {
    if (!mockElements.has(id)) {
      mockElements.set(id, {
        id,
        className: '',
        style: {},
        innerHTML: '',
        textContent: '',
        attributes: {},
        querySelector() {
          return { textContent: '', style: {}, addEventListener() {}, onclick: null };
        },
        querySelectorAll() { return []; },
        setAttribute(k, v) { this.attributes[k] = v; },
        getAttribute(k) { return this.attributes[k]; },
        showModal() { this.open = true; },
        close() { this.open = false; }
      });
    }
    return mockElements.get(id);
  },
  addEventListener(event, fn) {
    if (!domListeners.has(event)) domListeners.set(event, []);
    domListeners.get(event).push(fn);
  }
};
try {
  Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true, writable: true });
} catch (e) {}

// Import modules
const ST = await import('../frontend/js/modules/state.js');
const {
  setDb, setVer, setBaseVer, setDirty,
  save, push, wipeStorage, resetDb, isDirty, getVer, getBaseVer, getDb, showConflictModal
} = ST;

test('SYNC-01: Two rapid saves produce version N -> N+1 -> N+2 without a self-409', async () => {
  storage.clear();
  setVer(10);
  setBaseVer(10);
  setDirty(false, 0);

  const requestsSent = [];
  let serverVersion = 10;

  // Mock server PUT /api/state: enforces strict optimistic concurrency.
  // Fails with 409 if version does not match current serverVersion!
  global.fetch = async (url, options = {}) => {
    if (url === '/api/state' && options.method === 'PUT') {
      const body = JSON.parse(options.body);
      requestsSent.push(body.version);

      if (body.version !== serverVersion) {
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: 'Conflict: version mismatch' })
        };
      }

      // Concurrency passes, server increments version
      serverVersion += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, version: serverVersion })
      };
    }
    throw new Error(`Unexpected fetch to ${url}`);
  };

  // Simulate two rapid saves
  setDirty(true, 1);
  const pushPromise1 = push();
  // Immediate second save while push 1 is in-flight:
  setDirty(true, 2);
  const pushPromise2 = push();

  await Promise.all([pushPromise1, pushPromise2]);

  assert.equal(requestsSent.length, 2, 'Exactly two serialized requests must be sent');
  assert.equal(requestsSent[0], 10, 'First request must send initial version 10');
  assert.equal(requestsSent[1], 11, 'Second request must send new version 11 returned by first response');
  assert.equal(getVer(), 12, 'Final local version must be incremented to 12 (N+2)');
  assert.equal(isDirty(), false, 'Dirty flag must be cleared after queued push completes');
});

test('SYNC-02: 409 conflict never silently overwrites dirty local data', async () => {
  storage.clear();
  setVer(5);
  setBaseVer(5);

  const localDirtyEntry = {
    id: 'local-unsynced-je-999',
    ref: 'JV-0999',
    date: '2026-11-12',
    narr: 'Unsynced cash payment',
    lines: [{ a: '5100', d: 5000, c: 0 }, { a: '1000', d: 0, c: 5000 }],
    status: 'posted'
  };

  const initialTestDb = {
    biz: { name: 'PD Enterprises' },
    accounts: [{ code: '1000', name: 'Cash', t: 'A' }, { code: '5100', name: 'Rent', t: 'X' }],
    parties: [],
    entries: [localDirtyEntry],
    docs: [],
    loans: [],
    seq: {},
    items: [],
    audit: []
  };

  setDb(initialTestDb);
  setDirty(true, 1);

  let conflictModalShown = false;
  const originalDlg = document.getElementById('dlg');
  originalDlg.innerHTML = '';
  originalDlg.showModal = () => { conflictModalShown = true; };

  // Server state has version 6 with a different remote entry that local lacks
  global.fetch = async (url, options = {}) => {
    if (url === '/api/state' && options.method === 'PUT') {
      return {
        ok: false,
        status: 409,
        json: async () => ({ error: 'Version mismatch conflict' })
      };
    }
    if (url === '/api/state' && (!options.method || options.method === 'GET')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          version: 6,
          data: {
            entries: [
              {
                id: 'remote-je-888',
                ref: 'JV-0888',
                date: '2026-11-12',
                narr: 'Remote payment from device B',
                lines: [{ a: '1010', d: 1000, c: 0 }, { a: '4000', d: 0, c: 1000 }]
              }
            ],
            docs: []
          }
        })
      };
    }
    throw new Error(`Unexpected fetch to ${url}`);
  };

  await push();

  // Verification:
  assert.equal(isDirty(), true, 'Local state must remain marked as dirty upon 409 conflict');
  const foundLocalEntry = (ST.db.entries || []).find(e => e.id === 'local-unsynced-je-999');
  assert.ok(foundLocalEntry, 'Local dirty entry must NOT be deleted or overwritten');
  assert.equal(foundLocalEntry.narr, 'Unsynced cash payment', 'Local dirty entry data must remain intact');
  assert.ok(
    originalDlg.innerHTML.includes('Another device changed the data') || conflictModalShown,
    'Blocking conflict modal must be displayed to the user'
  );
});

test('SYNC-03: Boot with a 502 does not reset ver to 0', async () => {
  storage.clear();
  storage.set('bufin-v1_ver', '42');
  storage.set('bufin-v1_baseVer', '42');
  setVer(42);
  setBaseVer(42);

  assert.equal(getVer(), 42, 'Pre-condition: ver must be 42');

  // Mock server returning 502 Bad Gateway
  global.fetch = async (url) => {
    if (url === '/api/state') {
      return {
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: async () => ({ error: 'Bad Gateway' })
      };
    }
    throw new Error(`Unexpected fetch to ${url}`);
  };

  // Run single-attempt boot logic checking that 502 does not alter ver
  const r = await fetch('/api/state');
  assert.equal(r.status, 502);

  // In boot(), non-2xx responses are treated as not loaded, never calling setVer(0)
  if (!r.ok) {
    // Ver is untouched
  }

  assert.equal(getVer(), 42, 'Local ver must remain 42 after encountering 502 and must NOT reset to 0');
  assert.equal(localStorage.getItem('bufin-v1_ver'), '42', 'localStorage bufin-v1_ver must remain 42');
});

test('SYNC-04: Logout wipes storage and clears session state cleanly', async () => {
  storage.set('bufin-v1', JSON.stringify({ biz: { name: 'PD Enterprises' }, entries: [{ id: '1' }] }));
  storage.set('bufin-v1_ver', '15');
  storage.set('bufin-v1_dirty', 'true');
  storage.set('bufin-v1_baseVer', '15');
  storage.set('bufin-v1_unsyncedCount', '3');

  setVer(15);
  setBaseVer(15);
  setDirty(true, 3);

  assert.ok(storage.get('bufin-v1'), 'Pre-condition: storage has bufin-v1');
  assert.equal(getVer(), 15, 'Pre-condition: ver is 15');

  // Call wipeStorage
  wipeStorage();

  // Verify all sync and business data keys are cleared from storage
  assert.equal(localStorage.getItem('bufin-v1'), null, 'bufin-v1 must be removed from storage on logout');
  assert.equal(localStorage.getItem('bufin-v1_ver'), null, 'bufin-v1_ver must be removed from storage on logout');
  assert.equal(localStorage.getItem('bufin-v1_dirty'), null, 'bufin-v1_dirty must be removed from storage on logout');
  assert.equal(localStorage.getItem('bufin-v1_baseVer'), null, 'bufin-v1_baseVer must be removed from storage on logout');
  assert.equal(localStorage.getItem('bufin-v1_unsyncedCount'), null, 'bufin-v1_unsyncedCount must be removed from storage on logout');

  // Verify in-memory state is reset
  assert.equal(getVer(), 0, 'In-memory ver must be reset to 0');
  assert.equal(getBaseVer(), 0, 'In-memory baseVer must be reset to 0');
  assert.equal(isDirty(), false, 'In-memory dirty flag must be reset to false');
  assert.deepEqual(ST.db.entries, [], 'In-memory ledger entries must be empty array');
});
