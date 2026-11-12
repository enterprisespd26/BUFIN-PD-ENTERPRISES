import { toast, uid, today, fmt, P } from './utils.js';
import { cacheCoreRef, saveFullSnapshot } from './offline_store.js';

export const K = 'bufin-v1';

export const AC = [
  ['1000', 'Cash in Hand', 'A', 1],
  ['1010', 'Bank Account', 'A', 1],
  ['1100', 'Accounts Receivable', 'A'],
  ['1200', 'Inventory', 'A'],
  ['1300', 'Input GST', 'A'],
  ['1400', 'Loan Receivable', 'A'],
  ['1500', 'Equipment', 'A'],
  ['2000', 'Accounts Payable', 'L'],
  ['2100', 'Loan Payable', 'L'],
  ['2200', 'Output GST', 'L'],
  ['3000', "Owner's Capital", 'E'],
  ['3100', 'Drawings', 'E'],
  ['3200', 'Opening Balance Equity', 'E'],
  ['4000', 'Sales Revenue', 'I'],
  ['4100', 'Service Revenue', 'I'],
  ['4200', 'Other Income', 'I'],
  ['4300', 'Interest Income', 'I'],
  ['5000', 'Purchases / Cost of Goods Sold', 'X'],
  ['5100', 'Rent Expense', 'X'],
  ['5200', 'Transport Expense', 'X'],
  ['5300', 'Salaries', 'X'],
  ['5400', 'Utilities', 'X'],
  ['5500', 'Interest Expense', 'X'],
  ['5600', 'Miscellaneous Expense', 'X']
];

export const TN = {
  A: 'Asset',
  L: 'Liability',
  E: 'Equity',
  I: 'Income',
  X: 'Expense'
};

export const PT = {
  customer: 'Customer (we sell to)',
  supplier: 'Supplier (we buy from)',
  both: 'Customer and supplier',
  lender: 'Lender (loan provider)',
  expense: 'Expense Vendor (services / overheads)',
  other: 'Other'
};

export const partyTypeLabel = p => {
  if (!p) return '';
  if (p.type === 'lender') return 'Lender';
  if (p.type === 'expense') return 'Expense Vendor';
  if (p.type === 'supplier') return 'Supplier';
  if (p.type === 'customer') return 'Customer';
  if (p.type === 'both') return 'Customer & Supplier';
  if (p.type === 'other') return 'Other';
  return (PT[p.type] || p.type || 'Other').split(' (')[0];
};

export function syncPartyClassifications(targetDb) {
  if (!targetDb || !Array.isArray(targetDb.parties)) return false;
  let modified = false;

  const tradeSupplierIds = new Set(
    (targetDb.docs || [])
      .filter(d => d.type === 'bill' && !d.cancelled)
      .map(d => d.party)
      .filter(Boolean)
  );

  const tradeCustomerIds = new Set(
    (targetDb.docs || [])
      .filter(d => d.type === 'sale' && !d.cancelled)
      .map(d => d.party)
      .filter(Boolean)
  );

  const loanPartyIds = new Set(
    (targetDb.loans || []).map(l => l.party).filter(Boolean)
  );

  const loanPartyNames = new Set(
    (targetDb.loans || []).map(l => (l.partyName || '').trim().toLowerCase()).filter(Boolean)
  );

  for (const p of targetDb.parties) {
    if (!p) continue;
    const nameLower = (p.name || '').trim().toLowerCase();
    const isLoanParty = loanPartyIds.has(p.id) || loanPartyNames.has(nameLower);
    const hasTradeBills = tradeSupplierIds.has(p.id);
    const hasTradeSales = tradeCustomerIds.has(p.id);

    // 1. Loans / lenders
    if (isLoanParty && !hasTradeBills) {
      if (p.type !== 'lender') {
        p.type = 'lender';
        modified = true;
      }
    }
    // 2. Service / license / expense entities without commercial purchase bills
    else if (!hasTradeBills && !hasTradeSales) {
      const isExpensePayee = (
        nameLower.includes('rinku toppo') ||
        nameLower.includes('registration') ||
        nameLower.includes('legal services') ||
        p.id === 'p_rinku_toppo' ||
        p.id === 'p_registration_legal' ||
        (targetDb.entries || []).some(e =>
          (e.meta?.cat && parseInt(e.meta.cat, 10) >= 5100) &&
          (e.meta?.party === p.id || (e.lines || []).some(l => l.p === p.id))
        )
      );

      if (isExpensePayee && p.type === 'supplier') {
        p.type = 'other';
        modified = true;
      }
    }
  }

  return modified;
}

export const SYS = ['1000','1010','1100','1300','1400','2000','2100','2200','3200','4200','4300','5000','5500','5600'];

let initialDb;
try {
  initialDb = JSON.parse(localStorage.getItem(K));
  if (initialDb) {
    syncPartyClassifications(initialDb);
  }
} catch (e) {}

export const DEF_SCRAP_ITEMS = [];

