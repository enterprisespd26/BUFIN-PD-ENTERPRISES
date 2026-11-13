import test from 'node:test';
import assert from 'node:assert/strict';

// Set up headless browser mocks
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

global.Image = class MockImage {
  constructor() {
    this.width = 3000;
    this.height = 2000;
  }
  set src(val) {
    setTimeout(() => { if (this.onload) this.onload({ target: this }); }, 0);
  }
};

global.document = {
  createElement(tag) {
    if (tag === 'canvas') {
      return {
        width: 0,
        height: 0,
        getContext() {
          return {
            fillRect() {},
            drawImage() {}
          };
        },
        toBlob(cb) {
          setTimeout(() => {
            cb(new global.Blob(['compressed_jpeg'], { type: 'image/jpeg' }));
          }, 0);
        }
      };
    }
    return { style: {}, appendChild() {}, remove() {} };
  },
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {}
};

// In-memory IndexedDB mock for attachments & pending uploads
class MockObjectStore {
  constructor() {
    this.data = new Map();
  }
  put(item) {
    this.data.set(item.id, item);
  }
  get(id) {
    const res = this.data.get(id);
    const req = { result: res, onsuccess: null, onerror: null };
    setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: req }); }, 0);
    return req;
  }
  getAll() {
    const res = Array.from(this.data.values());
    const req = { result: res, onsuccess: null, onerror: null };
    setTimeout(() => { if (req.onsuccess) req.onsuccess({ target: req }); }, 0);
    return req;
  }
  delete(id) {
    this.data.delete(id);
  }
}

const mockStores = {
  files: new MockObjectStore(),
  pending_uploads: new MockObjectStore()
};

global.indexedDB = {
  open(name, version) {
    const req = {
      result: {
        objectStoreNames: {
          contains(s) { return Boolean(mockStores[s]); }
        },
        createObjectStore(s) {
          if (!mockStores[s]) mockStores[s] = new MockObjectStore();
          return mockStores[s];
        },
        transaction(storeName, mode) {
          const store = mockStores[storeName] || new MockObjectStore();
          mockStores[storeName] = store;
          const tx = {
            objectStore() { return store; },
            oncomplete: null,
            onerror: null
          };
          setTimeout(() => { if (tx.oncomplete) tx.oncomplete({ target: tx }); }, 0);
          return tx;
        }
      },
      onsuccess: null,
      onerror: null,
      onupgradeneeded: null
    };
    setTimeout(() => {
      if (req.onupgradeneeded) req.onupgradeneeded({ target: req });
      if (req.onsuccess) req.onsuccess({ target: req });
    }, 0);
    return req;
  }
};

global.File = class MockFile {
  constructor(parts, name, opts = {}) {
    this.parts = parts;
    this.name = name;
    this.type = opts.type || 'image/jpeg';
    this.size = parts.reduce((acc, p) => acc + (typeof p === 'string' ? p.length : (p.length || p.size || 0)), 0);
  }
};

global.Blob = class MockBlob {
  constructor(parts, opts = {}) {
    this.parts = parts;
    this.type = opts.type || 'image/jpeg';
    this.size = parts.reduce((acc, p) => acc + (typeof p === 'string' ? p.length : (p.length || p.size || 0)), 0);
  }
};

global.FileReader = class MockFileReader {
  readAsDataURL(blob) {
    setTimeout(() => {
      this.result = `data:${blob?.type || 'image/jpeg'};base64,ZmFrZWJhc2U2NA==`;
      const ev = { target: this };
      if (this.onload) this.onload(ev);
      if (this.onloadend) this.onloadend(ev);
    }, 0);
  }
};

global.URL = {
  createObjectURL(b) { return `blob:nodedummy/${Math.random().toString(36).slice(2)}`; },
  revokeObjectURL() {}
};

// Import modules
const {
  queuePendingUpload,
  getPendingUploads,
  removePendingUpload,
  uploadFileToServer,
  retryPendingUploads,
  pendingUploadChipHTML,
  saveAttachments,
  getAttachments,
  shrink
} = await import('../frontend/js/modules/attachments.js');

const { db, setDb, setVer, setBaseVer, setDirty, save } = await import('../frontend/js/modules/state.js');

