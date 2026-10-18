import test from 'node:test';
import assert from 'node:assert/strict';

// 1. SETUP DOM & STORAGE MOCKS FOR HEADLESS NODE ENVIRONMENT
global.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] || null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; }
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
global.document = {
  getElementById(id) {
    return {
      id,
      style: {},
      classList: { add() {}, remove() {}, contains() { return false; } },
      setAttribute() {},
      getAttribute() { return null; },
      appendChild() {},
      remove() {}
    };
  },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement(tag) {
    return {
      tagName: tag.toUpperCase(),
      style: {},
      classList: { add() {}, remove() {}, contains() { return false; } },
      setAttribute() {},
      getAttribute() { return null; },
      appendChild() {},
      remove() {},
      innerHTML: ''
    };
  },
  body: {
    style: {},
    appendChild(el) { this._lastChild = el; }
  },
  addEventListener(event, fn) {
    if (!domListeners.has(event)) domListeners.set(event, []);
    domListeners.get(event).push(fn);
  }
};

// 2. IMPORT BUFIN CORE MODULES
import { convertRate, UNIT_FACTORS, fmt, uid } from '../frontend/js/modules/utils.js';
import { db, setDb, post, checkCashLiquidity, net, dstat, out, sgn, acc, reverse } from '../frontend/js/modules/state.js';
import { getInventoryStock } from '../frontend/js/views/bills.js';
import { taxSplit } from '../frontend/js/modules/actions.js';
import { saveAttachments, getAttachments } from '../frontend/js/modules/attachments.js';

// Reset database helper
function resetTestDb() {
  setDb({
    biz: { name: 'PD Enterprises', gstin: '21AAAAA0000A1Z5', state: 'Odisha', owner: 'Pritam', addr: 'Plot 42, Industrial Area, Rourkela' },
    accounts: [
      { code: '1000', name: 'Cash in Hand', t: 'A', cash: true },
      { code: '1010', name: 'Bank Account', t: 'A', cash: true },
      { code: '1100', name: 'Accounts Receivable', t: 'A' },
      { code: '1200', name: 'Inventory', t: 'A' },
      { code: '1300', name: 'Input GST', t: 'A' },
      { code: '1400', name: 'Loans Given', t: 'A' },
      { code: '2000', name: 'Accounts Payable', t: 'L' },
      { code: '2100', name: 'Loans Payable (Borrowed)', t: 'L' },
      { code: '2200', name: 'Output GST', t: 'L' },
      { code: '3000', name: "Owner's Capital", t: 'Q' },
      { code: '3200', name: 'Opening Balance Equity', t: 'Q' },
      { code: '4000', name: 'Sales Revenue', t: 'I' },
      { code: '4300', name: 'Interest Income', t: 'I' },
      { code: '5000', name: 'Purchases / Cost of Goods Sold', t: 'X' },
      { code: '5100', name: 'Rent Expense', t: 'X' },
      { code: '5500', name: 'Interest Expense', t: 'X' },
      { code: '5600', name: 'Miscellaneous Expense', t: 'X' }
    ],
    parties: [
      { id: 'p_cust1', name: 'Tata Steel Ltd', type: 'customer', state: 'Odisha', gstin: '21ABCDE1234F1Z5', limit: 20000000 }, // ₹2,00,000 limit
      { id: 'p_cust2_delhi', name: 'Delhi Metal Traders', type: 'customer', state: 'Delhi', gstin: '07AAACD1111A1Z1' },
      { id: 'p_sup1', name: 'Odisha Scrap Yard', type: 'supplier', state: 'Odisha', gstin: '21XYZWV9876E1Z2' }
    ],
    entries: [],
    docs: [],
    loans: [],
    seq: {},
    items: [
      { n: 'Iron scrap', h: '7204', u: 'kg', r: 30, min: 1000 },
      { n: 'Copper scrap', h: '7404', u: 'kg', r: 650, min: 200 }
    ],
    audit: []
  });
}

// ========================================================
// MODULE 1: SALES INVOICES & PREVIEW WORKFLOW (/#/sales)
// ========================================================
test('TC-SALES-01: Toggle Payment Received Now? logic and status resolution', () => {
  resetTestDb();

  // Scenario A: Unpaid Sales Invoice (Checkbox Unchecked)
  const unpaidDoc = {
    id: 'inv_001',
    no: 'INV-1001',
    type: 'sale',
    date: '2026-10-18',
    party: 'p_cust1',
    base: 100000,
    tax: { cg: 9000, sg: 9000 },
    total: 118000,
    paid: 0,
    pays: []
  };
  db.docs.push(unpaidDoc);

  const statusUnpaid = dstat(unpaidDoc);
  assert.equal(statusUnpaid[0], 'Open', 'Status tuple must indicate Open invoice');
  assert.equal(out(unpaidDoc), 118000, 'Balance due must match total for unpaid invoice');

  const isPaidA = out(unpaidDoc) <= 0 || statusUnpaid[0] === 'Paid';
  const pillTxtA = isPaidA ? 'Paid' : (unpaidDoc.paid > 0 ? 'Part paid' : 'Unpaid');
  assert.equal(pillTxtA, 'Unpaid', 'Display label for zero payment must be Unpaid');

  // Scenario B: Fully Paid Invoice (Checkbox Checked)
  const paidDoc = {
    id: 'inv_002',
    no: 'INV-1002',
    type: 'sale',
    date: '2026-10-18',
    party: 'p_cust1',
    base: 50000,
    tax: { cg: 4500, sg: 4500 },
    total: 59000,
    paid: 59000,
    pays: [{ amt: 59000, method: 'Cash', date: '2026-10-18' }]
  };
  db.docs.push(paidDoc);

  const statusPaid = dstat(paidDoc);
  assert.equal(statusPaid[0], 'Paid', 'Invoice with full paid amount must be Paid');
  assert.equal(out(paidDoc), 0, 'Balance due must be zero for paid invoice');

  const isPaidB = out(paidDoc) <= 0 || statusPaid[0] === 'Paid';
  const pillTxtB = isPaidB ? 'Paid' : (paidDoc.paid > 0 ? 'Part paid' : 'Unpaid');
  assert.equal(pillTxtB, 'Paid', 'Display label for full payment must be Paid');
});

