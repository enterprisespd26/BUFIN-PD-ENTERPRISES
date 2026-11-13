import { toast, uid, today, fmt, P, esc } from './utils.js';
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
    } else if (p.type === 'lender' && !isLoanParty) {
      // Recompute party type after loan removal - do not leave party typed 'lender'
      if (hasTradeSales && hasTradeBills) p.type = 'both';
      else if (hasTradeSales) p.type = 'customer';
      else if (hasTradeBills) p.type = 'supplier';
      else p.type = 'other';
      modified = true;
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

export function migrateSchema(targetDb) {
  if (!targetDb || !Array.isArray(targetDb.docs)) return;
  if (!targetDb.schemaVer || targetDb.schemaVer < 2) {
    for (const doc of targetDb.docs) {
      if (!doc) continue;
      if (doc.total !== undefined && doc.total !== null) {
        doc.total = Math.round(Number(doc.total) || 0);
      }
      if (Array.isArray(doc.pays)) {
        for (const p of doc.pays) {
          if (p.amt !== undefined) p.amt = Math.round(Number(p.amt) || 0);
          else if (p.a !== undefined) p.amt = Math.round(Number(p.a) || 0);
        }
      }
      if (Array.isArray(doc.pays) && doc.pays.length) {
        doc.paid = doc.pays.reduce((s, p) => s + (p.void ? 0 : (Number(p.amt || p.a) || 0)), 0);
      } else if (doc.paid !== undefined && doc.paid !== null) {
        const rawPaid = Number(doc.paid) || 0;
        if (doc.total && rawPaid > 0 && rawPaid <= (doc.total / 100)) {
          doc.paid = Math.round(rawPaid * 100);
        } else {
          doc.paid = Math.round(rawPaid);
        }
      } else {
        doc.paid = 0;
      }
    }
    targetDb.schemaVer = 2;
  }
}

let initialDb;
try {
  initialDb = JSON.parse(localStorage.getItem(K));
  if (initialDb) {
    syncPartyClassifications(initialDb);
    migrateSchema(initialDb);
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

let initialVer = 0;
let initialBaseVer = 0;
let initialDirty = false;
let initialUnsynced = 0;

try {
  const storedVer = typeof localStorage !== 'undefined' ? localStorage.getItem(K + '_ver') : null;
  if (storedVer !== null) {
    initialVer = parseInt(storedVer, 10) || 0;
    initialBaseVer = initialVer;
  }
  const storedBv = typeof localStorage !== 'undefined' ? localStorage.getItem(K + '_baseVer') : null;
  if (storedBv !== null) {
    initialBaseVer = parseInt(storedBv, 10) || initialVer;
  }
  if (typeof localStorage !== 'undefined') {
    initialDirty = localStorage.getItem(K + '_dirty') === 'true';
    initialUnsynced = parseInt(localStorage.getItem(K + '_unsyncedCount'), 10) || (initialDirty ? 1 : 0);
  }
} catch (e) {}

export let ver = initialVer;
export let baseVer = initialBaseVer;
export let dirty = initialDirty;
export let unsyncedCount = initialUnsynced;

export function setVer(v) {
  ver = typeof v === 'number' ? v : (parseInt(v, 10) || 0);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(K + '_ver', String(ver));
    saveFullSnapshot(db, ver);
  } catch (e) {}
}

export function setBaseVer(v) {
  baseVer = typeof v === 'number' ? v : (parseInt(v, 10) || 0);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(K + '_baseVer', String(baseVer));
  } catch (e) {}
}

export function setDirty(isDirty, count = null) {
  dirty = !!isDirty;
  if (!dirty) {
    unsyncedCount = 0;
  } else if (count !== null) {
    unsyncedCount = count;
  } else if (unsyncedCount === 0) {
    unsyncedCount = 1;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(K + '_dirty', String(dirty));
      localStorage.setItem(K + '_unsyncedCount', String(unsyncedCount));
    }
  } catch (e) {}
  updateSyncPill();
}

export function isDirty() {
  return dirty;
}
export function getVer() {
  return ver;
}
export function getBaseVer() {
  return baseVer;
}
export function getUnsyncedCount() {
  return unsyncedCount;
}
export function getDb() {
  return db;
}