export let db = initialDb || {
  biz: {
    name: '',
    owner: '',
    gstin: '',
    addr: '',
    phone: '',
    email: '',
    state: '',
    prefix: '',
    bank_name: '',
    account_holder: '',
    account_no: '',
    account_type: '',
    account_desc: '',
    ifsc: '',
    micr: '',
    bank_addr: '',
    bank: '',
    upi: '',
    terms: '',
    lock: ''
  },
  accounts: AC.map(a => ({ code: a[0], name: a[1], t: a[2], cash: !!a[3] })),
  parties: [],
  entries: [],
  docs: [],
  loans: [],
  seq: {},
  items: [],
  audit: []
};

export function setDb(newDb) {
  db = newDb;
  if (db && Array.isArray(db.entries)) {
    db.entries.forEach(e => {
      if (!e.at) e.at = new Date().toISOString();
      if (!e.status) e.status = 'posted';
    });
  }
  if (db) {
    syncPartyClassifications(db);
  }
  try {
    localStorage.setItem(K, JSON.stringify(db));
    cacheCoreRef(db);
    saveFullSnapshot(db, ver);
  } catch (e) {}
}

export let ver = 0;
export function setVer(v) {
  ver = v;
}

let tm;
export const save = () => {
  try {
    localStorage.setItem(K, JSON.stringify(db));
    cacheCoreRef(db);
    saveFullSnapshot(db, ver);
  } catch (e) {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bufin-render'));
  }
  clearTimeout(tm);
  tm = setTimeout(push, 400);
};

export async function push() {
  try {
    const r = await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: ver, data: db })
    });
    const j = await r.json();
    if (r.ok) ver = j.version;
    else toast(j.error || 'Sync failed');
  } catch (e) {
    toast('Offline: saved in this browser only');
  }
}

export const acc = c => db.accounts.find(a => a.code === c);
export const an = c => acc(c) ? acc(c).name : c;
export const pn = id => (db.parties.find(p => p.id === id) || {}).name || '';

export function getOrCreateExpenseAccount(catName) {
  if (!catName || !catName.trim()) return '5600';
  const cleanName = catName.trim();
  const lowerName = cleanName.toLowerCase();

  if (!db.accounts) db.accounts = [];

  // 1. Check existing account by name (case-insensitive)
  const existing = db.accounts.find(a => a.name && a.name.trim().toLowerCase() === lowerName && a.t === 'X');
  if (existing) return existing.code;

  // 2. Determine next available 5xxx code
  const existingCodes = new Set(db.accounts.map(a => a.code));
  let nextCode = 5900;
  while (existingCodes.has(String(nextCode)) && nextCode < 5990) {
    nextCode += 10;
  }
  if (nextCode >= 5990) {
    for (let c = 5601; c < 5999; c++) {
      if (!existingCodes.has(String(c))) {
        nextCode = c;
        break;
      }
    }
  }

  const finalCode = String(nextCode);
  const newAccount = {
    code: finalCode,
    name: cleanName,
    t: 'X',
    cash: false
  };
  db.accounts.push(newAccount);
  return finalCode;
}
export const next = (k, pre) => {
  let maxNum = db.seq[k] || 0;
  if (k === 'jv') {
    for (const e of db.entries) {
      if (e.ref && e.ref.startsWith(pre)) {
        const n = parseInt(e.ref.slice(pre.length), 10);
        if (!isNaN(n) && n > maxNum) maxNum = n;
      }
    }
  }
  db.seq[k] = maxNum + 1;
  return pre + String(db.seq[k]).padStart(4, '0');
};
export const log = (a, d) => db.audit.push({ at: new Date().toISOString(), a, d });

export const net = (c, f, t) => {
  let n = 0;
  for (const e of db.entries) {
    if ((f && e.date < f) || (t && e.date > t)) continue;
    for (const l of e.lines) {
      if (l.a === c) n += l.d - l.c;
    }
  }
  return n;
};

export const sgn = (a, n) => 'AX'.includes(a.t) ? n : -n;

export function post(o) {
  const L = o.lines.filter(l => l.d || l.c);
  if (L.length < 2) throw Error('A journal needs at least two postings');
  if (L.some(l => !acc(l.a) || l.d < 0 || l.c < 0 || (l.d && l.c))) throw Error('Each line needs an account and either a debit or a credit');
  const D = L.reduce((s, l) => s + l.d, 0), C = L.reduce((s, l) => s + l.c, 0);
  if (D !== C) throw Error('Debits (' + fmt(D) + ') must strictly equal credits (' + fmt(C) + ')');
  if (!o.date) throw Error('Date is required');
  if (db.biz.lock && o.date <= db.biz.lock) throw Error('Period is locked up to ' + db.biz.lock);

  // Robust Upsert: If an existing entry matches o.id or o.ref, update in-place without generating a new JV reference
  let existing = null;
  if (o.id) existing = db.entries.find(e => e.id === o.id);
  if (!existing && o.ref) existing = db.entries.find(e => e.ref === o.ref);

  if (existing) {
    existing.date = o.date;
    if (o.narr !== undefined) existing.narr = o.narr;
    if (o.src) existing.src = o.src;
    existing.meta = { ...existing.meta, ...(o.meta || {}) };
    existing.lines = L;
    existing.status = 'posted';
    if (o.at) existing.at = o.at;
    log('update ' + existing.ref, existing.src);
    return existing;
  }

  const e = {
    id: o.id || uid(),
    ref: o.ref || next('jv', 'JV-'),
    date: o.date,
    narr: o.narr || '',
    src: o.src,
    meta: o.meta || {},
    lines: L,
    status: 'posted',
    at: o.at || new Date().toISOString(),
    rev: o.rev
  };
  db.entries.push(e);
  log('post ' + e.ref, o.src);
  return e;
}