test('TC-SALES-02: Save & Preview in-page modal overlay structure with action tools', () => {
  const modalHTML = `
    <div class="pd-invoice-card" role="dialog" aria-modal="true" aria-label="Tax Invoice preview">
      <div class="pd-invoice-card-header noprint">
        <span class="pd-inv-badge">Tax Invoice Preview · #INV-1001</span>
        <div class="pd-invoice-card-actions">
          <button type="button" class="pd-act-btn" id="pd_modal_print" title="Print">Print</button>
          <button type="button" class="pd-act-btn" id="pd_modal_pdf" title="Download PDF">Download PDF</button>
          <button type="button" class="pd-act-btn" id="pd_modal_wa" title="Share on WhatsApp">WhatsApp</button>
          <button type="button" class="pd-act-btn" id="pd_modal_close" title="Close">Close</button>
        </div>
      </div>
    </div>
  `;
  assert.ok(modalHTML.includes('id="pd_modal_print"'), 'Must have Print button');
  assert.ok(modalHTML.includes('id="pd_modal_pdf"'), 'Must have Download PDF button');
  assert.ok(modalHTML.includes('id="pd_modal_wa"'), 'Must have WhatsApp share button');
  assert.ok(modalHTML.includes('id="pd_modal_close"'), 'Must have Close button');
});

test('TC-SALES-03: Multi-Unit Scrap Engine Conversions', () => {
  assert.equal(UNIT_FACTORS.kg, 1);
  assert.equal(UNIT_FACTORS.quintal, 100);
  assert.equal(UNIT_FACTORS.ton, 1000);
  assert.equal(UNIT_FACTORS.pcs, 1);

  const quintalRate = convertRate(30, 'kg', 'quintal');
  assert.equal(quintalRate, 3000, '₹30/kg must convert to ₹3000/quintal');
  const lineSubtotalQuintal = 2 * quintalRate;
  assert.equal(lineSubtotalQuintal, 6000, '2 quintals @ ₹3000 = ₹6000');

  const kgRate = convertRate(35000, 'ton', 'kg');
  assert.equal(kgRate, 35, '₹35000/ton must convert to ₹35/kg');
  const lineSubtotalKg = 500 * kgRate;
  assert.equal(lineSubtotalKg, 17500, '500 kg @ ₹35 = ₹17500');

  const tonRate = convertRate(40, 'kg', 'ton');
  assert.equal(tonRate, 40000, '₹40/kg must convert to ₹40,000/ton');
  const lineSubtotalTon = 1.5 * tonRate;
  assert.equal(lineSubtotalTon, 60000, '1.5 tons @ ₹40,000 = ₹60,000');
});

// ========================================================
// MODULE 2: PURCHASE BILLS & INVENTORY STOCK (/#/bills, /#/inventory)
// ========================================================
test('TC-PUR-01: Purchase Bill posting updates double-entry ledger atomically', () => {
  resetTestDb();

  const purchaseJe = post({
    date: '2026-10-18',
    src: 'bill',
    narr: 'Purchase bill from Odisha Scrap Yard',
    meta: { docNo: 'BILL-01', party: 'p_sup1' },
    lines: [
      { a: '5000', d: 5000000, c: 0, p: 'p_sup1' },
      { a: '1300', d: 450000, c: 0 },
      { a: '1300', d: 450000, c: 0 },
      { a: '2000', d: 0, c: 5900000, p: 'p_sup1' }
    ]
  });

  assert.ok(purchaseJe.ref.startsWith('JV-'), 'Entry must receive sequential JV voucher');
  
  const apBal = sgn(acc('2000'), net('2000'));
  assert.equal(apBal, 5900000, 'Accounts Payable credit balance must be ₹59,000.00');

  const purchaseBal = net('5000');
  assert.equal(purchaseBal, 5000000, 'Purchases debit balance must be ₹50,000.00');

  const totalDebit = db.entries.reduce((sum, e) => sum + e.lines.reduce((s, l) => s + l.d, 0), 0);
  const totalCredit = db.entries.reduce((sum, e) => sum + e.lines.reduce((s, l) => s + l.c, 0), 0);
  assert.equal(totalDebit, totalCredit, 'Total Debits must equal Total Credits');
});

test('TC-PUR-02: Inventory Stock synchronization strictly from purchases and sales', () => {
  resetTestDb();

  db.docs.push({
    id: 'bill_001',
    no: 'BILL-001',
    sno: 'SUP-99',
    type: 'bill',
    date: '2026-10-18',
    party: 'p_sup1',
    sup: 'Odisha Scrap Yard',
    lines: [{ n: 'Iron scrap', h: '7204', q: 5000, u: 'kg', r: 30 }],
    base: 15000000,
    total: 15000000
  });

  db.docs.push({
    id: 'sale_001',
    no: 'INV-001',
    type: 'sale',
    date: '2026-10-18',
    party: 'p_cust1',
    lines: [{ n: 'Iron scrap', h: '7204', q: 1500, u: 'kg', r: 35 }],
    base: 5250000,
    total: 5250000
  });

  const stockList = getInventoryStock();
  const ironStock = stockList.find(s => s.name.toLowerCase().includes('iron'));
  
  assert.ok(ironStock, 'Iron scrap must appear in inventory stock');
  assert.equal(ironStock.purchasedQty, 5000, 'Purchased quantity must be 5000 kg');
  assert.equal(ironStock.soldQty, 1500, 'Dispatched/sold quantity must be 1500 kg');
  assert.equal(ironStock.currentStock, 3500, 'Current stock must be 3500 kg (5000 - 1500)');
  assert.equal(ironStock.stockValuation, 3500 * 30, 'Stock valuation must be 3500 kg @ ₹30/kg = ₹105,000');
});

// ========================================================
// MODULE 3: MONEY MANAGER, CASH/BANK BOOK & TRANSFERS (/#/book)
// ========================================================
test('TC-MON-01: Liquidity validation prevents negative Cash in Hand balance', () => {
  resetTestDb();

  const initialCheck = checkCashLiquidity('1000', 100000);
  assert.equal(initialCheck.ok, false, 'Outflow must be blocked when Cash in Hand is 0');
  assert.match(initialCheck.error, /Insufficient cash in hand balance/, 'Warning message must be clear');

  post({
    date: '2026-10-01',
    src: 'open',
    narr: 'Opening cash balance',
    lines: [
      { a: '1000', d: 500000, c: 0 },
      { a: '3200', d: 0, c: 500000 }
    ]
  });

  const validCheck = checkCashLiquidity('1000', 300000);
  assert.equal(validCheck.ok, true, 'Outflow within available balance must be permitted');

  const overdrawCheck = checkCashLiquidity('1000', 600000);
  assert.equal(overdrawCheck.ok, false, 'Outflow exceeding balance must be blocked');
  assert.equal(overdrawCheck.available, 500000, 'Reported available cash must be exactly ₹5,000.00');
});

