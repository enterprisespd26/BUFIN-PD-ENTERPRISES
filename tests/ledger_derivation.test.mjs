import test from 'node:test';
import assert from 'node:assert/strict';

// Set up browser-like environment for state.js and view modules
const storage = new Map();
global.localStorage = {
  getItem(k) { return storage.has(k) ? storage.get(k) : null; },
  setItem(k, v) { storage.set(k, String(v)); },
  removeItem(k, v) { storage.delete(k); },
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
global.confirm = () => true;
global.prompt = () => '';

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
        focus() {},
        querySelector() { return null; },
        querySelectorAll() { return []; }
      });
    }
    return mockElements.get(id);
  },
  querySelector(sel) { return this.getElementById(sel); },
  querySelectorAll() { return []; }
};

const state = await import('../frontend/js/modules/state.js');
const {
  setDb, post, reverse, net, partyBalance, loanOutstanding,
  acc, sgn, ensureAdvanceAccounts, today
} = state;

const actions = await import('../frontend/js/modules/actions.js');
const { postLoanRepayment, findLinkedDoc } = actions;

const partiesView = await import('../frontend/js/views/parties.js');
const { tradeR, tradeY, loanR, loanY } = partiesView;

function resetTestDb() {
  const freshDb = {
    schemaVer: 2,
    biz: { name: 'PD ENTERPRISES', state: 'Odisha', prefix: 'PD/2627/' },
    accounts: [
      { code: '1000', name: 'Cash in Hand', t: 'A', cash: true },
      { code: '1010', name: 'Bank Account', t: 'A', cash: true },
      { code: '1100', name: 'Accounts Receivable', t: 'A' },
      { code: '1400', name: 'Loans & Advances Given', t: 'A' },
      { code: '1450', name: 'Supplier Advances', t: 'A' },
      { code: '2000', name: 'Accounts Payable', t: 'L' },
      { code: '2100', name: 'Loan Payable', t: 'L' },
      { code: '2300', name: 'Customer Advances', t: 'L' },
      { code: '3000', name: "Owner's Capital", t: 'Q' },
      { code: '3200', name: 'Opening Balance Equity', t: 'Q' },
      { code: '4000', name: 'Sales Revenue', t: 'I' },
      { code: '4300', name: 'Interest Income', t: 'I' },
      { code: '5000', name: 'Purchases / COGS', t: 'E' },
      { code: '5400', name: 'Utilities', t: 'E' },
      { code: '5500', name: 'Interest Expense', t: 'E' }
    ],
    entries: [],
    parties: [],
    docs: [],
    loans: [],
    audit: [],
    seq: {}
  };
  setDb(freshDb);
  return freshDb;
}

test('LEDGER-DERIV-01: Opening AR for a party matches in Parties, Overview, and party statement', () => {
  resetTestDb();

  const customer = {
    id: 'cust_acme',
    name: 'Acme Traders',
    type: 'customer',
    phone: '9876543210',
    gstin: '21ABCDE1234F1Z5',
    state: 'Odisha',
    terms: '30'
  };
  state.db.parties.push(customer);

  // Post opening entry with explicit party tagging on 1100 line
  post({
    date: '2026-04-01',
    src: 'open',
    narr: 'Opening Balance - Acme Traders',
    lines: [
      { a: '1100', d: 500000, c: 0, p: 'cust_acme' },
      { a: '3200', d: 0, c: 500000 }
    ]
  });

  // Create opening AR pseudo-document as done in postOpening
  state.db.docs.push({
    id: 'open_ar_cust_acme',
    type: 'sale',
    no: 'OPEN-AR-Acme Traders',
    sno: 'OPEN-AR-Acme Traders',
    date: '2026-04-01',
    party: 'cust_acme',
    total: 500000,
    paid: 0,
    opening: true,
    desc: 'Opening Balance Receivable'
  });

  // 1. Party balance helper derives strictly from ledger lines
  const bal = partyBalance('cust_acme', '1100');
  assert.equal(bal, 500000, 'partyBalance must derive 500000 paise from ledger lines');

  // 2. Parties page trade receivable metric reads the derived balance
  const partyAR = tradeR(customer);
  assert.equal(partyAR, 500000, 'Parties view tradeR must derive 500000 paise');

  // 3. Overview receivables reads ledger net directly
  const overviewAR = net('1100');
  assert.equal(overviewAR, 500000, 'Overview net(1100) must derive 500000 paise');

  // 4. Exact match across all views
  assert.equal(bal, partyAR);
  assert.equal(bal, overviewAR);
});

