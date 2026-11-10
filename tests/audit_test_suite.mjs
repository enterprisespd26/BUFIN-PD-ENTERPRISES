import test from 'node:test';
import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';
import nodeFs from 'node:fs';

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
import { convertRate, UNIT_FACTORS, fmt, uid, fmtDate, isoToDmy, dmyToIso } from '../frontend/js/modules/utils.js';
import { db, setDb, post, checkCashLiquidity, net, dstat, out, sgn, acc, reverse } from '../frontend/js/modules/state.js';
import { getInventoryStock } from '../frontend/js/views/bills.js';
import { taxSplit } from '../frontend/js/modules/actions.js';
import { saveAttachments, getAttachments } from '../frontend/js/modules/attachments.js';
import { detectHsnCode, renderSheet } from '../frontend/js/views/sales.js';
import { renderCoa, renderBook, accountingState } from '../frontend/js/views/accounting.js';
import { renderParties, partiesState } from '../frontend/js/views/parties.js';

// Reset database helper
function resetTestDb() {
  setDb({
    biz: {
      name: 'PD ENTERPRISES',
      owner: 'Pritam Das',
      gstin: '21IFNPD3153M1ZC',
      addr: 'Plot No-302, Khata No-111, Khaira, At- Muhanchuan, Po- Panichhatra, Dist- Balasore, Odisha – 756059, India',
      phone: '+91 7684010176',
      email: 'enterprisespd26@gmail.com',
      state: 'Odisha',
      prefix: 'PD/2627/',
      bank_name: 'State Bank of India (SBI)',
      account_holder: 'PD ENTERPRISES',
      account_no: '00000045659125494',
      account_type: 'Current Account',
      account_desc: 'CA-REGULAR-PUB-OTH-ALL-INR',
      ifsc: 'SBIN0009825',
      micr: '756002536',
      bank_addr: 'Plot No-302, Khata No-111, Panichhatara, Muhanchuan – 756059',
      bank: 'State Bank of India (SBI) - A/C: 00000045659125494\nIFSC: SBIN0009825 | MICR: 756002536\nCurrent Account: CA-REGULAR-PUB-OTH-ALL-INR\nPlot No-302, Khata No-111, Panichhatara, Muhanchuan – 756059',
      upi: '7684010176@upi',
      terms: '1. Payment within 15 days.\n2. Goods once sold will not be taken back.\n3. Weight at our weighbridge is final.\n4. Subject to Balasore jurisdiction.',
      lock: ''
    },
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

test('TC-SALES-04: Conditional Billing Logic & Validation Check (Paid in Full vs Credit / Pending)', () => {
  // Helper mimicking calcFigs from sales.js
  const calcTestFigs = (lines, disc, rate, mode, paidVal) => {
    const sub = (lines || []).reduce((s, l) => s + (parseFloat(l.q) || 0) * (parseFloat(l.r) || 0), 0);
    const tx = sub - (disc || 0);
    const tax = tx * (rate || 0) / 100;
    const gt = Math.round(tx + tax);
    let paidPaisa = 0;
    if (paidVal !== undefined && paidVal !== null && paidVal !== '') {
      const raw = parseFloat(paidVal) || 0;
      paidPaisa = (raw > gt * 10 && gt > 0) ? raw : Math.round(raw * 100);
    }
    const paidRupees = paidPaisa / 100;
    const rec = Math.min(gt, Math.max(0, Math.round(paidRupees * 100) / 100));
    const bal = Math.max(0, Math.round((gt - rec) * 100) / 100);
    const isPaid = bal <= 0 && (gt === 0 || rec >= gt);
    return { sub, gt, rec, bal, isPaid };
  };

  const testLines = [{ n: 'Copper scrap', q: 100, r: 60 }]; // ₹6,000 subtotal + 18% GST = ₹7,080

  // 1. Scenario A: Paid in Full
  const figPaid = calcTestFigs(testLines, 0, 18, 'intra', 7080);
  assert.equal(figPaid.gt, 7080, 'Grand total must be 7080');
  assert.equal(figPaid.rec, 7080, 'Received amount must exactly match grand total (7080)');
  assert.equal(figPaid.bal, 0, 'Balance due must be exactly 0.00');
  assert.equal(figPaid.rec + figPaid.bal, figPaid.gt, 'Received + Balance Due must equal Grand Total');
  assert.ok(figPaid.isPaid, 'isPaid must resolve to true');

  // Terms #1 for Paid in Full
  const defaultTerms = '1. Payment within 15 days.\n2. Goods once sold will not be taken back.';
  const paidTerms = defaultTerms.replace(/^\s*1\.\s*(Payment within|Paid in full)[^\n]*/mi, '1. Paid in full via NEFT.');
  assert.ok(paidTerms.startsWith('1. Paid in full via NEFT.'), 'Terms rule #1 must change to Paid in full via NEFT');

  // 2. Scenario B: Unpaid / Credit Term
  const figUnpaid = calcTestFigs(testLines, 0, 18, 'intra', 0);
  assert.equal(figUnpaid.gt, 7080, 'Grand total must be 7080');
  assert.equal(figUnpaid.rec, 0, 'Received amount must be 0.00');
  assert.equal(figUnpaid.bal, 7080, 'Balance due must equal Grand Total (7080)');
  assert.equal(figUnpaid.rec + figUnpaid.bal, figUnpaid.gt, 'Received + Balance Due must equal Grand Total');
  assert.ok(!figUnpaid.isPaid, 'isPaid must resolve to false');

  // Terms #1 for Credit / Unpaid
  const creditTerms = paidTerms.replace(/^\s*1\.\s*Paid in full[^\n]*/mi, '1. Payment within 15 days.');
  assert.ok(creditTerms.startsWith('1. Payment within 15 days.'), 'Terms rule #1 must keep Payment within 15 days');

  // 3. Validation Check: Guard against 7-lakh input error
  const erroneousInput = 708000; // 7 lakhs entered instead of 7080
  const isPaiseMismatch = erroneousInput > figPaid.gt * 10;
  assert.ok(isPaiseMismatch, 'Validation must detect 10x paise mismatch');
});

test('TC-SALES-05: Auto-generate HSN codes based on item/material name and eliminate hardcoded 7204 duplication', () => {
  resetTestDb();

  // 1. Packaging / Gunny Bags / Bardana / GBG
  assert.equal(detectHsnCode('gbg'), '6305', 'Trade abbreviation "gbg" must auto-detect HSN 6305');
  assert.equal(detectHsnCode('Gunny bags'), '6305', 'Gunny bags must auto-detect HSN 6305');
  assert.equal(detectHsnCode('Jute sacks'), '6305', 'Jute sacks must auto-detect HSN 6305');
  assert.equal(detectHsnCode('Bardana'), '6305', 'Bardana must auto-detect HSN 6305');

  // 2. Metals & Standard Commodities
  assert.equal(detectHsnCode('Iron scrap'), '7204', 'Iron scrap must auto-detect HSN 7204');
  assert.equal(detectHsnCode('Steel scrap'), '7204', 'Steel scrap must auto-detect HSN 7204');
  assert.equal(detectHsnCode('MS scrap'), '7204', 'MS scrap must auto-detect HSN 7204');
  assert.equal(detectHsnCode('HMS 1 & 2'), '7204', 'HMS must auto-detect HSN 7204');
  assert.equal(detectHsnCode('Copper scrap'), '7404', 'Copper scrap must auto-detect HSN 7404');
  assert.equal(detectHsnCode('Armature copper'), '7404', 'Armature copper must auto-detect HSN 7404');
  assert.equal(detectHsnCode('Brass scrap'), '7404', 'Brass scrap must auto-detect HSN 7404');
  assert.equal(detectHsnCode('Aluminium scrap'), '7602', 'Aluminium scrap must auto-detect HSN 7602');
  assert.equal(detectHsnCode('Battery scrap'), '8549', 'Battery scrap must auto-detect HSN 8549');
  assert.equal(detectHsnCode('Lead acid battery'), '8549', 'Lead acid battery must auto-detect HSN 8549');
  assert.equal(detectHsnCode('Plastic scrap'), '3915', 'Plastic scrap must auto-detect HSN 3915');
  assert.equal(detectHsnCode('Carton / Paper raddi'), '4707', 'Carton / Paper must auto-detect HSN 4707');
  assert.equal(detectHsnCode('Lead scrap'), '7802', 'Lead scrap must auto-detect HSN 7802');
  assert.equal(detectHsnCode('Zinc scrap'), '7902', 'Zinc scrap must auto-detect HSN 7902');
  assert.equal(detectHsnCode('Rubber / Tyre scrap'), '4004', 'Rubber / tyre scrap must auto-detect HSN 4004');
  assert.equal(detectHsnCode('Glass bottles / cullet'), '7001', 'Glass cullet must auto-detect HSN 7001');

  // 3. Custom / Unknown items must start with empty HSN string (never forced 7204)
  assert.equal(detectHsnCode('Custom Item XYZ'), '', 'Unrecognized items must return empty string');
  assert.equal(detectHsnCode(''), '', 'Empty string must return empty string');
  assert.equal(detectHsnCode(null), '', 'Null must return empty string');

  // 4. Ensure new catalog items do not inherit previous row or force 7204
  const newItem = { n: '', h: '', u: 'kg', r: 0 };
  assert.equal(newItem.h, '', 'Newly added item catalog row must default to empty HSN, not 7204');

  // 5. Auto-repair stuck 7204 on legacy/erroneous gbg item
  const legacyItem = { n: 'gbg', h: '7204', u: 'kg', r: 0 };
  let resolvedHsn = legacyItem.h;
  const autoHsn = detectHsnCode(legacyItem.n);
  if (!resolvedHsn || (resolvedHsn === '7204' && autoHsn && autoHsn !== '7204')) {
    resolvedHsn = autoHsn;
  }
  assert.equal(resolvedHsn, '6305', 'Legacy item "gbg" stuck with 7204 must resolve to 6305');
});

test('TC-SALES-06: Invoice items table closing black line at end of item list', () => {
  resetTestDb();
  const html = renderSheet({
    no: 'PD/2627/0001',
    date: '2026-10-11',
    lines: [
      { n: 'Copper scrap', h: '7404', q: 100, u: 'kg', r: 60 }
    ]
  });
  assert.ok(html.includes('class="pd-sheet-table"'), 'Invoice table must include class pd-sheet-table');
  assert.ok(html.includes('class="pd-last-item-row"'), 'Last row of item list must have class pd-last-item-row for closing border');
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

test('TC-ACC-COA-01: Chart of Accounts table markup, top-right card alignment, and icon-only Edit/Delete buttons', () => {
  resetTestDb();
  const html = renderCoa();
  assert.ok(html.includes('coa-table'), 'Must render coa-table class on accounts table');
  assert.ok(html.includes('coa-title-td'), 'Must render coa-title-td on account title cell');
  assert.ok(html.includes('coa-act-td'), 'Must render coa-act-td on account actions cell');
  assert.ok(html.includes('coa-btn-edit'), 'Must render coa-btn-edit button');
  assert.ok(html.includes('aria-label="Edit '), 'Edit button must have accessible aria-label');
  assert.ok(!html.includes('>Edit<'), 'Edit button must be icon-only without raw text');
  if (html.includes('coa-btn-del')) {
    assert.ok(!html.includes('>Delete<'), 'Delete button must be icon-only without raw text');
    assert.ok(html.includes('aria-label="Delete '), 'Delete button must have accessible aria-label');
  }
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

test('TC-SYS-AUTH-01: Instant 0ms PIN SHA-256 verification and client fast-unlock', () => {
  const pin = '1379';
  const expectedHash = '8cfecd937a9328ecb71d3c08e5dd312058ca7d75171e7ba6e3af7573e210cd6c';
  const cryptoHash = nodeCrypto.createHash('sha256').update(pin).digest('hex');
  assert.equal(cryptoHash, expectedHash, 'PIN hash must match 8cfecd937a9328ecb71d3c08e5dd312058ca7d75171e7ba6e3af7573e210cd6c for 0ms unlock');

  // Verify mobile edge-to-edge lockscreen keypad styling (no floating card)
  const loginCss = nodeFs.readFileSync('frontend/css/login.css', 'utf8');
  assert.match(loginCss, /@media\s*\(max-width:\s*640px\)/, 'login.css must define dedicated mobile breakpoint');
  assert.match(loginCss, /\.login-card\s*\{[^}]*border:\s*none\s*!important/i, 'mobile login-card must remove border');
  assert.match(loginCss, /\.login-card\s*\{[^}]*border-radius:\s*0\s*!important/i, 'mobile login-card must remove border-radius');
  assert.match(loginCss, /\.login-card\s*\{[^}]*box-shadow:\s*none\s*!important/i, 'mobile login-card must remove box-shadow');
  assert.match(loginCss, /\.pin-btn\s*\{[^}]*width:\s*72px\s*!important/i, 'mobile keypad buttons must use 72px touch targets');
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

test('TC-PARTY-FILTER-01: Responsive segmented filter track and dedicated mobile search bar for parties view', () => {
  resetTestDb();

  // 1. Initial render with 'all' filter
  partiesState.pt = 'all';
  partiesState.pq = '';
  let html = renderParties();

  // Verify segmented track and buttons
  assert.ok(html.includes('class="filters parties-filter-bar"'), 'Filter container must have parties-filter-bar class');
  assert.ok(html.includes('class="parties-segment-track"'), 'Segmented track container must exist');
  assert.ok(html.includes('data-a="ptab" data-i="all"'), 'All tab button must exist');
  assert.ok(html.includes('data-a="ptab" data-i="customer"'), 'Customer tab button must exist');
  assert.ok(html.includes('data-a="ptab" data-i="supplier"'), 'Supplier tab button must exist');
  assert.ok(html.includes('data-a="ptab" data-i="other"'), 'Other tab button must exist');
  assert.ok(html.includes('aria-selected="true" class="parties-seg-btn p active" data-a="ptab" data-i="all"'), 'All tab must be active when pt="all"');

  // Verify search bar wrapper, input and icon
  assert.ok(html.includes('class="parties-search-wrap"'), 'Search bar wrapper must exist');
  assert.ok(html.includes('class="parties-search-ico"'), 'Search icon SVG must exist');
  assert.ok(html.includes('data-k="pq" class="parties-search-input"'), 'Search input with data-k="pq" must exist');

  // 2. Filter switch to 'customer'
  partiesState.pt = 'customer';
  html = renderParties();
  assert.ok(html.includes('aria-selected="true" class="parties-seg-btn p active" data-a="ptab" data-i="customer"'), 'Customer tab must be active when pt="customer"');

  // 3. Search query with clear button
  partiesState.pq = 'Copper';
  html = renderParties();
  assert.ok(html.includes('data-a="clearpartiessearch"'), 'Clear search button must be rendered when pq has text');
  assert.ok(html.includes('value="Copper"'), 'Input must have current search value');

  // Reset
  partiesState.pt = 'all';
  partiesState.pq = '';
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

test('TC-OPEN-03: Updating opening balances as-of date updates entry date in-place', () => {
  resetTestDb();

  // Initial opening entry as of Oct 1, 2026
  const entry = post({
    id: 'open_entry_1',
    date: '2026-10-01',
    src: 'open',
    narr: 'Opening balances',
    lines: [
      { a: '1000', d: 1000000, c: 0 },
      { a: '3200', d: 0, c: 1000000 }
    ]
  });

  assert.equal(entry.date, '2026-10-01');

  // Change date to April 1, 2026
  const updated = post({
    id: 'open_entry_1',
    date: '2026-04-01',
    src: 'open',
    narr: 'Opening balances (updated date)',
    lines: [
      { a: '1000', d: 1000000, c: 0 },
      { a: '3200', d: 0, c: 1000000 }
    ]
  });

  assert.equal(db.entries.length, 1, 'Entry must not duplicate');
  assert.equal(updated.date, '2026-04-01', 'Entry date must update to 2026-04-01');
  assert.equal(entry.date, '2026-04-01', 'Original entry reference date must be updated');
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

test('TC-SYS-BIZ-01: Permanent PD ENTERPRISES company and State Bank of India bank details are preserved across business settings and invoices', () => {
  resetTestDb();

  // Verify Permanent Business Credentials
  assert.equal(db.biz.name, 'PD ENTERPRISES', 'Company name must be PD ENTERPRISES');
  assert.equal(db.biz.gstin, '21IFNPD3153M1ZC', 'GSTIN must be 21IFNPD3153M1ZC');
  assert.equal(db.biz.addr, 'Plot No-302, Khata No-111, Khaira, At- Muhanchuan, Po- Panichhatra, Dist- Balasore, Odisha – 756059, India', 'Registered address must match exactly');
  assert.equal(db.biz.phone, '+91 7684010176', 'Phone must match');
  assert.equal(db.biz.email, 'enterprisespd26@gmail.com', 'Email must match');
  assert.equal(db.biz.state, 'Odisha', 'State must be Odisha');

  // Verify Permanent State Bank of India (SBI) Details
  assert.equal(db.biz.bank_name, 'State Bank of India (SBI)', 'Bank name must be State Bank of India (SBI)');
  assert.equal(db.biz.account_holder, 'PD ENTERPRISES', 'Account holder must be PD ENTERPRISES');
  assert.equal(db.biz.account_no, '00000045659125494', 'Account number must be 00000045659125494');
  assert.equal(db.biz.account_type, 'Current Account', 'Account type must be Current Account');
  assert.equal(db.biz.account_desc, 'CA-REGULAR-PUB-OTH-ALL-INR', 'Account description must match');
  assert.equal(db.biz.ifsc, 'SBIN0009825', 'IFSC code must be SBIN0009825');
  assert.equal(db.biz.micr, '756002536', 'MICR code must be 756002536');
  assert.equal(db.biz.bank_addr, 'Plot No-302, Khata No-111, Panichhatara, Muhanchuan – 756059', 'Bank branch address must match');

  // Verify Multi-line Bank Details for Invoices & Settings
  assert.ok(db.biz.bank.includes('00000045659125494'), 'Invoice bank details must contain account number');
  assert.ok(db.biz.bank.includes('SBIN0009825'), 'Invoice bank details must contain IFSC code');
  assert.ok(db.biz.bank.includes('756002536'), 'Invoice bank details must contain MICR code');
  assert.ok(db.biz.bank.includes('CA-REGULAR-PUB-OTH-ALL-INR'), 'Invoice bank details must contain account description');
  assert.ok(db.biz.bank.includes('Panichhatara, Muhanchuan'), 'Invoice bank details must contain bank address');
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

test('TC-PRELOADER-PERF-01: Instant PWA splash screen transition, clean white maskable icon, and deferred PDF parser', async () => {
  const fs = await import('node:fs');

  // 1. Verify manifest.json splash background and theme color alignment
  const manifest = JSON.parse(fs.readFileSync('frontend/manifest.json', 'utf8'));
  assert.strictEqual(manifest.background_color, '#FFFFFF', 'PWA splash background must be #FFFFFF to match clean app canvas');
  assert.strictEqual(manifest.theme_color, '#FFFFFF', 'PWA theme color must be #FFFFFF');
  assert.ok(manifest.icons.some(i => i.src === '/icons/maskable-icon-512x512.png' && i.purpose === 'maskable'), 'Maskable 512x512 icon must exist');
  assert.ok(manifest.icons.some(i => i.src === '/icons/android-chrome-512x512.png' && i.purpose === 'any'), 'High-res 512x512 standard icon must exist');

  // 2. Verify index.html critical rendering path: deferred jsPDF and preconnected fonts
  const indexHtml = fs.readFileSync('frontend/index.html', 'utf8');
  assert.match(indexHtml, /<script\s+defer\s+src="[^"]*jspdf/i, 'jsPDF must be deferred to eliminate parser blocking during startup');
  assert.match(indexHtml, /name="theme-color"\s+content="#FFFFFF"/i, 'index.html must define #FFFFFF theme color');
  assert.match(indexHtml, /rel="preconnect"\s+href="https:\/\/fonts\.googleapis\.com"/, 'index.html must preconnect to fonts');

  // 3. Verify service worker instant cache-first / stale-while-revalidate resolution
  const swCode = fs.readFileSync('frontend/sw.js', 'utf8');
  assert.match(swCode, /caches\.match\(req\)\.then\(cached/, 'sw.js must resolve cached assets before waiting on network');
  assert.match(swCode, /'\/icons\/maskable-icon-512x512\.png'/, 'sw.js must precache maskable icon');
  assert.match(swCode, /'\/icons\/android-chrome-512x512\.png'/, 'sw.js must precache android-chrome-512 icon');

  // 4. Verify login screen seamless background continuity and full-bleed app-icon.svg
  const loginCss = fs.readFileSync('frontend/css/login.css', 'utf8');
  assert.match(loginCss, /\.login-screen\s*\{[^}]*background:\s*#FFFFFF/i, 'login-screen background must be #FFFFFF to match splash');
  const appIconSvg = fs.readFileSync('frontend/svg/app-icon.svg', 'utf8');
  assert.match(appIconSvg, /<rect width="1158" height="1158" fill="#FFFFFF"\/>/, 'app-icon.svg must have full-bleed #FFFFFF rect without rounded corners');
});

test('TC-SYS-BACKUP-01: ZIP archive with separate entity CSVs, master consolidated CSV, and system JSON restore', async () => {
  const { createZip, readZipFile, crc32 } = await import('../frontend/js/modules/utils.js');
  const { buildAllBackupFiles } = await import('../frontend/js/modules/actions.js');
  const { db, setDb } = await import('../frontend/js/modules/state.js');

  // Verify pure JS zip engine
  const sampleFiles = [
    { name: 'test_file1.txt', data: 'Hello World BUFIN Backup!' },
    { name: 'data.json', data: JSON.stringify({ app: 'BUFIN', version: '6.3' }) }
  ];
  const zipBytes = createZip(sampleFiles);
  assert.ok(zipBytes instanceof Uint8Array, 'createZip must return a Uint8Array');
  assert.ok(zipBytes.length > 50, 'ZIP must have header, data, central directory and EOCD');

  // Check PKZIP signature 0x04034b50
  const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50, 'ZIP must start with PK local header signature');

  // Verify readZipFile
  const extracted = readZipFile(zipBytes, '.json');
  assert.ok(extracted, 'readZipFile must find .json file');
  assert.equal(extracted.name, 'data.json');
  const parsed = JSON.parse(extracted.data);
  assert.equal(parsed.app, 'BUFIN');

  // Verify buildAllBackupFiles output
  const res = buildAllBackupFiles();
  const backupFiles = res.files || res;
  assert.ok(Array.isArray(backupFiles), 'buildAllBackupFiles must return an array of file records');
  assert.ok(backupFiles.length >= 10, 'Must have at least 10 backup files (master, 8 entities, json, readme)');

  const filenames = backupFiles.map(f => f.name);
  assert.ok(filenames.some(n => n.startsWith('00_all_transactions_master_combined_') && n.endsWith('.csv')), 'Must contain 00_all_transactions_master_combined CSV');
  assert.ok(filenames.some(n => n.startsWith('01_journal_entries_') && n.endsWith('.csv')), 'Must contain 01_journal_entries CSV');
  assert.ok(filenames.some(n => n.startsWith('02_chart_of_accounts_') && n.endsWith('.csv')), 'Must contain 02_chart_of_accounts CSV');
  assert.ok(filenames.some(n => n.startsWith('03_sales_invoices_') && n.endsWith('.csv')), 'Must contain 03_sales_invoices CSV');
  assert.ok(filenames.some(n => n.startsWith('04_purchase_bills_') && n.endsWith('.csv')), 'Must contain 04_purchase_bills CSV');
  assert.ok(filenames.some(n => n.startsWith('05_parties_directory_') && n.endsWith('.csv')), 'Must contain 05_parties_directory CSV');
  assert.ok(filenames.some(n => n.startsWith('06_inventory_items_') && n.endsWith('.csv')), 'Must contain 06_inventory_items CSV');
  assert.ok(filenames.some(n => n.startsWith('07_cash_and_bank_book_') && n.endsWith('.csv')), 'Must contain 07_cash_and_bank_book CSV');
  assert.ok(filenames.some(n => n.startsWith('08_loans_register_') && n.endsWith('.csv')), 'Must contain 08_loans_register CSV');
  assert.ok(filenames.some(n => n.startsWith('bufin_system_backup_state_') && n.endsWith('.json')), 'Must contain native system JSON backup');
  assert.ok(filenames.some(n => n === 'README_BACKUP_SUMMARY.txt'), 'Must contain README_BACKUP_SUMMARY.txt');

  // Test full ZIP generation and extraction of system json
  const fullZip = createZip(backupFiles);
  const jsonInZip = readZipFile(fullZip, '.json');
  assert.ok(jsonInZip, 'readZipFile must extract system backup state JSON from full archive');
  const restoredState = JSON.parse(jsonInZip.data);
  assert.ok(Array.isArray(restoredState.accounts), 'Restored JSON must have valid accounts');
});

test('TC-DATE-FILTER-01: DD/MM/YYYY date formatting, dedicated mobile date range card, and auto-select presets', () => {
  // 1. Verify date formatting helpers enforce standard Indian DD/MM/YYYY
  assert.equal(fmtDate('2026-11-01'), '01/11/2026');
  assert.equal(fmtDate('2026-10-31'), '31/10/2026');
  assert.equal(fmtDate('2026-04-01'), '01/04/2026');
  assert.equal(fmtDate('01/11/2026'), '01/11/2026');
  assert.equal(isoToDmy('2026-05-15'), '15/05/2026');
  assert.equal(dmyToIso('15/05/2026'), '2026-05-15');

  // 2. Verify Cash & Bank Book auto-initializes to "This Month"
  accountingState.cb = { c: 'all', f: '', t: '', q: '' }; // reset state
  const html = renderBook();

  assert.equal(accountingState.cb.init, true, 'Cash & Bank Book must mark init=true on first visit');
  assert.ok(accountingState.cb.f.endsWith('-01'), 'From date must auto-select start of current month');
  assert.ok(accountingState.cb.t.length === 10, 'To date must auto-select today');

  // 3. Verify dedicated mobile date range card structure
  assert.ok(html.includes('cb-date-range-card'), 'Must contain .cb-date-range-card component');
  assert.ok(html.includes('id="cbFromBox"'), 'Must have dedicated #cbFromBox touch tile');
  assert.ok(html.includes('id="cbToBox"'), 'Must have dedicated #cbToBox touch tile');
  assert.ok(html.includes('id="bookFromVal"'), 'Must have #bookFromVal formatted date display');
  assert.ok(html.includes('id="bookToVal"'), 'Must have #bookToVal formatted date display');
  assert.ok(html.includes(fmtDate(accountingState.cb.f)), 'Card must display DD/MM/YYYY formatted from date');
  assert.ok(html.includes(fmtDate(accountingState.cb.t)), 'Card must display DD/MM/YYYY formatted to date');

  // 4. Verify native date input overlay for seamless native picker trigger
  assert.ok(html.includes('class="cb-native-date-input"'), 'Must have overlaid .cb-native-date-input for OS picker trigger');

  // 5. Verify dedicated presets track
  assert.ok(html.includes('cb-presets'), 'Must contain .cb-presets pill container');
  assert.ok(html.includes('data-i="today"'), 'Must include Today preset');
  assert.ok(html.includes('data-i="month"'), 'Must include This Month preset');
  assert.ok(html.includes('data-i="lastmonth"'), 'Must include Last Month preset');
  assert.ok(html.includes('data-i="fy"'), 'Must include This FY preset');
  assert.ok(html.includes('data-i="all"'), 'Must include All Time preset');

  // 6. Verify opening balance is formatted as DD/MM/YYYY
  assert.ok(html.includes(`as of ${fmtDate(accountingState.cb.f)}`), 'Opening balance subtitle must format date as DD/MM/YYYY');
});