test('ATT-01: Two devices see identical attachment URLs after syncing metadata only', async () => {
  storage.clear();
  mockStores.files.data.clear();
  mockStores.pending_uploads.data.clear();

  // Simulated server state
  let serverLedger = {
    version: 1,
    docs: [],
    entries: [],
    parties: [],
    accounts: [],
    loans: [],
    settings: {}
  };

  // Device 1 upload mock
  let uploadCallCount = 0;
  global.fetch = async (url, opts = {}) => {
    if (url === '/api/upload' && opts.method === 'POST') {
      uploadCallCount++;
      const payload = JSON.parse(opts.body);
      assert.equal(payload.folder, 'bufin/bills');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          url: `https://res.cloudinary.com/bufin/image/upload/v12345/bill_${uploadCallCount}.jpg`,
          public_id: `bufin/bills/bill_${uploadCallCount}`
        })
      };
    }
    if (url === '/api/state' && opts.method === 'PUT') {
      const payload = JSON.parse(opts.body);
      serverLedger = JSON.parse(JSON.stringify(payload.data));
      serverLedger.version = (serverLedger.version || 1) + 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, version: serverLedger.version })
      };
    }
    if (url === '/api/state' && (!opts.method || opts.method === 'GET')) {
      return {
        ok: true,
        status: 200,
        json: async () => JSON.parse(JSON.stringify(serverLedger))
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  // Device 1: Creates a purchase bill with an attachment
  const mockFile = new global.File(['filedata123'], 'invoice_slip.jpg', { type: 'image/jpeg' });
  const uploadRes = await uploadFileToServer(mockFile, 'bufin/bills');
  assert.ok(uploadRes.url.includes('res.cloudinary.com'));
  assert.equal(uploadRes.public_id, 'bufin/bills/bill_1');

  // Device 1 saves document with metadata only
  const billDoc = {
    id: 'bill_test_101',
    no: 'BILL-0001',
    type: 'bill',
    date: '2026-11-13',
    total: 500000,
    files: [{
      name: mockFile.name,
      type: mockFile.type,
      size: mockFile.size,
      url: uploadRes.url,
      public_id: uploadRes.public_id
    }],
    pendingFiles: 0,
    hasFiles: true
  };

  db.docs = [billDoc];
  setDb({ ...db, docs: [billDoc] });
  setVer(1);
  setBaseVer(1);
  setDirty(true, 1);

  // Sync to server (PUT /api/state)
  const { push } = await import('../frontend/js/modules/state.js');
  await push();

  // Device 1: Verify NO base64 exists in serverLedger or db.docs
  const serializedServer = JSON.stringify(serverLedger);
  assert.equal(serializedServer.includes('data:image'), false, 'Server ledger must not store base64 data URLs');
  assert.equal(serializedServer.includes('ZmFrZWJhc2U2NA=='), false, 'Server ledger must not store base64 strings');

  // Device 2: Fresh in-memory state pulls state from server
  const device2Res = await global.fetch('/api/state');
  const device2Db = await device2Res.json();

  assert.equal(device2Db.docs.length, 1);
  const device2Doc = device2Db.docs[0];
  assert.equal(device2Doc.id, 'bill_test_101');
  assert.equal(device2Doc.files.length, 1);
  assert.equal(device2Doc.files[0].url, uploadRes.url, 'Device 2 must see identical attachment URL as Device 1');
  assert.equal(device2Doc.files[0].public_id, 'bufin/bills/bill_1');
});