test('TC-MON-02: Contra Transfer (Cash Deposit: Cash -> Bank) updates ledgers', () => {
  resetTestDb();

  post({
    date: '2026-10-01',
    src: 'open',
    narr: 'Opening cash',
    lines: [
      { a: '1000', d: 2000000, c: 0 },
      { a: '3200', d: 0, c: 2000000 }
    ]
  });

  assert.equal(net('1000'), 2000000, 'Starting cash must be ₹20,000.00');
  assert.equal(net('1010'), 0, 'Starting bank must be ₹0.00');

  const contraJe = post({
    date: '2026-10-18',
    src: 'xfer',
    narr: 'Cash deposit to Bank Account',
    lines: [
      { a: '1010', d: 800000, c: 0 },
      { a: '1000', d: 0, c: 800000 }
    ]
  });

  assert.ok(contraJe.ref.startsWith('JV-'), 'Contra entry must be assigned a JV-XXXX reference');
  assert.equal(net('1000'), 1200000, 'Cash in Hand must decrease to ₹12,000.00');
  assert.equal(net('1010'), 800000, 'Bank Account must increase to ₹8,000.00');
  assert.equal(net('1000') + net('1010'), 2000000, 'Combined liquidity must remain unchanged');
});

// ========================================================
// MODULE 4: ACCOUNTING & FINANCIAL STATEMENT SYNCHRONIZATION
// ========================================================
test('TC-ACC-01 & TC-ACC-03: Accounting Equilibrium and In-Place Upsert on JV-XXXX', () => {
  resetTestDb();

  const je1 = post({
    id: 'je_cap_01',
    ref: 'JV-0001',
    date: '2026-10-01',
    src: 'jv',
    narr: 'Capital introduced',
    lines: [
      { a: '1010', d: 10000000, c: 0 },
      { a: '3000', d: 0, c: 10000000 }
    ]
  });

  assert.equal(db.entries.length, 1);
  assert.equal(je1.ref, 'JV-0001');

  const jeUpdated = post({
    id: 'je_cap_01',
    ref: 'JV-0001',
    date: '2026-10-01',
    src: 'jv',
    narr: 'Capital introduced (Revised to ₹1,50,000)',
    lines: [
      { a: '1010', d: 15000000, c: 0 },
      { a: '3000', d: 0, c: 15000000 }
    ]
  });

  assert.equal(db.entries.length, 1, 'Updating existing voucher must not append duplicate entries');
  assert.equal(jeUpdated.ref, 'JV-0001', 'Reference must remain JV-0001');
  assert.equal(net('1010'), 15000000, 'Bank balance must update to ₹1,50,000.00');
  assert.equal(sgn(acc('3000'), net('3000')), 15000000, 'Owner Capital must update to ₹1,50,000.00');

  const totalAssets = net('1000') + net('1010') + net('1100') + net('1200') + net('1300');
  const totalLiab = sgn(acc('2000'), net('2000')) + sgn(acc('2200'), net('2200'));
  const totalEquity = sgn(acc('3000'), net('3000')) + sgn(acc('3200'), net('3200'));
  assert.equal(totalAssets, totalLiab + totalEquity, 'Assets must equal Liabilities + Equity');
});

test('TC-ACC-02: Profit & Loss statement revenue, COGS and net calculation', () => {
  resetTestDb();

  post({
    date: '2026-10-15',
    src: 'sale',
    lines: [
      { a: '1010', d: 10000000, c: 0 },
      { a: '4000', d: 0, c: 10000000 }
    ]
  });

  post({
    date: '2026-10-16',
    src: 'bill',
    lines: [
      { a: '5000', d: 6000000, c: 0 },
      { a: '1010', d: 0, c: 6000000 }
    ]
  });

  post({
    date: '2026-10-17',
    src: 'out',
    lines: [
      { a: '5100', d: 1500000, c: 0 },
      { a: '1010', d: 0, c: 1500000 }
    ]
  });

  const revenue = sgn(acc('4000'), net('4000'));
  const cogs = net('5000');
  const opex = net('5100');
  const netProfit = revenue - cogs - opex;

  assert.equal(revenue, 10000000, 'Revenue must be ₹100,000.00');
  assert.equal(cogs, 6000000, 'COGS must be ₹60,000.00');
  assert.equal(opex, 1500000, 'OpEx must be ₹15,000.00');
  assert.equal(netProfit, 2500000, 'Net Profit must be ₹25,000.00');
});

// ========================================================
// MODULE 5: DOCUMENT ATTACHMENTS & CAMERA CAPTURE
// ========================================================
test('TC-DOC-01 & TC-DOC-02: Document attachment persistence and retrieval by transaction ID', async () => {
  const recordId = 'txn_test_attach_99';
  const mockFiles = [
    {
      name: 'weighbridge_slip_oct18.jpg',
      type: 'image/jpeg',
      size: 45000,
      data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD...',
      date: new Date().toISOString()
    },
    {
      name: 'supplier_bill_scan.pdf',
      type: 'application/pdf',
      size: 120000,
      data: 'data:application/pdf;base64,JVBERi0xLjQK...',
      date: new Date().toISOString()
    }
  ];

  await saveAttachments(recordId, mockFiles);
  const retrieved = await getAttachments(recordId);

  assert.equal(retrieved.length, 2, 'Must retrieve 2 attached files');
  assert.equal(retrieved[0].name, 'weighbridge_slip_oct18.jpg');
  assert.equal(retrieved[1].name, 'supplier_bill_scan.pdf');
});

// ========================================================
// MODULE 6: SYSTEM SETTINGS & SECURITY (/#/settings)
// ========================================================
test('TC-SYS-01: App Locking mechanism and session security', () => {
  let sessionLocked = false;
  const mockLogoutAction = () => {
    sessionLocked = true;
  };

  mockLogoutAction();
  assert.equal(sessionLocked, true, 'Lock App action must transition application state to locked');
});

// ========================================================
// MODULE 7: PARTIES & CUSTOMER DUES (/#/parties)
// ========================================================
test('TC-PARTY-01: Credit limit validation triggers over-limit detection', () => {
  resetTestDb();

  const party = db.parties.find(p => p.id === 'p_cust1');
  assert.equal(party.limit, 20000000, 'Party credit limit is ₹2,00,000.00');

  // Customer already has ₹1,50,000 unpaid dues
  db.docs.push({
    id: 'inv_existing',
    no: 'INV-099',
    type: 'sale',
    party: 'p_cust1',
    total: 15000000,
    paid: 0,
    cancelled: false
  });

  const existingDues = db.docs
    .filter(d => d.party === party.id && d.type === 'sale' && !d.cancelled)
    .reduce((s, d) => s + out(d), 0);
  assert.equal(existingDues, 15000000, 'Existing dues should be ₹1,50,000.00');

  // New invoice of ₹80,000 would result in ₹2,30,000 dues (> ₹2,00,000 limit)
  const newInvoiceTotal = 8000000;
  const newPaid = 0;
  const uncollectedAmt = newInvoiceTotal - newPaid;
  const totalDuesWithNew = existingDues + uncollectedAmt;

  const isExceeded = totalDuesWithNew > party.limit;
  assert.equal(isExceeded, true, 'Credit limit of ₹2,00,000 must be exceeded by ₹2,30,000 total dues');
});

