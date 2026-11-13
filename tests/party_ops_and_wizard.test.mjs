import test from 'node:test';
import assert from 'node:assert/strict';

// Configure test environment variables so importing backend modules works cleanly in CI / clean environments without .env
process.env.NODE_ENV = 'test';
if (!process.env.APP_PIN && !process.env.APP_PASSWORD) {
  process.env.APP_PASSWORD = 'TestPassword123!';
}
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = 'bufin-test-session-secret-32-chars-minimum-length!';
}

// Set up browser-like environment for state and action imports
const storage = new Map();
globalThis.localStorage = {
  getItem(k) { return storage.has(k) ? storage.get(k) : null; },
  setItem(k, v) { storage.set(k, String(v)); },
  removeItem(k) { storage.delete(k); },
  clear() { storage.clear(); }
};

const domListeners = new Map();
globalThis.window = {
  dispatchEvent() {},
  location: { hash: '#/overview' },
  addEventListener(event, fn) {
    if (!domListeners.has(event)) domListeners.set(event, []);
    domListeners.get(event).push(fn);
  },
  matchMedia: () => ({ matches: false, addEventListener: () => {} })
};
globalThis.CustomEvent = class CustomEvent {
  constructor(name, opts = {}) { this.name = name; this.detail = opts.detail; }
};

if (!globalThis.navigator) {
  globalThis.navigator = {};
}
Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true, writable: true });
globalThis.confirm = () => true;
globalThis.prompt = () => '';

const mockElements = new Map();
globalThis.document = {
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
        value: '',
        classList: {
          add() {},
          remove() {},
          contains() { return false; },
          toggle() {}
        },
        querySelectorAll() { return []; },
        querySelector() { return null; }
      });
    }
    return mockElements.get(id);
  },
  querySelectorAll() { return []; },
  querySelector() { return null; },
  createElement() {
    return {
      style: {},
      classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
      appendChild() {},
      querySelectorAll() { return []; },
      querySelector() { return null; }
    };
  },
  head: { appendChild() {} },
  body: { appendChild() {} }
};

const state = await import('../frontend/js/modules/state.js');
const {
  db, setDb, isC, isS, isL, isX, partyTypeLabel,
  formatPrefix, getFiscalYear, isFirstRunNeeded,
  INDIAN_STATES, getStateByCode
} = state;

const actions = await import('../frontend/js/modules/actions.js');
const {
  canDeleteParty, deletePartyAction, executeDeleteParty,
  mergePartyModal, executeMergeParty,
  closeFinancialYearAction, executeCloseFinancialYear
} = actions;

function resetTestState() {
  setDb({
    biz: {
      name: 'Test Business',
      proprietor: 'Owner',
      gstin: '21ABCDE1234F1Z5',
      state: 'Odisha',
      prefix: 'INV/{FY}/',
      fyStart: '04-01',
      lock: ''
    },
    accounts: [
      { code: '1000', name: 'Cash in Hand', t: 'A', cash: true },
      { code: '1010', name: 'Bank Account', t: 'A', cash: true },
      { code: '1100', name: 'Accounts Receivable', t: 'A' },
      { code: '1200', name: 'Inventory', t: 'A' },
      { code: '2000', name: 'Loan Payable', t: 'L' },
      { code: '2100', name: 'Accounts Payable', t: 'L' },
      { code: '3200', name: 'Retained Earnings', t: 'Q' },
      { code: '4000', name: 'Sales Revenue', t: 'R' },
      { code: '5000', name: 'Cost of Goods Sold', t: 'X' },
      { code: '5100', name: 'Operating Expenses', t: 'X' }
    ],
    parties: [],
    entries: [],
    docs: [],
    loans: [],
    audit: [],
    seq: { jv: 1, doc: 1 }
  });
}

test('PARTY-DEL-01: Party with transactions cannot be deleted; party without transactions deletes cleanly', () => {
  resetTestState();

  const partyWithDocs = { id: 'p_has_docs', name: 'Customer With Docs', roles: ['customer'], type: 'customer' };
  const partyWithEntries = { id: 'p_has_entries', name: 'Supplier With Entries', roles: ['supplier'], type: 'supplier' };
  const partyWithLoans = { id: 'p_has_loans', name: 'Lender With Loans', roles: ['lender'], type: 'lender' };
  const cleanParty = { id: 'p_clean', name: 'Fresh Party', roles: ['customer'], type: 'customer' };

  state.db.parties.push(partyWithDocs, partyWithEntries, partyWithLoans, cleanParty);
  state.db.docs.push({ id: 'd1', party: 'p_has_docs', type: 'sale', total: 10000 });
  state.db.entries.push({ id: 'e1', date: '2026-11-01', lines: [{ a: '1000', d: 1000, c: 0, p: 'p_has_entries' }, { a: '5100', d: 0, c: 1000, p: 'p_has_entries' }] });
  state.db.loans.push({ id: 'l1', party: 'p_has_loans', principal: 500000 });

  const status1 = canDeleteParty('p_has_docs');
  assert.strictEqual(status1.can, false, 'Party with invoices must not be deletable');
  assert.strictEqual(status1.docsCount, 1);

  const status2 = canDeleteParty('p_has_entries');
  assert.strictEqual(status2.can, false, 'Party with journal entries must not be deletable');
  assert.strictEqual(status2.entriesCount, 1);

  const status3 = canDeleteParty('p_has_loans');
  assert.strictEqual(status3.can, false, 'Party with loans must not be deletable');
  assert.strictEqual(status3.loansCount, 1);

  const statusClean = canDeleteParty('p_clean');
  assert.strictEqual(statusClean.can, true, 'Party without any transactions must be deletable');

  // Perform deletion
  const delRes = executeDeleteParty('p_clean');
  assert.strictEqual(delRes.success, true);
  assert.strictEqual(state.db.parties.some(p => p.id === 'p_clean'), false, 'Clean party must be removed from db.parties');
});