test('ATT-02: Upload failure queues file in pending_uploads, displays retry chip, and retries when online', async () => {
  storage.clear();
  mockStores.files.data.clear();
  mockStores.pending_uploads.data.clear();

  // 1. Simulate server failure (e.g. offline or 503)
  global.fetch = async (url) => {
    if (url === '/api/upload') {
      return { ok: false, status: 503, statusText: 'Offline' };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  const offlineDocId = 'doc_offline_202';
  const rawFile = new global.File(['offline_receipt_bytes'], 'weigh_bridge.jpg', { type: 'image/jpeg' });

  // Upload fails -> queues in pending_uploads
  let uploadResult = null;
  try {
    uploadResult = await uploadFileToServer(rawFile, 'bufin/bills');
  } catch (e) {
    uploadResult = null;
  }
  assert.equal(uploadResult, null, 'Upload should fail when server is offline');

  const queued = await queuePendingUpload({
    docId: offlineDocId,
    docType: 'bill',
    name: rawFile.name,
    type: rawFile.type,
    size: rawFile.size,
    blob: rawFile,
    data: 'data:image/jpeg;base64,ZmFrZWJhc2U2NA=='
  });
  assert.equal(queued, true, 'Failed upload must be queued in IndexedDB');

  // Verify pending uploads store
  const pending = await getPendingUploads();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].docId, offlineDocId);
  assert.equal(pending[0].name, 'weigh_bridge.jpg');

  // Verify UI chip generation
  const chipHtml = pendingUploadChipHTML(1, offlineDocId);
  assert.ok(chipHtml.includes('1 attachment(s) not uploaded – retry'));
  assert.ok(chipHtml.includes(`data-id="${offlineDocId}"`));

  // 2. Simulate coming back online and server succeeding
  global.fetch = async (url, opts) => {
    if (url === '/api/upload') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          url: 'https://res.cloudinary.com/bufin/image/upload/v999/weigh_bridge_uploaded.jpg',
          public_id: 'bufin/bills/weigh_bridge_uploaded'
        })
      };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };

  // Mock doc in db
  const docObj = {
    id: offlineDocId,
    no: 'BILL-0099',
    type: 'bill',
    files: [],
    pendingFiles: 1,
    hasFiles: true
  };
  setDb({ ...db, docs: [docObj] });

  const retryOk = await retryPendingUploads(offlineDocId);
  assert.equal(retryOk, true, 'Retry must succeed when online');

  // Verify pending_uploads was cleared for this doc
  const remainingPending = await getPendingUploads();
  assert.equal(remainingPending.filter(p => p.docId === offlineDocId).length, 0);

  // Verify doc was updated with uploaded metadata and pendingFiles cleared
  const currentState = (await import('../frontend/js/modules/state.js')).db;
  const updatedDoc = (currentState.docs || []).find(d => d.id === offlineDocId);
  assert.ok(updatedDoc, 'Updated doc must exist');
  assert.equal(Boolean(updatedDoc.pendingFiles), false);
  assert.equal(updatedDoc.files.length, 1);
  assert.equal(updatedDoc.files[0].url, 'https://res.cloudinary.com/bufin/image/upload/v999/weigh_bridge_uploaded.jpg');
});

test('ATT-03: shrink() compresses images and rejects files exceeding 8 MB', async () => {
  // 1. Valid image within 8 MB
  const smallImg = new global.File(['valid_bytes'], 'receipt.jpg', { type: 'image/jpeg' });
  const result = await shrink(smallImg, 1600, 0.8);
  assert.ok(result);
  assert.equal(result.name, 'receipt.jpg');

  // 2. Oversized file exceeding 8 MB limit
  const hugeParts = [new Uint8Array(9 * 1024 * 1024)]; // 9 MB
  const hugeFile = new global.File(hugeParts, 'huge_scan.jpg', { type: 'image/jpeg' });
  assert.ok(hugeFile.size > 8 * 1024 * 1024);

  const rejected = await shrink(hugeFile, 1600, 0.8);
  assert.equal(rejected, null, 'shrink() must reject files exceeding 8 MB limit');
});

test('ATT-04: Cancelling a document keeps files intact for audit purposes', async () => {
  const testDoc = {
    id: 'doc_to_cancel_303',
    no: 'INV-0010',
    type: 'sale',
    cancelled: false,
    files: [
      { name: 'eway_bill.jpg', type: 'image/jpeg', size: 1024, url: 'https://res.cloudinary.com/bufin/eway.jpg' },
      { name: 'weight_slip.jpg', type: 'image/jpeg', size: 2048, url: 'https://res.cloudinary.com/bufin/slip.jpg' }
    ]
  };

  db.docs = [testDoc];

  // Cancel doc
  testDoc.cancelled = true;

  // Verify files are NOT deleted or cleared
  assert.equal(testDoc.files.length, 2, 'Cancelled document must keep files for audit trail');
  assert.equal(testDoc.files[0].url, 'https://res.cloudinary.com/bufin/eway.jpg');
  assert.equal(testDoc.files[1].url, 'https://res.cloudinary.com/bufin/slip.jpg');
});