export function updateSyncPill(stateOverride) {
  if (typeof document === 'undefined') return;
  const pill = document.getElementById('syncPill');
  if (!pill) return;

  const textEl = pill.querySelector('.sync-text');
  let mode = 'saved';
  let label = 'Saved';

  const isOffline = (typeof navigator !== 'undefined' && !navigator.onLine);

  if (stateOverride === 'attention') {
    mode = 'attention';
    label = 'Needs attention';
  } else if (stateOverride === 'saving' || pushInFlight) {
    mode = 'saving';
    label = 'Saving…';
  } else if (stateOverride === 'offline' || isOffline) {
    mode = 'offline';
    label = dirty && unsyncedCount > 0 ? `Offline – ${unsyncedCount} unsynced change${unsyncedCount > 1 ? 's' : ''}` : 'Offline';
  } else if (dirty) {
    mode = 'offline';
    label = `Offline – ${unsyncedCount || 1} unsynced change${(unsyncedCount || 1) > 1 ? 's' : ''}`;
  } else {
    mode = 'saved';
    label = 'Saved';
  }

  pill.className = `sync-status-pill ${mode}`;
  if (textEl) textEl.textContent = label;
}

export function showSyncBanner(msg, type = 'error') {
  if (typeof document === 'undefined') return;
  const banner = document.getElementById('syncBanner');
  if (!banner) return;

  banner.className = `sync-banner ${type === 'warn' ? 'banner-warn' : (type === 'info' ? 'banner-info' : '')}`;
  banner.innerHTML = `
    <span class="sync-banner-text">${esc(msg)}</span>
    <button type="button" class="sync-banner-close" aria-label="Dismiss">&times;</button>
  `;
  banner.style.display = 'flex';
  const closeBtn = banner.querySelector('.sync-banner-close');
  if (closeBtn) {
    closeBtn.onclick = () => { banner.style.display = 'none'; };
  }
}

export function hideSyncBanner() {
  if (typeof document === 'undefined') return;
  const banner = document.getElementById('syncBanner');
  if (banner) banner.style.display = 'none';
}

export function showConflictModal(remote) {
  if (typeof document === 'undefined') return;
  const dlg = document.getElementById('dlg');
  if (!dlg) return;

  dlg.innerHTML = `
    <div class="conflict-modal-card">
      <div class="conflict-modal-title">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <span>Another device changed the data</span>
      </div>
      <p class="conflict-modal-desc">
        The server contains newer ledger changes recorded from another device or session that conflict with your unsynced local entries.
        To ensure complete double-entry integrity, choose how to proceed:
      </p>
      <div class="conflict-actions-stack">
        <button type="button" class="btn p" id="btnReloadServer" style="width:100%;font-weight:600;">
          Reload server copy
        </button>
        <button type="button" class="btn" id="btnDownloadUnsynced" style="width:100%;">
          Download my unsynced changes (JSON)
        </button>
      </div>
    </div>
  `;

  const btnReload = dlg.querySelector('#btnReloadServer');
  const btnDownload = dlg.querySelector('#btnDownloadUnsynced');

  if (btnReload) {
    btnReload.onclick = () => {
      if (remote && remote.data) {
        setDb(remote.data);
      }
      setVer(remote ? remote.version : ver);
      setBaseVer(remote ? remote.version : ver);
      setDirty(false, 0);
      hideSyncBanner();
      updateSyncPill('saved');
      if (typeof dlg.close === 'function') dlg.close();
      dlg.innerHTML = '';
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bufin-render'));
      }
      toast('Server copy reloaded');
    };
  }

  if (btnDownload) {
    btnDownload.onclick = () => {
      try {
        const jsonStr = JSON.stringify({ version: ver, baseVer, dirty, exportedAt: new Date().toISOString(), data: db }, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bufin-unsynced-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast('Unsynced changes downloaded as JSON');
      } catch (err) {
        toast('Download error: ' + (err.message || err));
      }
    };
  }

  if (typeof dlg.showModal === 'function') {
    try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); }
  } else {
    dlg.setAttribute('open', '');
  }
}

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
    migrateSchema(db);
  }
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(K, JSON.stringify(db));
    cacheCoreRef(db);
    saveFullSnapshot(db, ver);
  } catch (e) {}
}

export function getEmptyDb() {
  return {
    biz: {
      name: '', owner: '', gstin: '', addr: '', phone: '', email: '', state: '', prefix: '',
      bank_name: '', account_holder: '', account_no: '', account_type: '', account_desc: '',
      ifsc: '', micr: '', bank_addr: '', bank: '', upi: '', terms: '', lock: ''
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
}

export function resetDb() {
  db = getEmptyDb();
  ver = 0;
  baseVer = 0;
  dirty = false;
  unsyncedCount = 0;
  updateSyncPill();
}

export function wipeStorage() {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(K);
      localStorage.removeItem(K + '_ver');
      localStorage.removeItem(K + '_dirty');
      localStorage.removeItem(K + '_baseVer');
      localStorage.removeItem(K + '_unsyncedCount');
    }
  } catch (e) {}
  resetDb();
}