test('LEDGER-DERIV-02: Money Out EMI appears in loan statement and, when reversed, restores outstanding', () => {
  resetTestDb();

  // Seed bank funds
  post({
    date: '2026-04-01',
    src: 'open',
    narr: 'Opening Capital in Bank',
    lines: [
      { a: '1010', d: 15000000, c: 0 },
      { a: '3000', d: 0, c: 15000000 }
    ]
  });

  const lender = {
    id: 'party_sbi',
    name: 'State Bank of India',
    type: 'lender',
    roles: ['lender']
  };
  state.db.parties.push(lender);

  const loan = {
    id: 'loan_sbi_term',
    ref: 'LN-SBI-01',
    name: 'SBI Machinery Term Loan',
    party: 'party_sbi',
    partyName: 'State Bank of India',
    dir: 'taken',
    principal: 10000000, // 1,00,000 INR original principal
    date: '2026-04-01',
    rate: 10,
    repaid: 0 // Mutable counter that must NOT be trusted
  };
  state.db.loans.push(loan);

  // Initial outstanding derived from ledger/disbursement
  assert.equal(loanOutstanding(loan), 10000000, 'Initial loan outstanding must be 1,00,000 INR');

  // Record an EMI repayment: 20,000 INR Principal + 5,000 INR Interest
  const emiEntry = postLoanRepayment('loan_sbi_term', {
    date: '2026-04-15',
    pr: 2000000, // 20,000 INR
    int: 500000,  // 5,000 INR
    acct: '1010',
    ref: 'NEFT-EMI-001',
    method: 'Bank Transfer',
    notes: 'April EMI Installment'
  });

  assert.ok(emiEntry, 'EMI entry must be posted successfully');
  assert.equal(emiEntry.src, 'loan', 'EMI entry src must be "loan"');
  assert.equal(emiEntry.meta.loan, 'loan_sbi_term', 'meta.loan must link to loan id');
  assert.equal(emiEntry.meta.kind, 'rep', 'meta.kind must be "rep"');
  assert.equal(emiEntry.meta.pr, 2000000, 'meta.pr must record principal');
  assert.equal(emiEntry.meta.int, 500000, 'meta.int must record interest');

  // Verify loan outstanding decreased by principal repayment only
  assert.equal(loanOutstanding(loan), 8000000, 'Outstanding must decrease to 80,000 INR');

  // Verify entry is discovered in loan statement query (meta.loan === loan.id)
  const statementEntries = state.db.entries.filter(e => e.meta && e.meta.loan === loan.id && e.status !== 'reversed');
  assert.equal(statementEntries.length, 1, 'EMI entry must appear in loan statement');
  assert.equal(statementEntries[0].id, emiEntry.id);

  // Now REVERSE the EMI entry (e.g. bounce, error, or undo)
  reverse(emiEntry.id);

  // Verify reversing restores loan outstanding balance automatically
  assert.equal(loanOutstanding(loan), 10000000, 'Outstanding must be restored to 1,00,000 INR without mutating stored counter');

  // Verify reversed entry is excluded from statement active entries
  const activeStatement = state.db.entries.filter(e => e.meta && e.meta.loan === loan.id && e.status !== 'reversed' && e.src !== 'rev');
  assert.equal(activeStatement.length, 0, 'No active repayments remain on statement');
});