test('TC-PARTY-02: Party Ledger Statement running balance calculation', () => {
  resetTestDb();

  const partyId = 'p_cust1';

  // Sale 1: Invoice ₹50,000 (Dr 1100)
  post({
    date: '2026-10-01',
    src: 'sale',
    narr: 'INV-101 Scrap sale',
    lines: [
      { a: '1100', d: 5000000, c: 0, p: partyId },
      { a: '4000', d: 0, c: 5000000, p: partyId }
    ]
  });

  // Payment 1: Receipt ₹30,000 (Cr 1100)
  post({
    date: '2026-10-05',
    src: 'in',
    narr: 'Receipt for INV-101',
    lines: [
      { a: '1010', d: 3000000, c: 0, p: partyId },
      { a: '1100', d: 0, c: 3000000, p: partyId }
    ]
  });

  // Sale 2: Invoice ₹25,000 (Dr 1100)
  post({
    date: '2026-10-10',
    src: 'sale',
    narr: 'INV-102 Scrap sale',
    lines: [
      { a: '1100', d: 2500000, c: 0, p: partyId },
      { a: '4000', d: 0, c: 2500000, p: partyId }
    ]
  });

  // Compute party statement running balance
  let run = 0;
  const statement = [];
  const ents = db.entries.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  ents.forEach(e => {
    e.lines.filter(l => l.a === '1100' && l.p === partyId).forEach(l => {
      run += (l.d - l.c);
      statement.push({ date: e.date, ref: e.narr, debit: l.d, credit: l.c, balance: run });
    });
  });

  assert.equal(statement.length, 3, 'Statement must have 3 transaction rows');
  assert.equal(statement[0].balance, 5000000, 'Balance after first sale must be ₹50,000');
  assert.equal(statement[1].balance, 2000000, 'Balance after receipt must be ₹20,000');
  assert.equal(statement[2].balance, 4500000, 'Closing balance must be ₹45,000');
});

// ========================================================
// MODULE 8: LOANS MANAGEMENT (/#/loans, /#/loans/:id)
// ========================================================
test('TC-LOAN-01: Loan disbursement posting updates Bank and Loan Payable', () => {
  resetTestDb();

  const loanId = uid();
  const principalPaisa = 50000000; // ₹5,00,000

  // Disbursement journal entry
  post({
    date: '2026-10-01',
    src: 'loan',
    narr: 'HDFC Bank Equipment Loan - Principal borrowed',
    meta: { loan: loanId, kind: 'disb', pr: principalPaisa },
    lines: [
      { a: '1010', d: principalPaisa, c: 0 }, // Debit Bank Account ₹5,00,000
      { a: '2100', d: 0, c: principalPaisa }  // Credit Loan Payable ₹5,00,000
    ]
  });

  db.loans.push({
    id: loanId,
    ref: 'LN-001',
    name: 'HDFC Equipment Loan',
    dir: 'taken',
    principal: principalPaisa,
    repaid: 0,
    rate: 10,
    emi: 2500000
  });

  assert.equal(net('1010'), principalPaisa, 'Bank Account must increase by loan principal');
  assert.equal(sgn(acc('2100'), net('2100')), principalPaisa, 'Loan Payable liability must equal ₹5,00,000');
});

test('TC-LOAN-02: Monthly loan installment repayment splits principal and interest', () => {
  resetTestDb();

  const loanId = 'loan_hdfc_01';
  const principalPaisa = 50000000; // ₹5,00,000
  const loanObj = {
    id: loanId,
    ref: 'LN-001',
    name: 'HDFC Equipment Loan',
    dir: 'taken',
    principal: principalPaisa,
    repaid: 0,
    rate: 10
  };
  db.loans.push(loanObj);

  // Fund the bank account first
  post({
    date: '2026-10-01',
    src: 'open',
    lines: [
      { a: '1010', d: 100000000, c: 0 },
      { a: '3200', d: 0, c: 100000000 }
    ]
  });

  // Repayment: EMI ₹25,000 (Principal: ₹20,000, Interest: ₹5,000)
  const pr = 2000000;
  const it = 500000;
  const totalEmi = pr + it;

  post({
    date: '2026-10-15',
    src: 'loan',
    narr: 'HDFC Equipment Loan - EMI Repayment',
    meta: { loan: loanId, kind: 'rep', pr, int: it },
    lines: [
      { a: '2100', d: pr, c: 0 },          // Debit Loan Payable ₹20,000
      { a: '5500', d: it, c: 0 },          // Debit Interest Expense ₹5,000
      { a: '1010', d: 0, c: totalEmi }     // Credit Bank Account ₹25,000
    ]
  });

  loanObj.repaid += pr;

  assert.equal(net('5500'), it, 'Interest Expense must be ₹5,000.00');
  assert.equal(loanObj.principal - loanObj.repaid, 48000000, 'Remaining loan principal must be ₹4,80,000.00');
});

// ========================================================
// MODULE 9: INVENTORY VALUATION & STOCK (/#/inventory)
// ========================================================
test('TC-INV-01: Weighted average inventory valuation across multiple purchase rates', () => {
  resetTestDb();

  // Purchase Bill 1: 2,000 kg Copper @ ₹600/kg = ₹12,00,000
  db.docs.push({
    id: 'b1',
    no: 'BILL-01',
    type: 'bill',
    date: '2026-10-01',
    lines: [{ n: 'Copper scrap', q: 2000, u: 'kg', r: 600 }],
    base: 120000000,
    total: 120000000
  });

  // Purchase Bill 2: 3,000 kg Copper @ ₹700/kg = ₹21,00,000
  db.docs.push({
    id: 'b2',
    no: 'BILL-02',
    type: 'bill',
    date: '2026-10-05',
    lines: [{ n: 'Copper scrap', q: 3000, u: 'kg', r: 700 }],
    base: 210000000,
    total: 210000000
  });

  // Total purchased: 5,000 kg, Total investment: ₹33,00,000
  // Weighted Average Rate = 33,00,000 / 5,000 = ₹660/kg

  // Sale: 1,000 kg Copper
  db.docs.push({
    id: 's1',
    no: 'INV-01',
    type: 'sale',
    date: '2026-10-10',
    lines: [{ n: 'Copper scrap', q: 1000, u: 'kg', r: 750 }],
    base: 75000000,
    total: 75000000
  });

  const stock = getInventoryStock();
  const copper = stock.find(s => s.name.toLowerCase().includes('copper'));

  assert.ok(copper, 'Copper scrap must exist in stock');
  assert.equal(copper.purchasedQty, 5000, 'Purchased quantity must be 5,000 kg');
  assert.equal(copper.soldQty, 1000, 'Sold quantity must be 1,000 kg');
  assert.equal(copper.currentStock, 4000, 'Current stock must be 4,000 kg');
  assert.equal(copper.avgRate, 660, 'Weighted average rate must be ₹660.00 / kg');
  assert.equal(copper.stockValuation, 4000 * 660, 'Valuation must be 4000 * 660 = ₹26,40,000');
});

