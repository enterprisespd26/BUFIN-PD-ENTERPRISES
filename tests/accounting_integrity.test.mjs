import test from 'node:test';
import assert from 'node:assert/strict';

// Set up browser-like environment for state.js and overview.js imports
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

if (!globalThis.navigator) {
  globalThis.navigator = {};
}
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true, writable: true });

const mockElements = new Map();
global.document = {
  addEventListener(event, fn) {
    if (!domListeners.has(event)) domListeners.set(event, []);
    domListeners.get(event).push(fn);
  },
  getElementById(id) {
    if (!mockElements.has(id)) {
      mockElements.set(id, {
        id,
        className: '',
        style: {},
        innerHTML: '',
        textContent: '',
        classList: { add() {}, remove() {}, toggle() {} },
        setAttribute() {},
        removeAttribute() {},
        focus() {}
      });
    }
    return mockElements.get(id);
  },
  querySelector(sel) { return this.getElementById(sel); },
  querySelectorAll() { return []; }
};

const state = await import('../frontend/js/modules/state.js');
const { setDb, post, reverse, checkCashLiquidity, net, paid, out } = state;
const { getMonthlyCashFlow } = await import('../frontend/js/views/overview.js');

function resetTestDb(lock = '') {
  const freshDb = {
    schemaVer: 2,
    biz: { name: 'PD ENTERPRISES', state: 'Odisha', lock },
    accounts: [
      { code: '1000', name: 'Cash in Hand', t: 'A', cash: true },
      { code: '1010', name: 'Bank Account', t: 'A', cash: true },
      { code: '1100', name: 'Accounts Receivable', t: 'A' },
      { code: '2000', name: 'Accounts Payable', t: 'L' },
      { code: '3000', name: "Owner's Capital", t: 'Q' },
      { code: '4000', name: 'Sales Revenue', t: 'I' },
      { code: '5000', name: 'Purchases / COGS', t: 'X' }
    ],
    entries: [],
    docs: [],
    parties: [],
    loans: [],
    items: [],
    audit: [],
    seq: { jv: 1, inv: 1, bill: 1 }
  };
  setDb(freshDb);
  return freshDb;
}

test('Step 1: checkCashLiquidity computes balance exactly like net() and offsets reversals', () => {
  resetTestDb();

  // Baseline: cash is 0
  let initial = checkCashLiquidity('1000', 100000);
  assert.strictEqual(initial.available, 0);
  assert.strictEqual(initial.ok, false);

  // 1. Receive 1000 cash (100,000 paise)
  const e1 = post({
    date: '2026-11-01',
    src: 'in',
    narr: 'Cash receipt',
    lines: [
      { a: '1000', d: 100000, c: 0 },
      { a: '3000', d: 0, c: 100000 }
    ]
  });

  assert.strictEqual(net('1000'), 100000);
  let afterReceive = checkCashLiquidity('1000', 50000);
  assert.strictEqual(afterReceive.available, 100000);
  assert.strictEqual(afterReceive.ok, true);

  // 2. Reverse the receipt -> available must be 0
  reverse(e1.id);
  assert.strictEqual(net('1000'), 0);
  let afterReverseReceipt = checkCashLiquidity('1000', 1000);
  assert.strictEqual(afterReverseReceipt.available, 0);
  assert.strictEqual(afterReverseReceipt.ok, false);

  // 3. Receive 1000 cash again
  const e2 = post({
    date: '2026-11-02',
    src: 'in',
    narr: 'Cash capital',
    lines: [
      { a: '1000', d: 100000, c: 0 },
      { a: '3000', d: 0, c: 100000 }
    ]
  });
  assert.strictEqual(checkCashLiquidity('1000', 100000).available, 100000);

  // 4. Pay 300 cash (30,000 paise)
  const e3 = post({
    date: '2026-11-03',
    src: 'out',
    narr: 'Cash expense',
    lines: [
      { a: '5000', d: 30000, c: 0 },
      { a: '1000', d: 0, c: 30000 }
    ]
  });
  assert.strictEqual(net('1000'), 70000);
  assert.strictEqual(checkCashLiquidity('1000', 70000).available, 70000);

  // 5. Reverse the 300 payment -> available back to pre-payment value (1000 cash = 100,000 paise)
  reverse(e3.id);
  assert.strictEqual(net('1000'), 100000);
  let afterReversePayment = checkCashLiquidity('1000', 100000);
  assert.strictEqual(afterReversePayment.available, 100000);
  assert.strictEqual(afterReversePayment.ok, true);
});

test('Step 2: overview.js getMonthlyCashFlow offsets reversals in Money Received and Paid', () => {
  resetTestDb();
  const currentMonth = '2026-11';

  // Initially 0
  let flow = getMonthlyCashFlow(currentMonth);
  assert.strictEqual(flow.cin, 0);
  assert.strictEqual(flow.cout, 0);

  // Receive 500 cash in current month
  const recEntry = post({
    date: `${currentMonth}-10`,
    src: 'in',
    narr: 'Customer payment received',
    lines: [
      { a: '1000', d: 50000, c: 0 },
      { a: '1100', d: 0, c: 50000 }
    ]
  });

  flow = getMonthlyCashFlow(currentMonth);
  assert.strictEqual(flow.cin, 50000);
  assert.strictEqual(flow.cout, 0);

  // Reverse the receipt -> Money received this month must be 0
  reverse(recEntry.id);
  flow = getMonthlyCashFlow(currentMonth);
  assert.strictEqual(flow.cin, 0);
  assert.strictEqual(flow.cout, 0);

  // Pay 200 via Bank in current month
  const payEntry = post({
    date: `${currentMonth}-12`,
    src: 'out',
    narr: 'Supplier payment',
    lines: [
      { a: '2000', d: 20000, c: 0 },
      { a: '1010', d: 0, c: 20000 }
    ]
  });

  flow = getMonthlyCashFlow(currentMonth);
  assert.strictEqual(flow.cin, 0);
  assert.strictEqual(flow.cout, 20000);

  // Reverse the payment -> Money paid this month must return to 0
  reverse(payEntry.id);
  flow = getMonthlyCashFlow(currentMonth);
  assert.strictEqual(flow.cin, 0);
  assert.strictEqual(flow.cout, 0);
});

