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
  setDb, post, reverse, checkCashLiquidity, net, paid, out, migrateSchema,
  ensureAdvanceAccounts, getPartyAdvanceBalance, next, log, SYS
} = state;
const { getMonthlyCashFlow } = await import('../frontend/js/views/overview.js');
const { getInventoryStock, nextDnNo } = await import('../frontend/js/views/bills.js');
const { nextCnNo, nextInvNo } = await import('../frontend/js/views/sales.js');

function resetTestDb() {
  const freshDb = {
    schemaVer: 2,
    biz: { name: 'PD ENTERPRISES', state: 'Odisha', prefix: 'PD/2627/' },
    accounts: [
      { code: '1000', name: 'Cash in Hand', t: 'A', cash: true },
      { code: '1010', name: 'Bank Account', t: 'A', cash: true },
      { code: '1100', name: 'Accounts Receivable', t: 'A' },
      { code: '1450', name: 'Supplier Advances', t: 'A' },
      { code: '2000', name: 'Accounts Payable', t: 'L' },
      { code: '2100', name: 'Loan Payable', t: 'L' },
      { code: '2200', name: 'Output GST', t: 'L' },
      { code: '2300', name: 'Customer Advances', t: 'L' },
      { code: '3000', name: "Owner's Capital", t: 'Q' },
      { code: '4000', name: 'Sales Revenue', t: 'I' },
      { code: '5000', name: 'Purchases / COGS', t: 'X' },
      { code: '1300', name: 'Input GST', t: 'A' }
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

test('PAY-01: One payment path - receipts post src:in and payments post src:out with standard meta', () => {
  const db = resetTestDb();
  const party = { id: 'p_cust_1', name: 'Tata Steel Scrap', type: 'customer' };
  db.parties.push(party);

  // Capital introduced to fund bank account
  post({
    date: '2026-11-01',
    src: 'in',
    ref: 'CAP-01',
    desc: 'Capital intro',
    meta: { party: party.id, partyName: party.name, acct: '1010', method: 'Bank Transfer', docNo: 'CAP-01' },
    lines: [
      { a: '1010', d: 1000000, c: 0 },
      { a: '3000', d: 0, c: 1000000 }
    ]
  });

  // Sales invoice of 500000 paise (Rs 5,000)
  const invJe = post({
    date: '2026-11-02',
    src: 'sale',
    ref: 'INV-001',
    desc: 'Sale to Tata Steel',
    meta: { docNo: 'INV-001' },
    lines: [
      { a: '1100', d: 500000, c: 0, p: party.id },
      { a: '4000', d: 0, c: 500000, p: party.id }
    ]
  });
  const invDoc = {
    id: 'doc_inv_1',
    type: 'sale',
    no: 'INV-001',
    date: '2026-11-02',
    party: party.id,
    total: 500000,
    paid: 0,
    pays: [],
    je: invJe.id,
    cancelled: false
  };
  db.docs.push(invDoc);

  assert.equal(out(invDoc), 500000);

  // Receive payment of 300000 paise (Rs 3,000) through Bank
  const payJe = post({
    date: '2026-11-05',
    src: 'in',
    ref: 'RV-0001',
    desc: 'Receipt from Tata Steel Scrap for INV-001',
    meta: {
      party: party.id,
      partyName: party.name,
      acct: '1010',
      method: 'Bank Transfer',
      ref: 'INV-001',
      docNo: 'INV-001'
    },
    lines: [
      { a: '1010', d: 300000, c: 0, p: party.id },
      { a: '1100', d: 0, c: 300000, p: party.id }
    ]
  });

  invDoc.pays.push({
    je: payJe.id,
    amt: 300000,
    date: '2026-11-05',
    method: 'Bank Transfer',
    acct: '1010'
  });
  invDoc.paid = paid(invDoc);

  // Assertions
  assert.equal(payJe.src, 'in', 'Receipts must have src: in');
  assert.equal(payJe.meta.docNo, 'INV-001');
  assert.equal(payJe.meta.party, party.id);
  assert.equal(invDoc.paid, 300000, 'doc.paid must be updated to 300000 paise');
  assert.equal(out(invDoc), 200000, 'doc.out must be 200000 paise');

  // Overview monthly cash flow
  const cf = getMonthlyCashFlow('2026-11');
  assert.equal(cf.cin, 1300000, 'Total cash in must include capital + receipt');
});

test('PAY-02: Liquidity enforcement blocks cash payments out when balance is insufficient', () => {
  const db = resetTestDb();

  // Cash has only 100000 paise (Rs 1,000)
  post({
    date: '2026-11-01',
    src: 'open',
    ref: 'OB-01',
    desc: 'Opening cash',
    lines: [
      { a: '1000', d: 100000, c: 0 },
      { a: '3000', d: 0, c: 100000 }
    ]
  });

  assert.equal(net('1000'), 100000);

  // Attempting to pay out 250000 paise (Rs 2,500) via Cash must be blocked
  const res = checkCashLiquidity('1000', 250000);
  assert.equal(res.ok, false, 'checkCashLiquidity must return ok: false for insufficient funds');
  assert.match(res.error, /Insufficient cash in hand balance/);

  // Paying within 100000 paise succeeds
  const okRes = checkCashLiquidity('1000', 80000);
  assert.equal(okRes.ok, true);
});

test('PAY-03: Surplus party payment creates customer advance (2300) and allocates to next invoice', () => {
  const db = resetTestDb();
  ensureAdvanceAccounts();
  const party = { id: 'p_cust_2', name: 'Jindal Steel', type: 'customer' };
  db.parties.push(party);

  // Open invoice of 200000 paise (Rs 2,000)
  const inv1 = {
    id: 'doc_inv_j1',
    type: 'sale',
    no: 'INV-J1',
    date: '2026-11-01',
    party: party.id,
    total: 200000,
    paid: 0,
    pays: [],
    cancelled: false
  };
  db.docs.push(inv1);

  // Customer pays 350000 paise (Rs 3,500) via Bank: Rs 2,000 settles inv1, Rs 1,500 is advance
  const totalPaid = 350000;
  const settleAmt = Math.min(totalPaid, inv1.total); // 200000
  const surplusAmt = totalPaid - settleAmt; // 150000

  // Post payment entry
  const payJe = post({
    date: '2026-11-05',
    src: 'in',
    ref: 'RV-0002',
    desc: 'Receipt from Jindal Steel',
    meta: { party: party.id, partyName: party.name, acct: '1010', method: 'Bank Transfer' },
    lines: [
      { a: '1010', d: totalPaid, c: 0, p: party.id },
      { a: '1100', d: 0, c: settleAmt, p: party.id },
      { a: '2300', d: 0, c: surplusAmt, p: party.id }
    ]
  });

  inv1.pays.push({ je: payJe.id, amt: settleAmt, date: '2026-11-05', method: 'Bank Transfer', acct: '1010' });
  inv1.paid = paid(inv1);

  assert.equal(out(inv1), 0, 'First invoice must be fully settled');
  assert.equal(getPartyAdvanceBalance(party.id, true), 150000, 'Customer advance balance must be 150000 paise');

  // Next invoice of 400000 paise (Rs 4,000) is created
  const inv2 = {
    id: 'doc_inv_j2',
    type: 'sale',
    no: 'INV-J2',
    date: '2026-11-10',
    party: party.id,
    total: 400000,
    paid: 0,
    pays: [],
    cancelled: false
  };
  db.docs.push(inv2);

  // Allocate available advance to inv2
  const availAdv = getPartyAdvanceBalance(party.id, true);
  const allocAmt = Math.min(availAdv, inv2.total); // 150000

  const advJe = post({
    date: '2026-11-10',
    src: 'in',
    ref: next('RV'),
    desc: 'Advance allocation from Customer Advances',
    meta: { party: party.id, partyName: party.name, acct: '2300', method: 'Customer Advance', docNo: inv2.no },
    lines: [
      { a: '2300', d: allocAmt, c: 0, p: party.id },
      { a: '1100', d: 0, c: allocAmt, p: party.id }
    ]
  });

  inv2.pays.push({ je: advJe.id, amt: allocAmt, date: '2026-11-10', method: 'Customer Advance', acct: '2300' });
  inv2.paid = paid(inv2);

  assert.equal(inv2.paid, 150000, 'Invoice 2 must reflect advance applied');
  assert.equal(out(inv2), 250000, 'Remaining outstanding on Invoice 2 is 250000 paise');
  assert.equal(getPartyAdvanceBalance(party.id, true), 0, 'Customer advance balance must now be 0');
});

test('RET-01: Credit note reduces invoice outstanding and increases available inventory stock', () => {
  const db = resetTestDb();
  const supplier = { id: 'p_sup_1', name: 'Scrap Trader', type: 'supplier' };
  const customer = { id: 'p_cust_3', name: 'Foundry Works', type: 'customer' };
  db.parties.push(supplier, customer);

  // 1. Purchase 100 kg Copper Scrap @ Rs 400/kg = Rs 40,000 (4000000 paise)
  const bill = {
    id: 'doc_bill_c1',
    type: 'bill',
    no: 'BILL-0001',
    date: '2026-11-01',
    party: supplier.id,
    sup: supplier.name,
    mat: 'Copper Scrap',
    q: 100,
    u: 'kg',
    r: 400,
    total: 4000000,
    paid: 0,
    pays: [],
    cancelled: false
  };
  db.docs.push(bill);

  // 2. Sell 60 kg Copper Scrap @ Rs 500/kg = Rs 30,000 (3000000 paise)
  const inv = {
    id: 'doc_inv_c1',
    type: 'sale',
    no: 'INV-0010',
    date: '2026-11-03',
    party: customer.id,
    lines: [{ n: 'Copper Scrap', q: 60, u: 'kg', r: 500 }],
    total: 3000000,
    paid: 0,
    pays: [],
    cancelled: false
  };
  db.docs.push(inv);

  // Inventory stock before credit note: 100 kg purchased - 60 kg sold = 40 kg in stock
  let stock = getInventoryStock();
  let copper = stock.find(s => s.name.toLowerCase() === 'copper scrap');
  assert.equal(copper.currentStock, 40, 'Available stock should be 40 kg');

  // 3. Customer returns 15 kg (Rs 7,500 / 750000 paise) -> Issue Credit Note
  const cnNo = nextCnNo();
  assert.match(cnNo, /^CN-\d{4}$/, 'Credit note number must follow CN-xxxx');

  const cnJe = post({
    date: '2026-11-04',
    src: 'sale',
    ref: cnNo,
    desc: `Credit Note ${cnNo} for Inv ${inv.no}`,
    lines: [
      { a: '4000', d: 750000, c: 0, p: customer.id },
      { a: '1100', d: 0, c: 750000, p: customer.id }
    ]
  });

  const cnDoc = {
    id: 'doc_cn_1',
    type: 'credit_note',
    no: cnNo,
    origDocId: inv.id,
    origDocNo: inv.no,
    date: '2026-11-04',
    party: customer.id,
    total: 750000,
    lines: [{ n: 'Copper Scrap', q: 15, u: 'kg', r: 500 }],
    je: cnJe.id,
    cancelled: false
  };
  db.docs.push(cnDoc);

  inv.pays.push({
    je: cnJe.id,
    amt: 750000,
    date: '2026-11-04',
    method: 'Credit Note',
    acct: '4000',
    cnNo
  });
  inv.paid = paid(inv);

  // Assert outstanding balance reduced
  assert.equal(inv.paid, 750000);
  assert.equal(out(inv), 2250000, 'Outstanding must be reduced from 3000000 to 2250000');

  // Assert inventory stock: returned 15 kg goes back to stock! (100 - (60 - 15) = 55 kg)
  stock = getInventoryStock();
  copper = stock.find(s => s.name.toLowerCase() === 'copper scrap');
  assert.equal(copper.currentStock, 55, 'Returned stock must be back in available inventory: 55 kg');
});

test('RET-02: Debit note reduces bill outstanding and decreases available inventory stock', () => {
  const db = resetTestDb();
  const supplier = { id: 'p_sup_2', name: 'Alloy Traders', type: 'supplier' };
  db.parties.push(supplier);

  // Purchase 200 kg Aluminium Scrap @ Rs 150/kg = Rs 30,000 (3000000 paise)
  const bill = {
    id: 'doc_bill_a1',
    type: 'bill',
    no: 'BILL-0002',
    date: '2026-11-01',
    party: supplier.id,
    sup: supplier.name,
    mat: 'Aluminium Scrap',
    q: 200,
    u: 'kg',
    r: 150,
    total: 3000000,
    paid: 0,
    pays: [],
    cancelled: false
  };
  db.docs.push(bill);

  let stock = getInventoryStock();
  let alum = stock.find(s => s.name.toLowerCase() === 'aluminium scrap');
  assert.equal(alum.currentStock, 200);

  // Return 50 kg defective material to supplier (Rs 7,500 / 750000 paise) -> Issue Debit Note
  const dnNo = nextDnNo();
  assert.match(dnNo, /^DN-\d{4}$/, 'Debit note number must follow DN-xxxx');

  const dnJe = post({
    date: '2026-11-03',
    src: 'bill',
    ref: dnNo,
    desc: `Debit Note ${dnNo} for Bill ${bill.no}`,
    lines: [
      { a: '2000', d: 750000, c: 0, p: supplier.id },
      { a: '5000', d: 0, c: 750000, p: supplier.id }
    ]
  });

  const dnDoc = {
    id: 'doc_dn_1',
    type: 'debit_note',
    no: dnNo,
    origDocId: bill.id,
    origDocNo: bill.no,
    date: '2026-11-03',
    party: supplier.id,
    sup: supplier.name,
    mat: 'Aluminium Scrap',
    q: 50,
    u: 'kg',
    r: 150,
    total: 750000,
    je: dnJe.id,
    cancelled: false
  };
  db.docs.push(dnDoc);

  bill.pays.push({
    je: dnJe.id,
    amt: 750000,
    date: '2026-11-03',
    method: 'Debit Note',
    acct: '5000',
    dnNo
  });
  bill.paid = paid(bill);

  assert.equal(bill.paid, 750000);
  assert.equal(out(bill), 2250000, 'Bill outstanding must be reduced');

  // Inventory stock: 200 - 50 returned = 150 kg
  stock = getInventoryStock();
  alum = stock.find(s => s.name.toLowerCase() === 'aluminium scrap');
  assert.equal(alum.currentStock, 150, 'Available stock must be 150 kg after purchase return');
});

test('UNDO-01: Per-payment Undo Payment reverses journal entry, marks payment void, and restores balance', () => {
  const db = resetTestDb();
  const party = { id: 'p_cust_4', name: 'City Scrap Yard', type: 'customer' };
  db.parties.push(party);

  const invJe = post({
    date: '2026-11-01',
    src: 'sale',
    ref: 'INV-UNDO-1',
    desc: 'Sale to City Scrap Yard',
    meta: { docNo: 'INV-UNDO-1' },
    lines: [
      { a: '1100', d: 1000000, c: 0, p: party.id },
      { a: '4000', d: 0, c: 1000000, p: party.id }
    ]
  });

  const inv = {
    id: 'doc_inv_undo',
    type: 'sale',
    no: 'INV-UNDO-1',
    date: '2026-11-01',
    party: party.id,
    total: 1000000, // Rs 10,000
    paid: 0,
    pays: [],
    je: invJe.id,
    cancelled: false
  };
  db.docs.push(inv);

  // Payment 1: Rs 4,000 (400000 paise)
  const je1 = post({
    date: '2026-11-02',
    src: 'in',
    ref: 'RV-101',
    desc: 'Pay 1',
    meta: { docNo: inv.no, party: party.id, acct: '1010', method: 'Bank Transfer' },
    lines: [
      { a: '1010', d: 400000, c: 0, p: party.id },
      { a: '1100', d: 0, c: 400000, p: party.id }
    ]
  });
  inv.pays.push({ je: je1.id, amt: 400000, date: '2026-11-02', method: 'Bank Transfer', acct: '1010' });

  // Payment 2: Rs 3,000 (300000 paise)
  const je2 = post({
    date: '2026-11-03',
    src: 'in',
    ref: 'RV-102',
    desc: 'Pay 2',
    meta: { docNo: inv.no, party: party.id, acct: '1010', method: 'Bank Transfer' },
    lines: [
      { a: '1010', d: 300000, c: 0, p: party.id },
      { a: '1100', d: 0, c: 300000, p: party.id }
    ]
  });
  inv.pays.push({ je: je2.id, amt: 300000, date: '2026-11-03', method: 'Bank Transfer', acct: '1010' });

  inv.paid = paid(inv);
  assert.equal(inv.paid, 700000);
  assert.equal(out(inv), 300000);

  // Now Undo Payment 1 by reversing je1.id
  reverse(je1.id);

  // Payment 1 is voided, payment 2 remains active
  const p1 = inv.pays.find(p => p.je === je1.id);
  const p2 = inv.pays.find(p => p.je === je2.id);
  assert.equal(p1.void, 1, 'P1 must be marked void');
  assert.ok(!p2.void, 'P2 must remain active');

  // Recalculated paid and outstanding
  assert.equal(inv.paid, 300000, 'doc.paid must now only count active payment 2');
  assert.equal(out(inv), 700000, 'Outstanding must be restored to 700000 paise');

  // Double entry balance
  assert.equal(net('1100'), 700000, 'Accounts Receivable must equal 700000 paise');
});

test('MIG-01: Schema migration converts legacy src:pay entries to src:in / src:out', () => {
  const db = resetTestDb();

  const legacyReceipt = {
    id: 'e_leg_rec',
    src: 'pay',
    date: '2026-10-10',
    lines: [
      { a: '1000', d: 50000, c: 0 },
      { a: '1100', d: 0, c: 50000 }
    ]
  };
  const legacyPayment = {
    id: 'e_leg_pay',
    src: 'pay',
    date: '2026-10-11',
    lines: [
      { a: '2000', d: 80000, c: 0 },
      { a: '1010', d: 0, c: 80000 }
    ]
  };
  db.entries.push(legacyReceipt, legacyPayment);

  migrateSchema(db);

  assert.equal(legacyReceipt.src, 'in', 'Cash debit in legacy pay must become src: in');
  assert.equal(legacyPayment.src, 'out', 'Cash credit in legacy pay must become src: out');
  assert.ok(!db.entries.some(e => e.src === 'pay'), 'No src: pay entries should remain');
});

test('PARTIES-01: Lenders and loan liabilities match case-insensitively and reflect in Parties', async () => {
  const db = resetTestDb();
  const { renderParties } = await import('../frontend/js/views/parties.js');

  const lenderParty = { id: 'p_muna_99', name: 'Muna', type: 'lender' };
  db.parties.push(lenderParty);

  db.loans.push({
    id: 'ln_muna_004',
    ref: 'LN-0004',
    name: 'Unsecured Loan - Muna (2)',
    dir: 'taken',
    party: 'muna', // lowercase or party name
    partyName: 'Muna',
    principal: 5000000, // Rs 50,000
    repaid: 0
  });

  const html = renderParties();
  assert.ok(html.includes('You owe lenders (loans)'), 'Must include loan liability KPI card');
  assert.ok(html.includes('50,000.00'), 'Must show Rs 50,000.00 for loan liability');
  assert.ok(html.includes('Muna'), 'Must render party Muna');
});