test('PARTY-MERGE-01: Merging Party A into Party B reassigns docs, entries, loans, combines roles, and removes Party A', () => {
  resetTestState();

  const partyA = { id: 'p_source', name: 'Acme Traders Old', roles: ['supplier', 'lender'], type: 'both' };
  const partyB = { id: 'p_target', name: 'Acme Enterprises', roles: ['customer'], type: 'customer' };

  state.db.parties.push(partyA, partyB);
  state.db.docs.push(
    { id: 'd1', party: 'p_source', sup: 'Acme Traders Old', type: 'bill', total: 50000 },
    { id: 'd2', party: 'p_source', c: { id: 'p_source', n: 'Acme Traders Old' }, type: 'sale', total: 20000 }
  );
  state.db.entries.push({
    id: 'e1',
    meta: { party: 'p_source', partyName: 'Acme Traders Old' },
    lines: [
      { a: '1100', d: 20000, c: 0, p: 'p_source' },
      { a: '4000', d: 0, c: 20000 }
    ]
  });
  state.db.loans.push({
    id: 'l1',
    party: 'p_source',
    partyName: 'Acme Traders Old',
    principal: 100000
  });

  // Execute merge of A into B
  const mergeRes = executeMergeParty('p_source', 'p_target');
  assert.strictEqual(mergeRes.success, true);

  // Party A must be removed
  assert.strictEqual(state.db.parties.some(p => p.id === 'p_source'), false, 'Source party A must be removed');
  const target = state.db.parties.find(p => p.id === 'p_target');
  assert.ok(target, 'Target party B must exist');

  // Target roles must now include all roles from A and B
  assert.ok(target.roles.includes('customer'), 'Target must retain customer role');
  assert.ok(target.roles.includes('supplier'), 'Target must inherit supplier role from A');
  assert.ok(target.roles.includes('lender'), 'Target must inherit lender role from A');

  // Documents must be reassigned
  assert.strictEqual(state.db.docs[0].party, 'p_target');
  assert.strictEqual(state.db.docs[0].sup, 'Acme Enterprises');
  assert.strictEqual(state.db.docs[1].party, 'p_target');
  assert.strictEqual(state.db.docs[1].c.id, 'p_target');
  assert.strictEqual(state.db.docs[1].c.n, 'Acme Enterprises');

  // Entries must be reassigned
  assert.strictEqual(state.db.entries[0].meta.party, 'p_target');
  assert.strictEqual(state.db.entries[0].meta.partyName, 'Acme Enterprises');
  assert.strictEqual(state.db.entries[0].lines[0].p, 'p_target');

  // Loan must be reassigned
  assert.strictEqual(state.db.loans[0].party, 'p_target');
  assert.strictEqual(state.db.loans[0].partyName, 'Acme Enterprises');
});

test('PARTY-ROLES-01: Compound roles inspect correctly via isC, isS, isL, isX, and partyTypeLabel', () => {
  resetTestState();

  const multiParty = {
    id: 'p_multi',
    name: 'Multi Role Party',
    roles: ['customer', 'lender'],
    type: 'customer'
  };

  assert.strictEqual(isC(multiParty), true, 'Must recognize customer role');
  assert.strictEqual(isL(multiParty), true, 'Must recognize lender role');
  assert.strictEqual(isS(multiParty), false, 'Must not report supplier role');
  assert.strictEqual(partyTypeLabel(multiParty), 'Customer & Lender', 'Label must be compound Customer & Lender');
});