test('LEDGER-DERIV-03: Bill with supplier invoice no "12" never links to unrelated entry', () => {
  resetTestDb();

  const billDoc = {
    id: 'doc_bill_target',
    type: 'bill',
    no: 'BILL-0001',
    sno: 'BILL-0001',
    supInvNo: '12', // Supplier bill number is "12"
    party: 'sup_alpha',
    sup: 'Alpha Metals',
    total: 120000,
    paid: 0,
    pays: []
  };
  state.db.docs.push(billDoc);

  // An unrelated entry with "12" appearing in narrative or desc
  const unrelatedEntry = {
    id: 'je_unrelated_12',
    src: 'out',
    date: '2026-04-10',
    narr: 'Paid monthly electricity charges for Meter 12',
    ref: 'VOUCHER-12',
    meta: {
      docNo: 'REF-12',
      desc: 'Box of 12 LED bulbs'
    },
    lines: [
      { a: '5400', d: 12000, c: 0 },
      { a: '1000', d: 0, c: 12000 }
    ]
  };
  state.db.entries.push(unrelatedEntry);

  // findLinkedDoc must NOT fuzzy-match on "12" or substring in narr
  const linked = findLinkedDoc(unrelatedEntry);
  assert.equal(linked, null, 'Unrelated entry mentioning "12" must stay unlinked (return null)');

  // An entry explicitly linked by explicit docId
  const explicitlyLinkedEntry = {
    id: 'je_linked_bill',
    src: 'out',
    date: '2026-04-12',
    narr: 'Payment for Bill BILL-0001',
    meta: {
      docId: 'doc_bill_target',
      billId: 'doc_bill_target',
      docNo: 'BILL-0001'
    },
    lines: [
      { a: '2000', d: 50000, c: 0, p: 'sup_alpha' },
      { a: '1010', d: 0, c: 50000, p: 'sup_alpha' }
    ]
  };
  state.db.entries.push(explicitlyLinkedEntry);

  const matched = findLinkedDoc(explicitlyLinkedEntry);
  assert.ok(matched, 'Explicitly linked entry must resolve linked document');
  assert.equal(matched.id, 'doc_bill_target');
});