export function reverse(id) {
  const e = db.entries.find(x => x.id === id);
  if (!e || e.status !== 'posted') throw Error('Only posted entries can be reversed');
  const r = post({
    date: e.src === 'open' ? e.date : (today() > e.date ? today() : e.date),
    narr: 'Reversal of ' + e.ref + ': ' + (e.narr || ''),
    src: 'rev',
    rev: e.id,
    lines: e.lines.map(l => ({ a: l.a, d: l.c, c: l.d, p: l.p }))
  });
  e.status = 'reversed';
  log('reverse ' + e.ref, r.ref);

  // Cascade Reversal to linked documents & payments
  // 1. If entry was the primary journal entry of an invoice or bill
  const linkedMainDoc = db.docs.find(d => d.je === e.id);
  if (linkedMainDoc) {
    linkedMainDoc.cancelled = true;
    if (linkedMainDoc.pays && linkedMainDoc.pays.length) {
      linkedMainDoc.pays.forEach(p => {
        if (!p.void && p.je) {
          const pEntry = db.entries.find(x => x.id === p.je);
          if (pEntry && pEntry.status === 'posted') {
            try { reverse(p.je); } catch (err) {}
          }
          p.void = 1;
        }
      });
    }
  }

  // 2. If entry was a payment on an invoice or bill
  for (const doc of db.docs) {
    if (doc.pays && doc.pays.length) {
      const matchPay = doc.pays.find(p => p.je === e.id);
      if (matchPay) {
        matchPay.void = 1;
        doc.paid = paid(doc) / 100;
      }
    }
  }

  // 3. If entry was a loan transaction
  if (e.src === 'loan' && e.meta?.loan) {
    const loan = (db.loans || []).find(l => l.id === e.meta.loan);
    if (loan && e.meta.kind === 'rep') {
      loan.repaid = Math.max(0, (loan.repaid || 0) - (e.meta.pr || 0));
    }
  }

  return r;
}

export const paid = d => (d.pays || []).reduce((s, p) => {
  if (p.void) return s;
  if (p.je) {
    const je = db.entries.find(e => e.id === p.je);
    if (je && je.status === 'reversed') return s;
  }
  const amt = p.amt !== undefined ? p.amt : (p.a !== undefined ? p.a : 0);
  return s + (parseFloat(amt) || 0);
}, 0);
export const out = d => (d.total || 0) - paid(d);
export const dstat = d => d.cancelled ? ['Cancelled', 'rd'] : out(d) <= 0 ? ['Paid', 'ok'] : d.due && d.due < today() ? ['Overdue', 'rd'] : paid(d) > 0 ? ['Partial', 'wn'] : ['Open', ''];

export const cashAcc = () => db.accounts.filter(a => a.cash);
export const isC = p => !!(p && (p.type === 'customer' || p.type === 'both'));
export const isS = p => !!(p && (p.type === 'supplier' || p.type === 'both'));

export const lstat = l => l.principal - l.repaid <= 0 ? ['Closed', ''] : l.due && l.due < today() ? ['Overdue', 'rd'] : ['Active', 'ok'];
export const lacr = l => Math.round((l.principal - l.repaid) * l.rate / 100 * Math.max(0, Math.round((new Date(today()) - new Date(l.last)) / 864e5)) / 365);

export const sortEntries = (entries) => {
  return (entries || []).slice().sort((a, b) => {
    const dDiff = (a.date || '').localeCompare(b.date || '');
    if (dDiff !== 0) return dDiff;
    if (a.src === 'open' && b.src !== 'open') return -1;
    if (b.src === 'open' && a.src !== 'open') return 1;
    return (a.at || '').localeCompare(b.at || '');
  });
};

export function checkCashLiquidity(accountCode, amountPaisa, excludeJeId = null) {
  if (accountCode !== '1000') return { ok: true, available: net(accountCode) };
  let currentNet = 0;
  for (const e of db.entries) {
    if (e.status !== 'posted' || (excludeJeId && e.id === excludeJeId)) continue;
    for (const l of e.lines) {
      if (l.a === '1000') currentNet += (l.d || 0) - (l.c || 0);
    }
  }
  if (amountPaisa > currentNet) {
    return {
      ok: false,
      available: currentNet,
      error: `Insufficient cash in hand balance. Available: ${fmt(Math.max(0, currentNet))}. Please deposit funds or pay via Bank Account.`
    };
  }
  return { ok: true, available: currentNet };
}