test('WIZ-01: isFirstRunNeeded() detects incomplete setup, and INDIAN_STATES lookup works', () => {
  resetTestState();

  // With a full business profile and no entries, first run is false because profile is populated
  assert.strictEqual(isFirstRunNeeded(), false);

  // Missing business name
  state.db.biz.name = '';
  assert.strictEqual(isFirstRunNeeded(), true);

  state.db.biz.name = 'Test Biz';
  state.db.biz.state = '';
  assert.strictEqual(isFirstRunNeeded(), true);

  // If transactions already exist, first run is false even if fields empty
  state.db.entries.push({ id: 'e_legacy', lines: [] });
  assert.strictEqual(isFirstRunNeeded(), false);

  // Test Indian states lookup
  assert.ok(INDIAN_STATES.length >= 36, 'All Indian states and UTs must be covered');
  const odisha = getStateByCode('21');
  assert.strictEqual(odisha?.name, 'Odisha');
  assert.strictEqual(odisha?.code, '21');
});

test('FY-01: Fiscal year calculation and {FY} prefix replacement', () => {
  // Test FY code generation: April 2026 to March 2027 is 2627
  assert.strictEqual(getFiscalYear('2026-04-01', '04-01').token, '2627');
  assert.strictEqual(getFiscalYear('2026-11-13', '04-01').token, '2627');
  assert.strictEqual(getFiscalYear('2027-03-31', '04-01').token, '2627');
  assert.strictEqual(getFiscalYear('2027-04-01', '04-01').token, '2728');

  // Test {FY} replacement
  assert.strictEqual(formatPrefix('PD/{FY}/', '2026-11-13', '04-01'), 'PD/2627/');
  assert.strictEqual(formatPrefix('INV-{FY}-', '2027-04-05', '04-01'), 'INV-2728-');
});

test('FY-02: Close Financial Year locks year, balances equilibrium, and carries forward accounts', () => {
  resetTestState();

  // Setup sample transactions for FY 2026-27
  // Income: 100,000 (Cr Revenue 4000)
  // Expenses: 40,000 (Dr Expense 5100)
  // Net profit = 60,000
  // Assets: Cash 60,000 (Dr Cash 1000)
  state.db.entries.push(
    {
      id: 'e1',
      date: '2026-05-10',
      status: 'posted',
      lines: [
        { a: '1000', d: 10000000, c: 0 },
        { a: '4000', d: 0, c: 10000000 }
      ]
    },
    {
      id: 'e2',
      date: '2026-08-15',
      status: 'posted',
      lines: [
        { a: '5100', d: 4000000, c: 0 },
        { a: '1000', d: 0, c: 4000000 }
      ]
    }
  );

  const res = executeCloseFinancialYear();
  assert.strictEqual(res.success, true, 'Close FY must succeed');
  assert.strictEqual(state.db.biz.lock, '2027-03-31', 'Lock date must be set to FY end');

  // Opening entry for next FY (2027-04-01) must exist
  const openEntry = state.db.entries.find(e => e.src === 'open' && e.date === '2027-04-01');
  assert.ok(openEntry, 'Next year opening balance entry must be created');
  assert.strictEqual(openEntry.status, 'posted');

  // Debits and Credits of opening entry must be balanced
  let totalD = 0;
  let totalC = 0;
  for (const l of openEntry.lines) {
    totalD += l.d || 0;
    totalC += l.c || 0;
  }
  assert.strictEqual(totalD, totalC, 'Opening balance entry must be in equilibrium');
  assert.strictEqual(totalD, 6000000, 'Cash balance of 60,000 must carry forward');

  // Net profit (60,000) must roll into Retained Earnings / Equity 3200
  const equityLine = openEntry.lines.find(l => l.a === '3200');
  assert.ok(equityLine, 'Retained Earnings (3200) line must exist in carry-forward entry');
  assert.strictEqual(equityLine.c, 6000000, 'P&L net income of 60,000 must roll into Retained Earnings credit');
});

test('SEC-01: Backend password change verifies current password and stores scrypt salt:hash', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const authFile = path.join(process.cwd(), 'backend', 'data', 'auth.json');

  const serverApp = await import('../backend/src/server.js');
  const { hashPassword, verifyPassword } = serverApp.default || serverApp;
  const storeModule = await import('../backend/src/store.js');
  const store = storeModule.default || storeModule;

  const oldPass = 'OldSecurePassword123!';
  const newPass = 'NewSecurePassword456!';

  try {
    const hashedOld = hashPassword(oldPass);
    assert.ok(hashedOld.includes(':'), 'Hash must contain salt and hash separated by colon');
    assert.strictEqual(verifyPassword(oldPass, hashedOld), true);
    assert.strictEqual(verifyPassword('WrongPassword', hashedOld), false);

    // Store new password
    const hashedNew = hashPassword(newPass);
    await store.setAuth(hashedNew);

    const storedAuth = await store.getAuth();
    assert.strictEqual(storedAuth, hashedNew, 'Store must persist the new scrypt hash');
    assert.strictEqual(verifyPassword(newPass, storedAuth), true);
    assert.strictEqual(verifyPassword(oldPass, storedAuth), false);
  } finally {
    if (fs.existsSync(authFile)) {
      try { fs.unlinkSync(authFile); } catch (e) {}
    }
  }
});