test('LEDGER-DERIV-04: Ledger-vs-party reconciliation row is zero after mixed sequence of invoice, partial receipt, advance, credit note, and reversal', () => {
  resetTestDb();

  // Initial bank capital
  post({
    date: '2026-04-01',
    src: 'open',
    narr: 'Initial Capital',
    lines: [
      { a: '1010', d: 10000000, c: 0 },
      { a: '3000', d: 0, c: 10000000 }
    ]
  });

  const cust1 = { id: 'cust_1', name: 'Metro Industries', type: 'customer', state: 'Odisha' };
  const cust2 = { id: 'cust_2', name: 'Zenith Retail', type: 'customer', state: 'Odisha' };
  const sup1 = { id: 'sup_1', name: 'Global Scrap Supply', type: 'supplier', state: 'Odisha' };
  state.db.parties.push(cust1, cust2, sup1);

  // Helper to compute subledger reconciliation differences
  function getReconciliationDiff() {
    const ledgerAR = net('1100');
    const partyAR = state.db.parties.reduce((sum, p) => sum + Math.max(0, partyBalance(p.id, '1100')), 0);
    const diffAR = Math.abs(ledgerAR - partyAR);

    const ledgerAP = Math.abs(net('2000'));
    const partyAP = state.db.parties.reduce((sum, p) => sum + Math.max(0, sgn(acc('2000'), partyBalance(p.id, '2000'))), 0);
    const diffAP = Math.abs(ledgerAP - partyAP);

    return { diffAR, diffAP, ledgerAR, partyAR, ledgerAP, partyAP };
  }

  // Initial check
  assert.equal(getReconciliationDiff().diffAR, 0, 'Initial AR diff must be 0');
  assert.equal(getReconciliationDiff().diffAP, 0, 'Initial AP diff must be 0');

  // 1. Post Sale Invoices
  post({
    date: '2026-04-02',
    src: 'sale',
    narr: 'Invoice INV-101 for Metro Industries',
    meta: { party: 'cust_1', docNo: 'INV-101' },
    lines: [
      { a: '1100', d: 250000, c: 0, p: 'cust_1' },
      { a: '4000', d: 0, c: 250000 }
    ]
  });

  post({
    date: '2026-04-03',
    src: 'sale',
    narr: 'Invoice INV-102 for Zenith Retail',
    meta: { party: 'cust_2', docNo: 'INV-102' },
    lines: [
      { a: '1100', d: 150000, c: 0, p: 'cust_2' },
      { a: '4000', d: 0, c: 150000 }
    ]
  });

  assert.equal(getReconciliationDiff().diffAR, 0, 'Diff must be 0 after posting invoices');

  // 2. Partial customer receipt
  post({
    date: '2026-04-05',
    src: 'in',
    narr: 'Partial receipt from Metro Industries',
    meta: { party: 'cust_1' },
    lines: [
      { a: '1010', d: 100000, c: 0, p: 'cust_1' },
      { a: '1100', d: 0, c: 100000, p: 'cust_1' }
    ]
  });
  assert.equal(getReconciliationDiff().diffAR, 0, 'Diff must be 0 after partial receipt');

  // 3. Customer unallocated advance (goes to 2300 Customer Advances)
  ensureAdvanceAccounts();
  post({
    date: '2026-04-06',
    src: 'in',
    narr: 'Customer Advance from Zenith Retail',
    meta: { party: 'cust_2' },
    lines: [
      { a: '1010', d: 50000, c: 0, p: 'cust_2' },
      { a: '2300', d: 0, c: 50000, p: 'cust_2' }
    ]
  });
  assert.equal(getReconciliationDiff().diffAR, 0, 'Diff must remain 0 after advance receipt');

  // 4. Credit Note (Return / Reduction in 1100)
  post({
    date: '2026-04-07',
    src: 'sale',
    narr: 'Credit Note CN-001 for Metro Industries',
    meta: { party: 'cust_1', kind: 'cn' },
    lines: [
      { a: '4000', d: 30000, c: 0 },
      { a: '1100', d: 0, c: 30000, p: 'cust_1' }
    ]
  });
  assert.equal(getReconciliationDiff().diffAR, 0, 'Diff must be 0 after credit note');

  // 5. Post temporary receipt and REVERSE it
  const tempReceipt = post({
    date: '2026-04-08',
    src: 'in',
    narr: 'Cheque receipt (later bounced)',
    meta: { party: 'cust_1' },
    lines: [
      { a: '1010', d: 40000, c: 0, p: 'cust_1' },
      { a: '1100', d: 0, c: 40000, p: 'cust_1' }
    ]
  });
  assert.equal(getReconciliationDiff().diffAR, 0, 'Diff must be 0 after temporary receipt');

  reverse(tempReceipt.id);
  assert.equal(getReconciliationDiff().diffAR, 0, 'Diff must be strictly 0 after reversal of receipt');

  // 6. Purchase Bill on AP (2000)
  post({
    date: '2026-04-09',
    src: 'bill',
    narr: 'Purchase Bill BILL-001 from Global Scrap',
    meta: { party: 'sup_1', docNo: 'BILL-001' },
    lines: [
      { a: '5000', d: 180000, c: 0 },
      { a: '2000', d: 0, c: 180000, p: 'sup_1' }
    ]
  });
  assert.equal(getReconciliationDiff().diffAP, 0, 'AP Diff must be 0 after posting bill');

  // 7. Partial supplier payment
  post({
    date: '2026-04-10',
    src: 'out',
    narr: 'Payment to Global Scrap',
    meta: { party: 'sup_1' },
    lines: [
      { a: '2000', d: 80000, c: 0, p: 'sup_1' },
      { a: '1010', d: 0, c: 80000, p: 'sup_1' }
    ]
  });
  assert.equal(getReconciliationDiff().diffAP, 0, 'AP Diff must be 0 after payment');

  // 8. Debit note on AP
  post({
    date: '2026-04-11',
    src: 'bill',
    narr: 'Debit Note DN-001 to Global Scrap',
    meta: { party: 'sup_1', kind: 'dn' },
    lines: [
      { a: '2000', d: 20000, c: 0, p: 'sup_1' },
      { a: '5000', d: 0, c: 20000 }
    ]
  });
  assert.equal(getReconciliationDiff().diffAP, 0, 'AP Diff must be 0 after debit note');

  // 9. Reversal of payment
  const tempPay = post({
    date: '2026-04-12',
    src: 'out',
    narr: 'Erroneous payment to Global Scrap',
    meta: { party: 'sup_1' },
    lines: [
      { a: '2000', d: 30000, c: 0, p: 'sup_1' },
      { a: '1010', d: 0, c: 30000, p: 'sup_1' }
    ]
  });
  reverse(tempPay.id);

  const finalRecon = getReconciliationDiff();
  assert.equal(finalRecon.diffAR, 0, `AR difference must be strictly 0; got ledgerAR=${finalRecon.ledgerAR}, partyAR=${finalRecon.partyAR}`);
  assert.equal(finalRecon.diffAP, 0, `AP difference must be strictly 0; got ledgerAP=${finalRecon.ledgerAP}, partyAP=${finalRecon.partyAP}`);
});