let tm;
export const save = () => {
  setDirty(true, (unsyncedCount || 0) + 1);
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(K, JSON.stringify(db));
    cacheCoreRef(db);
    saveFullSnapshot(db, ver);
  } catch (e) {}
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bufin-render'));
  }
  updateSyncPill('saving');
  clearTimeout(tm);
  tm = setTimeout(push, 400);
};

let pushInFlight = false;
let pushQueued = false;
let retryConflictOnce = true;

export async function push() {
  if (pushInFlight) {
    pushQueued = true;
    return;
  }
  pushInFlight = true;
  pushQueued = false;
  updateSyncPill('saving');

  try {
    while (true) {
      if (!dirty && !pushQueued) {
        break;
      }
      pushQueued = false;

      const payloadVer = ver;
      const payloadData = db;

      let r;
      try {
        r = await fetch('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: payloadVer, data: payloadData })
        });
      } catch (netErr) {
        setDirty(true, unsyncedCount || 1);
        updateSyncPill('offline');
        break;
      }

      if (r.ok) {
        const j = await r.json();
        setVer(j.version);
        setBaseVer(j.version);
        retryConflictOnce = true;
        hideSyncBanner();
        if (!pushQueued) {
          setDirty(false, 0);
        }
        continue;
      }

      if (r.status === 401) {
        setDirty(true, unsyncedCount || 1);
        updateSyncPill('attention');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('bufin-auth-required', { detail: { resumePush: true } }));
        }
        break;
      }

      if (r.status === 422) {
        const j = await r.json().catch(() => ({}));
        setDirty(true, unsyncedCount || 1);
        showSyncBanner(j.error || 'Server validation error. Changes kept locally.', 'error');
        updateSyncPill('attention');
        break;
      }

      if (r.status === 409) {
        try {
          const getRes = await fetch('/api/state');
          if (getRes.ok) {
            const remote = await getRes.json();
            const remoteDb = remote.data || {};
            const localEntryIds = new Set((db.entries || []).map(e => e.id));
            const localDocIds = new Set((db.docs || []).map(d => d.id));

            const remoteHasNewEntries = (remoteDb.entries || []).some(e => !localEntryIds.has(e.id));
            const remoteHasNewDocs = (remoteDb.docs || []).some(d => !localDocIds.has(d.id));

            if (!remoteHasNewEntries && !remoteHasNewDocs && retryConflictOnce) {
              retryConflictOnce = false;
              setVer(remote.version);
              setBaseVer(remote.version);
              continue;
            } else {
              setDirty(true, unsyncedCount || 1);
              showConflictModal(remote);
              updateSyncPill('attention');
              break;
            }
          } else {
            setDirty(true, unsyncedCount || 1);
            updateSyncPill('attention');
            break;
          }
        } catch (e) {
          setDirty(true, unsyncedCount || 1);
          updateSyncPill('offline');
          break;
        }
      }

      // Any other non-2xx status
      setDirty(true, unsyncedCount || 1);
      updateSyncPill('attention');
      break;
    }
  } finally {
    pushInFlight = false;
    updateSyncPill();
  }
}

export async function checkRemoteVersion() {
  try {
    const res = await fetch('/api/state/version');
    if (res.status === 401) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bufin-auth-required'));
      }
      return;
    }
    if (!res.ok) return;
    const { version } = await res.json();
    if (typeof version === 'number' && version > ver) {
      if (!dirty) {
        const stateRes = await fetch('/api/state');
        if (stateRes.ok) {
          const sj = await stateRes.json();
          setVer(sj.version);
          setBaseVer(sj.version);
          if (sj.data) setDb(sj.data);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('bufin-render'));
          }
          toast('Ledger updated from server');
        }
      } else {
        const stateRes = await fetch('/api/state');
        if (stateRes.ok) {
          const sj = await stateRes.json();
          showConflictModal(sj);
        }
      }
    }
  } catch (e) {}
}