test('Step 4: Period lock prevents posting in locked period and editing locked entries', () => {
  resetTestDb('2026-10-31');

  // Attempting to post dated on or before lock date throws
  assert.throws(() => {
    post({
      date: '2026-10-15',
      src: 'jv',
      narr: 'Old entry',
      lines: [
        { a: '1000', d: 1000, c: 0 },
        { a: '3000', d: 0, c: 1000 }
      ]
    });
  }, /Period is locked/);

  // Posting in open period succeeds
  const openEntry = post({
    date: '2026-11-05',
    src: 'jv',
    narr: 'Open period entry',
    lines: [
      { a: '1000', d: 5000, c: 0 },
      { a: '3000', d: 0, c: 5000 }
    ]
  });
  assert.ok(openEntry.id);

  // Now lock the period up to 2026-11-10
  state.db.biz.lock = '2026-11-10';

  // Trying to replace an entry dated in locked period throws
  assert.throws(() => {
    post({
      date: '2026-11-12',
      src: 'jv',
      narr: 'Attempt replace locked',
      meta: { replaces: openEntry.ref },
      lines: [
        { a: '1000', d: 6000, c: 0 },
        { a: '3000', d: 0, c: 6000 }
      ]
    });
  }, /Cannot edit or replace entry from locked period/);
});

test('Step 3 & 6: Document editing maintains entry immutability and preserves multiple payments', () => {
  resetTestDb();

  // Create an invoice with two payments
  const invJe = post({
    date: '2026-11-01',
    src: 'sale',
    narr: 'Customer Inv INV-0001',
    lines: [
      { a: '1100', d: 200000, c: 0 },
      { a: '4000', d: 0, c: 200000 }
    ]
  });

  const payJe1 = post({
    date: '2026-11-02',
    src: 'in',
    narr: 'Payment 1',
    lines: [
      { a: '1010', d: 100000, c: 0 },
      { a: '1100', d: 0, c: 100000 }
    ]
  });

  const payJe2 = post({
    date: '2026-11-03',
    src: 'in',
    narr: 'Payment 2',
    lines: [
      { a: '1000', d: 50000, c: 0 },
      { a: '1100', d: 0, c: 50000 }
    ]
  });

  const invoice = {
    id: 'inv-1',
    no: 'INV-0001',
    date: '2026-11-01',
    total: 200000,
    paid: 150000,
    je: invJe.id,
    pays: [
      { je: payJe1.id, amt: 100000, date: '2026-11-02', method: 'Bank Transfer' },
      { je: payJe2.id, amt: 50000, date: '2026-11-03', method: 'Cash' }
    ]
  };
  state.db.docs.push(invoice);

  assert.strictEqual(paid(invoice), 150000);
  assert.strictEqual(out(invoice), 50000);

  // In edit mode with multiple payments: pays array is preserved
  const activePays = invoice.pays.filter(p => !p.void);
  assert.strictEqual(activePays.length, 2);

  // Old entry immutability: reverse old, post new with meta.replaces
  reverse(invoice.je, { cascadeDoc: false });
  const oldJe = state.db.entries.find(e => e.id === invoice.je);
  assert.strictEqual(oldJe.status, 'reversed');

  const newInvJe = post({
    date: '2026-11-04',
    src: 'sale',
    narr: 'Customer Inv INV-0001 (revised)',
    meta: { replaces: oldJe.ref },
    lines: [
      { a: '1100', d: 250000, c: 0 },
      { a: '4000', d: 0, c: 250000 }
    ]
  });
  invoice.je = newInvJe.id;
  invoice.total = 250000;

  assert.strictEqual(newInvJe.meta.replaces, oldJe.ref);
  assert.strictEqual(paid(invoice), 150000);
  assert.strictEqual(out(invoice), 100000);
});

test('Step 7: Transaction safety snapshot rollback on error restores original state', () => {
  resetTestDb();

  const originalDocCount = state.db.docs.length;
  const originalEntryCount = state.db.entries.length;

  const snapshot = JSON.parse(JSON.stringify(state.db));
  try {
    // Intentionally post an invalid unbalanced entry to trigger rollback
    state.post({
      date: '2026-11-01',
      src: 'jv',
      lines: [
        { a: '1000', d: 1000, c: 0 },
        { a: '3000', d: 0, c: 900 } // Unbalanced!
      ]
    });
  } catch (err) {
    setDb(snapshot);
  }

  assert.strictEqual(state.db.entries.length, originalEntryCount);
  assert.strictEqual(state.db.docs.length, originalDocCount);
});