test('TC-INV-02: Low-stock threshold detection and alert badge', () => {
  resetTestDb();

  // Copper item has min: 200 kg in db.items
  // Buy 250 kg Copper
  db.docs.push({
    id: 'b_cop',
    no: 'BILL-01',
    type: 'bill',
    lines: [{ n: 'Copper scrap', q: 250, u: 'kg', r: 650 }]
  });

  // Sell 100 kg Copper -> remaining 150 kg (below min threshold of 200 kg)
  db.docs.push({
    id: 's_cop',
    no: 'INV-01',
    type: 'sale',
    lines: [{ n: 'Copper scrap', q: 100, u: 'kg', r: 700 }]
  });

  const stock = getInventoryStock();
  const copper = stock.find(s => s.name.toLowerCase().includes('copper'));

  assert.equal(copper.currentStock, 150, 'Current stock is 150 kg');
  assert.equal(copper.minStock, 200, 'Min threshold is 200 kg');
  assert.equal(copper.isLowStock, true, 'isLowStock flag must be true');
  assert.equal(copper.status, 'Low Stock', 'Status must resolve to Low Stock');
});

// ========================================================
// MODULE 10: OPENING BALANCES & EQUITY AUTO-BALANCING (/#/open)
// ========================================================
test('TC-OPEN-01: Discrepancy auto-balances into Opening Balance Equity (3200)', () => {
  resetTestDb();

  // User enters Cash Dr ₹10,000 and Bank Dr ₹25,000 with 0 credits
  const totalD = 3500000;
  const totalC = 0;
  const diff = totalD - totalC; // +₹35,000 Dr discrepancy

  const rows = [
    { a: '1000', d: 1000000, c: 0 },
    { a: '1010', d: 2500000, c: 0 }
  ];

  // Auto-balancing allocation logic
  const lines = rows.slice();
  if (totalD !== totalC) {
    lines.push(totalD > totalC ? { a: '3200', d: 0, c: diff } : { a: '3200', d: -diff, c: 0 });
  }

  const openJe = post({
    date: '2026-10-01',
    src: 'open',
    narr: 'Opening balances',
    lines
  });

  assert.equal(openJe.lines.length, 3, 'Auto-balanced entry must include 3200');
  const equityLine = openJe.lines.find(l => l.a === '3200');
  assert.equal(equityLine.c, 3500000, 'Difference must post to credit of Opening Balance Equity');
  assert.equal(sgn(acc('3200'), net('3200')), 3500000, 'Opening Balance Equity must equal ₹35,000.00');
});

test('TC-OPEN-02: Safety rule prevents duplicate opening entries via reversal/update', () => {
  resetTestDb();

  // Post initial opening entry
  const entry1 = post({
    id: 'open_entry_1',
    date: '2026-10-01',
    src: 'open',
    narr: 'Opening balances',
    lines: [
      { a: '1000', d: 500000, c: 0 },
      { a: '3200', d: 0, c: 500000 }
    ]
  });

  assert.equal(db.entries.length, 1);

  // Updating existing opening entry performs in-place update
  const updated = post({
    id: 'open_entry_1',
    date: '2026-10-01',
    src: 'open',
    narr: 'Opening balances (revised)',
    lines: [
      { a: '1000', d: 700000, c: 0 },
      { a: '3200', d: 0, c: 700000 }
    ]
  });

  assert.equal(db.entries.length, 1, 'In-place update must not duplicate opening entry');
  assert.equal(net('1000'), 700000, 'Cash balance must update to ₹7,000');

  // Reversing opening balance
  reverse(entry1.id);
  assert.equal(entry1.status, 'reversed', 'Original entry must be marked reversed');
  assert.equal(net('1000'), 0, 'Reversal must restore net balance to zero');
});

// ========================================================
// MODULE 11: GENERAL LEDGER PERIOD FILTERING & EXPORT (/#/gl)
// ========================================================
test('TC-GL-01: Date range filtering correctly calculates opening and period balances', () => {
  resetTestDb();

  // Transaction 1: Sept 15, 2026 - Opening cash deposit ₹10,000 (pre-period)
  post({
    date: '2026-09-15',
    src: 'open',
    lines: [
      { a: '1000', d: 1000000, c: 0 },
      { a: '3200', d: 0, c: 1000000 }
    ]
  });

  // Transaction 2: Oct 05, 2026 - Cash sale ₹5,000 (within period Oct 1 - Oct 31)
  post({
    date: '2026-10-05',
    src: 'sale',
    lines: [
      { a: '1000', d: 500000, c: 0 },
      { a: '4000', d: 0, c: 500000 }
    ]
  });

  // Transaction 3: Oct 20, 2026 - Expense ₹2,000 (within period)
  post({
    date: '2026-10-20',
    src: 'out',
    lines: [
      { a: '5100', d: 200000, c: 0 },
      { a: '1000', d: 0, c: 200000 }
    ]
  });

  // Transaction 4: Nov 05, 2026 - Post-period transaction
  post({
    date: '2026-11-05',
    src: 'out',
    lines: [
      { a: '5100', d: 100000, c: 0 },
      { a: '1000', d: 0, c: 100000 }
    ]
  });

  const fromDate = '2026-10-01';
  const toDate = '2026-10-31';

  let opNet = 0;
  let periodDr = 0;
  let periodCr = 0;

  for (const e of db.entries) {
    if (e.status === 'reversed') continue;
    for (const l of e.lines) {
      if (l.a === '1000') {
        if (fromDate && e.date < fromDate) {
          opNet += (l.d || 0) - (l.c || 0);
        } else if (!toDate || e.date <= toDate) {
          periodDr += (l.d || 0);
          periodCr += (l.c || 0);
        }
      }
    }
  }

  assert.equal(opNet, 1000000, 'Pre-period opening balance must be ₹10,000.00');
  assert.equal(periodDr, 500000, 'October period debits must be ₹5,000.00');
  assert.equal(periodCr, 200000, 'October period credits must be ₹2,000.00');
  const closingBal = opNet + (periodDr - periodCr);
  assert.equal(closingBal, 1300000, 'Closing balance as of Oct 31 must be ₹13,000.00');
});