if (typeof window !== 'undefined') {
  // Visibility change listener: when tab becomes visible, poll /api/state/version
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        checkRemoteVersion();
      }
    });
  }

  // Online listener: check version and push dirty changes
  window.addEventListener('online', () => {
    updateSyncPill();
    if (dirty) {
      push();
    } else {
      checkRemoteVersion();
    }
  });

  window.addEventListener('offline', () => {
    updateSyncPill();
  });

  // 60-second periodic poll of GET /api/state/version
  const pollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible' && (!navigator || navigator.onLine)) {
      checkRemoteVersion();
    }
  }, 60000);
  if (pollTimer && typeof pollTimer.unref === 'function') {
    pollTimer.unref();
  }

  // Multi-tab storage sync
  window.addEventListener('storage', e => {
    if (e.key === K && e.newValue) {
      try {
        const newDb = JSON.parse(e.newValue);
        db = newDb;
        syncPartyClassifications(db);
        window.dispatchEvent(new CustomEvent('bufin-render'));
      } catch (err) {}
    }
    if (e.key === K + '_ver' && e.newValue) {
      const v = parseInt(e.newValue, 10);
      if (!isNaN(v)) ver = v;
    }
    if (e.key === K + '_baseVer' && e.newValue) {
      const bv = parseInt(e.newValue, 10);
      if (!isNaN(bv)) baseVer = bv;
    }
    if (e.key === K + '_dirty' && e.newValue !== null) {
      dirty = e.newValue === 'true';
      updateSyncPill();
    }
    if (e.key === K + '_unsyncedCount' && e.newValue) {
      const cnt = parseInt(e.newValue, 10);
      if (!isNaN(cnt)) unsyncedCount = cnt;
      updateSyncPill();
    }
  });
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

  // If this entry replaces an older entry, ensure the original entry was not in a locked period
  if (o.meta && o.meta.replaces && db.biz.lock) {
    const origReplaced = db.entries.find(e => e.ref === o.meta.replaces || e.id === o.meta.replaces);
    if (origReplaced && origReplaced.date <= db.biz.lock) {
      throw Error('Cannot edit or replace entry from locked period (dated ' + origReplaced.date + ')');
    }
  }

  // Robust Upsert: If an existing entry matches o.id or o.ref, update in-place without generating a new JV reference
  let existing = null;
  if (o.id) existing = db.entries.find(e => e.id === o.id);
  if (!existing && o.ref) existing = db.entries.find(e => e.ref === o.ref);

  if (existing) {
    if (db.biz.lock && existing.date <= db.biz.lock) {
      throw Error('Period is locked up to ' + db.biz.lock + ' (original entry dated ' + existing.date + ')');
    }
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

export function reverse(id, opts = {}) {
  const e = db.entries.find(x => x.id === id);
  if (!e || e.status !== 'posted') throw Error('Only posted entries can be reversed');

  // Period lock: Reversals must be dated on or after the lock period
  const revDate = e.src === 'open' ? e.date : (today() > e.date ? today() : e.date);
  if (db.biz.lock && revDate <= db.biz.lock) {
    throw Error('Period is locked up to ' + db.biz.lock + '. Reversals must be dated after the lock period.');
  }

  const r = post({
    date: revDate,
    narr: 'Reversal of ' + e.ref + ': ' + (e.narr || ''),
    src: 'rev',
    rev: e.id,
    lines: e.lines.map(l => ({ a: l.a, d: l.c, c: l.d, p: l.p }))
  });

  // Reversal of a locked-period entry must leave original entry unaltered (Requirement 4)
  if (!db.biz.lock || e.date > db.biz.lock) {
    e.status = 'reversed';
  }
  log('reverse ' + e.ref, r.ref);

  // Cascade Reversal to linked documents & payments (skip when editing doc in sales/bills)
  if (opts.cascadeDoc !== false) {
    // 1. If entry was the primary journal entry of an invoice or bill
    const linkedMainDoc = db.docs.find(d => d.je === e.id);
    if (linkedMainDoc) {
      linkedMainDoc.cancelled = true;
      if (linkedMainDoc.pays && linkedMainDoc.pays.length) {
        linkedMainDoc.pays.forEach(p => {
          if (!p.void && p.je) {
            const pEntry = db.entries.find(x => x.id === p.je);
            if (pEntry && pEntry.status === 'posted') {
              try { reverse(p.je, opts); } catch (err) {}
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
          doc.paid = paid(doc);
        }
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

export const paid = d => {
  if (!d) return 0;
  if (Array.isArray(d.pays) && d.pays.length) {
    return d.pays.reduce((s, p) => {
      if (p.void) return s;
      if (p.je) {
        const je = db.entries.find(e => e.id === p.je);
        if (je && je.status === 'reversed') return s;
      }
      const amt = p.amt !== undefined ? p.amt : (p.a !== undefined ? p.a : 0);
      return s + (Number(amt) || 0);
    }, 0);
  }
  return Number(d.paid) || 0;
};
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
    if (excludeJeId && e.id === excludeJeId) continue;
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