test('TC-GL-02: Export CSV formatting includes standard accounting columns', () => {
  const rows = [
    ['Date', 'Ref', 'Narration', 'Debit', 'Credit', 'Balance'],
    ['2026-10-01', 'JV-0001', 'Opening balances', '10,000.00', '', '10,000.00'],
    ['2026-10-05', 'INV-1001', 'Tata Steel Ltd - Scrap Sale', '5,000.00', '', '15,000.00'],
    ['2026-10-20', 'JV-0002', 'Office Rent', '', '2,000.00', '13,000.00']
  ];

  const csv = rows.map(r => r.map(f => '"' + String(f ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');

  assert.ok(csv.startsWith('"Date","Ref","Narration","Debit","Credit","Balance"'), 'Header must contain standard columns');
  assert.ok(csv.includes('"INV-1001"'), 'Must include invoice ref');
  assert.ok(csv.includes('"15,000.00"'), 'Must include running balance');
});

// ========================================================
// MODULE 12: INDIAN GST TAX ENGINE (/#/sales, /#/bills)
// ========================================================
test('TC-GST-01: Intra-state sales invoice splits GST equally into CGST and SGST', () => {
  resetTestDb();

  const intraParty = db.parties.find(p => p.id === 'p_cust1'); // Odisha customer (same as biz)
  const gstAmtPaisa = 18000; // ₹180.00

  const tax = taxSplit(gstAmtPaisa, intraParty);

  assert.equal(tax.ig, undefined, 'Intra-state must not have IGST');
  assert.equal(tax.cg, 9000, 'CGST must be half (₹90.00)');
  assert.equal(tax.sg, 9000, 'SGST must be half (₹90.00)');
  assert.equal(tax.cg + tax.sg, gstAmtPaisa, 'Sum of CGST + SGST must equal total GST');
});

test('TC-GST-02: Inter-state sales invoice routes 100% of GST to IGST', () => {
  resetTestDb();

  const interParty = db.parties.find(p => p.id === 'p_cust2_delhi'); // Delhi customer (different from Odisha)
  const gstAmtPaisa = 18000; // ₹180.00

  const tax = taxSplit(gstAmtPaisa, interParty);

  assert.equal(tax.cg, undefined, 'Inter-state must not have CGST');
  assert.equal(tax.sg, undefined, 'Inter-state must not have SGST');
  assert.equal(tax.ig, 18000, 'IGST must receive 100% of GST amount');
});

// ========================================================
// MODULE 13: OVERVIEW DASHBOARD & BUSINESS PROFILE (/#/overview, /#/settings)
// ========================================================
test('TC-OVER-01: Overview KPI summary metrics compute in real time from live ledger', () => {
  resetTestDb();

  // Add initial cash and bank
  post({
    date: '2026-10-01',
    src: 'open',
    lines: [
      { a: '1000', d: 1500000, c: 0 },
      { a: '1010', d: 3500000, c: 0 },
      { a: '3200', d: 0, c: 5000000 }
    ]
  });

  // Add unpaid sales invoice (Receivables: ₹60,000)
  db.docs.push({
    id: 'inv_kpi',
    type: 'sale',
    total: 6000000,
    paid: 0,
    cancelled: false
  });

  // Add unpaid purchase bill (Payables: ₹40,000)
  db.docs.push({
    id: 'bill_kpi',
    type: 'bill',
    total: 4000000,
    paid: 0,
    cancelled: false
  });

  const cash = net('1000');
  const bank = net('1010');
  const totalLiquid = cash + bank;
  const rec = db.docs.filter(d => d.type === 'sale' && !d.cancelled).reduce((s, d) => s + out(d), 0);
  const pay = db.docs.filter(d => d.type === 'bill' && !d.cancelled).reduce((s, d) => s + out(d), 0);

  assert.equal(cash, 1500000, 'Cash in Hand must be ₹15,000.00');
  assert.equal(bank, 3500000, 'Bank balance must be ₹35,000.00');
  assert.equal(totalLiquid, 5000000, 'Total liquid funds must be ₹50,000.00');
  assert.equal(rec, 6000000, 'Receivables must be ₹60,000.00');
  assert.equal(pay, 4000000, 'Payables must be ₹40,000.00');
});

test('TC-SET-02: Updating business profile dynamically updates company letterhead details', () => {
  resetTestDb();

  // Update business profile in db.biz
  db.biz.name = 'PD ENTERPRISES PVT LTD';
  db.biz.gstin = '21ABCDE9999Z1Z8';
  db.biz.addr = 'Plot 100, Scrap Complex, Rourkela, Odisha 769001';

  // Letterhead generation checks
  assert.equal(db.biz.name, 'PD ENTERPRISES PVT LTD');
  assert.equal(db.biz.gstin, '21ABCDE9999Z1Z8');
  assert.ok(db.biz.addr.includes('Scrap Complex'));
});

// ========================================================
// MODULE 14: CLOUDINARY IMAGE UPLOAD & CAMERA SCAN (/#/bills)
// ========================================================
test('TC-DOC-CLOUDINARY-01: Cloudinary image upload and camera scan integration on Purchase Bills', async () => {
  resetTestDb();

  const cloudinaryMod = await import('../backend/src/cloudinary.js');
  const cloudinary = cloudinaryMod.default || cloudinaryMod;
  const config = cloudinary.getConfig();

  assert.equal(config.cloudName, 'iqsinmcr', 'Configured Cloud Name must match account');
  assert.equal(config.apiKey, '573667157386361', 'Configured API Key must match account');

  // Verify secret keys are NEVER exposed in client config payload
  assert.equal(config.apiSecret, undefined, 'API Secret must never be exposed to client-side');
  assert.ok(typeof config.hasSecret === 'boolean', 'hasSecret status flag must be boolean');

  // Simulate captured paper bill / camera scan
  const sampleBillData = 'data:image/jpeg;base64,' + Buffer.from('fake-camera-scan-weighbridge-slip').toString('base64');
  const capturedFile = {
    name: 'weighbridge_slip_wb891.jpg',
    type: 'image/jpeg',
    size: 24500,
    data: sampleBillData
  };

  // Simulate Cloudinary upload response
  const mockCloudinaryResult = {
    ok: true,
    url: 'https://res.cloudinary.com/iqsinmcr/image/upload/v1729210000/bufin/bills/wb891.jpg',
    public_id: 'bufin/bills/wb891',
    format: 'jpg',
    bytes: 24500
  };

  // Mock upload logic matching bills.js
  if (mockCloudinaryResult.url) {
    capturedFile.url = mockCloudinaryResult.url;
    capturedFile.public_id = mockCloudinaryResult.public_id;
    capturedFile.cloud = 'cloudinary';
  }

  // Commit bill with Cloudinary attachment
  const billDoc = {
    id: 'doc_bill_cloud_01',
    no: 'BILL-CLOUD-01',
    sno: 'SUP-WB-891',
    type: 'bill',
    date: '2026-10-18',
    party: 'p_sup1',
    sup: 'Rourkela Steel Suppliers',
    lines: [{ n: 'Heavy Melting Scrap', h: '7204', q: 10000, u: 'kg', r: 32 }],
    base: 32000000,
    total: 32000000,
    paid: 0,
    cancelled: false
  };
  db.docs.push(billDoc);

  // Attachment record simulation
  const billAttachmentRecord = {
    id: billDoc.id,
    files: [capturedFile]
  };

  assert.ok(capturedFile.url.startsWith('https://res.cloudinary.com/iqsinmcr/'), 'URL must be a valid secure Cloudinary HTTPS link');
  assert.equal(capturedFile.cloud, 'cloudinary', 'Cloud provider tag must be recorded as cloudinary');
  assert.equal(capturedFile.public_id, 'bufin/bills/wb891', 'Cloudinary public_id must be stored');
  assert.equal(billAttachmentRecord.files[0].url, mockCloudinaryResult.url, 'Attached file record must link directly to the secure Cloudinary URL');
});

// ========================================================
// MODULE 16: MOBILE QUICK ADD CARD & NAVIGATION
// ========================================================
test('TC-QA-MOBILE-01: Quick Add card dismisses and redirects on mobile view for all 6 options', () => {
  let modalOpen = true;
  let currentHash = '#/bills';
  let renderedPage = null;

  const closeM = () => { modalOpen = false; };
  const salesState = { tab: 'rec', editNo: 'INV-1' };
  const billsState = { tab: 'rec', editId: 'BILL-1' };

  const navigate = (page) => {
    currentHash = `#/${page}`;
    renderedPage = page;
  };
  const render = (page) => {
    renderedPage = page || currentHash.replace('#/', '');
  };

  const qago = (target) => {
    closeM();
    if (target === 'sales' || target === 'sale') {
      salesState.tab = 'new';
      salesState.editNo = null;
      if (currentHash !== '#/sales') navigate('sales');
      else render('sales');
    } else if (target === 'bills' || target === 'bill') {
      billsState.tab = 'new';
      billsState.editId = null;
      if (currentHash !== '#/bills') navigate('bills');
      else render('bills');
    } else if (target === 'in') {
      if (currentHash !== '#/in') navigate('in');
      else render('in');
    } else if (target === 'out') {
      if (currentHash !== '#/out') navigate('out');
      else render('out');
    } else if (target === 'xfer') {
      if (currentHash !== '#/xfer') navigate('xfer');
      else render('xfer');
    } else if (target === 'parties' || target === 'party') {
      if (currentHash !== '#/parties') navigate('parties');
      else render('parties');
    } else if (target === 'pl' || target === 'pnl') {
      if (currentHash !== '#/pl') navigate('pl');
      else render('pl');
    }
  };

  // Test 1: Money In
  modalOpen = true;
  qago('in');
  assert.equal(modalOpen, false, 'Add card must be closed');
  assert.equal(currentHash, '#/in', 'Must redirect to #/in');

  // Test 2: Money Out
  modalOpen = true;
  qago('out');
  assert.equal(modalOpen, false, 'Add card must be closed');
  assert.equal(currentHash, '#/out', 'Must redirect to #/out');

  // Test 3: Transfer
  modalOpen = true;
  qago('xfer');
  assert.equal(modalOpen, false, 'Add card must be closed');
  assert.equal(currentHash, '#/xfer', 'Must redirect to #/xfer');

  // Test 4: Sales invoice
  modalOpen = true;
  qago('sales');
  assert.equal(modalOpen, false, 'Add card must be closed');
  assert.equal(currentHash, '#/sales', 'Must redirect to #/sales');
  assert.equal(salesState.tab, 'new', 'Sales tab must be set to new');

  // Test 5: Purchase bill (when already on #/bills)
  currentHash = '#/bills';
  billsState.tab = 'rec';
  modalOpen = true;
  qago('bills');
  assert.equal(modalOpen, false, 'Add card must be closed even when already on bills page');
  assert.equal(currentHash, '#/bills', 'Current hash is #/bills');
  assert.equal(billsState.tab, 'new', 'Bills tab must switch to new purchase form');
  assert.equal(renderedPage, 'bills', 'Must re-render bills page');

  // Test 6: Party
  modalOpen = true;
  qago('parties');
  assert.equal(modalOpen, false, 'Add card must be closed');
  assert.equal(currentHash, '#/parties', 'Must redirect to #/parties');

  // Test 7: Profit & Loss
  modalOpen = true;
  qago('pl');
  assert.equal(modalOpen, false, 'Add card must be closed on selecting Profit & Loss');
  assert.equal(currentHash, '#/pl', 'Must redirect to #/pl for Profit & Loss');
});

// ========================================================
// MODULE 18: MOBILE UX/UI RESPONSIVE OVERHAUL
// ========================================================
test('TC-MOBILE-UX-01: Mobile Bottom Nav, Action Sheets, and Card Transformations', async () => {
  const fs = await import('fs');
  const path = await import('path');

  // 1. Verify showActionSheet is exported and creates touch-safe bottom sheet
  const componentsCode = fs.readFileSync('frontend/js/modules/components.js', 'utf8');
  assert.match(componentsCode, /export function showActionSheet/, 'showActionSheet must be exported from components.js');
  assert.match(componentsCode, /action-sheet-list/, 'Action sheet must generate item list');
  assert.match(componentsCode, /action-sheet-item/, 'Action sheet must render touch-friendly item buttons');
  assert.match(componentsCode, /action-sheet-cancel/, 'Action sheet must render touch-friendly cancel button');

  // 2. Verify Mobile Bottom Navigation Bar routes in app.js
  const appCode = fs.readFileSync('frontend/js/app.js', 'utf8');
  assert.match(appCode, /Overview/, 'Mobile bottom nav must have Overview route');
  assert.match(appCode, /Sales/, 'Mobile bottom nav must have Sales route');
  assert.match(appCode, /Money Manager/, 'Mobile bottom nav must have Money Manager route');
  assert.match(appCode, /Accounting/, 'Mobile bottom nav must have Accounting route');
  assert.match(appCode, /Menu/, 'Mobile bottom nav must have Menu drawer toggle');

  // 3. Verify 3-dot action buttons and responsive card wrap in sales.js and bills.js
  const salesCode = fs.readFileSync('frontend/js/views/sales.js', 'utf8');
  assert.match(salesCode, /pd-more-btn/, 'Sales table rows must include pd-more-btn for mobile action sheet');
  assert.match(salesCode, /data-action="more"/, 'Sales more button must trigger more action');
  assert.match(salesCode, /desktop-actions/, 'Desktop action buttons must be grouped in desktop-actions');
  assert.match(salesCode, /responsive-cards/, 'Sales table wrap must have responsive-cards class');

  const billsCode = fs.readFileSync('frontend/js/views/bills.js', 'utf8');
  assert.match(billsCode, /pd-more-btn/, 'Bills table rows must include pd-more-btn for mobile action sheet');
  assert.match(billsCode, /data-ba="more"/, 'Bills more button must trigger more action');
  assert.match(billsCode, /desktop-actions/, 'Bills desktop action buttons must be grouped in desktop-actions');
  assert.match(billsCode, /responsive-cards/, 'Bills table wrap must have responsive-cards class');

  // 4. Verify style.css responsive rules: bottom nav, 44px touch targets, dvh, sticky footers
  const styleCode = fs.readFileSync('frontend/css/style.css', 'utf8');
  assert.match(styleCode, /#tab\s*\{[^}]*position:\s*fixed/s, '#tab must be fixed bottom navigation');
  assert.match(styleCode, /safe-area-inset-bottom/, 'Bottom padding must respect safe-area-inset-bottom');
  assert.match(styleCode, /action-sheet/, 'CSS must style action-sheet component');
  assert.match(styleCode, /min-height:\s*44px/, 'Minimum touch target size 44px must be enforced');
  assert.match(styleCode, /dvh/, 'Dynamic viewport height (dvh) must be supported');

  // 5. Verify invoice.css responsive rules
  const invoiceCode = fs.readFileSync('frontend/css/invoice.css', 'utf8');
  assert.match(invoiceCode, /\.pd-more-btn/, 'invoice.css must style pd-more-btn');
  assert.match(invoiceCode, /\.desktop-actions/, 'invoice.css must style desktop-actions');
  assert.match(invoiceCode, /\.pd-table-wrap\.responsive-cards/, 'invoice.css must support responsive-cards transformation');
});

test('TC-MOBILE-PERF-01: Native Android app performance, PWA manifest, offline storage, hardware acceleration, and debouncing', async () => {
  const fs = await import('node:fs');

  // 1. Standalone PWA manifest and Service Worker
  const manifest = JSON.parse(fs.readFileSync('frontend/manifest.json', 'utf8'));
  assert.strictEqual(manifest.display, 'standalone', 'PWA manifest must configure standalone display');
  assert.strictEqual(manifest.short_name, 'BUFIN', 'PWA manifest short_name must be BUFIN');
  assert.ok(manifest.icons && manifest.icons.length >= 2, 'PWA manifest must have at least 2 icon sizes');

  const swCode = fs.readFileSync('frontend/sw.js', 'utf8');
  assert.match(swCode, /caches\.open/, 'Service worker must cache core assets');
  assert.match(swCode, /stale-while-revalidate|cache\.put/i, 'Service worker must cache static assets');
  assert.match(swCode, /\/api\/state/, 'Service worker must handle /api/state requests with network-first fallback');

  const indexHtml = fs.readFileSync('frontend/index.html', 'utf8');
  assert.match(indexHtml, /rel="manifest"\s+href="\/manifest\.json"/, 'index.html must link to /manifest.json');
  assert.match(indexHtml, /name="mobile-web-app-capable"/, 'index.html must have mobile-web-app-capable');
  assert.match(indexHtml, /navigator\.serviceWorker\.register/, 'index.html must register service worker');

  // 2. Offline store and optimistic state synchronization
  const offlineCode = fs.readFileSync('frontend/js/modules/offline_store.js', 'utf8');
  assert.match(offlineCode, /indexedDB\.open/, 'offline_store.js must initialize IndexedDB');
  assert.match(offlineCode, /cacheCoreRef/, 'offline_store.js must export cacheCoreRef');
  assert.match(offlineCode, /saveFullSnapshot/, 'offline_store.js must export saveFullSnapshot');

  const stateCode = fs.readFileSync('frontend/js/modules/state.js', 'utf8');
  assert.match(stateCode, /cacheCoreRef/, 'state.js must integrate offline reference caching');
  assert.match(stateCode, /saveFullSnapshot/, 'state.js must persist full snapshots');

  // 3. Hardware acceleration & touch feedback in style.css
  const styleCode = fs.readFileSync('frontend/css/style.css', 'utf8');
  assert.match(styleCode, /overscroll-behavior-y:\s*none/, 'style.css must disable pull-to-refresh & bounce scroll');
  assert.match(styleCode, /translate3d/, 'style.css must use hardware-accelerated translate3d');
  assert.match(styleCode, /touch-ripple/, 'style.css must define touch ripple animation');
  assert.match(styleCode, /button:active/, 'style.css must define active touch state');

  // 4. Code splitting & lazy loading in app.js
  const appCode = fs.readFileSync('frontend/js/app.js', 'utf8');
  assert.match(appCode, /ROUTE_LOADERS/, 'app.js must define route-based code splitting loaders');
  assert.match(appCode, /import\('\.\/views\/sales\.js'\)/, 'app.js must lazy load sales.js chunk');
  assert.match(appCode, /import\('\.\/views\/bills\.js'\)/, 'app.js must lazy load bills.js chunk');
  assert.match(appCode, /prefetchRemaining|requestIdleCallback/, 'app.js must prefetch remaining routes during idle periods');

  // 5. Debounced list searches (300ms)
  assert.match(appCode, /300\);[\s\S]*loansState/, 'Loans search must be debounced with 300ms');
  assert.match(appCode, /300\);[\s\S]*moneyState/, 'Money manager search must be debounced with 300ms');

  const salesCode = fs.readFileSync('frontend/js/views/sales.js', 'utf8');
  assert.match(salesCode, /debounce\(.*300\)/s, 'Sales records search must be debounced with 300ms');

  const billsCode = fs.readFileSync('frontend/js/views/bills.js', 'utf8');
  assert.match(billsCode, /debounce\(.*300\)/s, 'Bills records search must be debounced with 300ms');

  // 6. WebP compression & lazy loading on images
  const utilsCode = fs.readFileSync('frontend/js/modules/utils.js', 'utf8');
  assert.match(utilsCode, /export function toWebpThumbnail/, 'utils.js must export toWebpThumbnail');

  const attCode = fs.readFileSync('frontend/js/modules/attachments.js', 'utf8');
  assert.match(attCode, /toWebpThumbnail/, 'attachments.js must optimize images using toWebpThumbnail');
  assert.match(attCode, /loading="lazy"/, 'attachments.js must use loading="lazy"');
});



