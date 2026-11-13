import { $, $$, esc, fmt, P, toast, ic, today } from './modules/utils.js';
import {
  db, setDb, setVer, ver, baseVer, setBaseVer, dirty, setDirty,
  push, save, reverse, log, acc, an, SYS, TN, post,
  wipeStorage, resetDb, updateSyncPill, showSyncBanner, hideSyncBanner, showConflictModal
} from './modules/state.js';
import { modal, closeM, form, fld, sel, opts } from './modules/components.js';
import { enhanceMobile } from './modules/mobile.js';

// Namespace imports never fail when a name is missing, so they are used below to
// look up helpers (accOpts, lacr) that the loan actions need, without breaking the app.
import * as UT from './modules/utils.js';
import * as ST from './modules/state.js';
import * as COMP from './modules/components.js';
import * as ACT from './modules/actions.js';
import * as LOANS from './views/loans.js';

import { renderOverview } from './views/overview.js';
import { renderTxns, renderMoneyIn, renderMoneyOut, renderTransfers, renderExpenses, moneyState } from './views/money.js';
import { renderSales, bindSalesEvents, salesState } from './views/sales.js';
import { renderBills, bindBillsEvents, billsState } from './views/bills.js';
import { renderParties, partiesState } from './views/parties.js';
import { renderLoans, loansState } from './views/loans.js';
import { renderCoa, renderOpen, renderJv, renderGl, renderBook, accountingState, exportBookCsv, exportGlCsv } from './views/accounting.js';
import { renderTb, renderPl, renderBs, reportsState, exportTbCsv, exportPlChartPng, exportPlCsv, attachPlChartTooltips, exportBsCsv } from './views/reports.js';
import { renderSettings } from './views/settings.js';
import { showPinLogin, initPinKeypad, unlockApp } from './views/login.js';
import { showFirstRunWizard } from './views/wizard.js';
import { isFirstRunNeeded } from './modules/state.js';

import {
  showEnt, showDoc, payForm, partyPay, docForm2, partyForm, stmt2,
  deletePartyAction, mergePartyModal, closeFinancialYearAction,
  txnForm, newExpForm, newTransferForm, moneyInForm, moneyOutForm, showLoan2, loanForm2, repayForm2,
  editLoanModal, deleteLoanAction, exportLoanCsv,
  jvForm2, quickAddModal, showCsvModal, showBackupModal, showRestoreModal
} from './modules/actions.js';

// ---- Helpers used by the loan actions (fee / top-up / settle) ----
// Use the app's own implementation if one is exported anywhere, otherwise fall back safely.
const findHelper = name => {
  for (const m of [ACT, ST, COMP, UT, LOANS]) {
    if (m && typeof m[name] === 'function') return m[name];
  }
  return typeof window !== 'undefined' && typeof window[name] === 'function' ? window[name] : null;
};

// <option> list of accounts matching a filter, e.g. accOpts(a => a.cash)
const accOpts = f => {
  const fn = findHelper('accOpts');
  if (fn) return fn(f);
  return opts(db.accounts.filter(f).map(a => [a.code, `${a.name} (${a.code})`]));
};

// Accrued (unpaid) interest on a loan
const lacr = l => {
  const fn = findHelper('lacr');
  if (fn) return fn(l);
  toast('Accrued interest could not be calculated, please enter the interest manually');
  return 0;
};

export const NAV = [
  ['overview', 'Overview'],
  ['in', 'Money In', 'Money Manager'],
  ['out', 'Money Out'],
  ['xfer', 'Transfers'],
  ['txns', 'All Transactions'],
  ['sales', 'Sales Invoices', 'Sales and Purchases'],
  ['bills', 'Purchase Bills'],
  ['inventory', 'Inventory Stock'],
  ['parties', 'Parties'],
  ['loans', 'Loans', 'Loans'],
  ['coa', 'Chart of Accounts', 'Accounting'],
  ['open', 'Opening Balances'],
  ['jv', 'Journal Entries'],
  ['gl', 'General Ledger'],
  ['book', 'Cash and Bank Book'],
  ['tb', 'Trial Balance'],
  ['pl', 'Profit and Loss'],
  ['bs', 'Balance Sheet'],
  ['set', 'Settings', 'System']
];

export const VIEWS = {
  overview: renderOverview,
  in: renderMoneyIn,
  out: renderMoneyOut,
  exp: renderMoneyOut,
  xfer: renderTransfers,
  txns: renderTxns,
  sales: renderSales,
  bills: () => {
    if (billsState.tab === 'inventory') billsState.tab = 'rec';
    return renderBills();
  },
  inventory: () => {
    billsState.tab = 'inventory';
    return renderBills();
  },
  parties: renderParties,
  loans: renderLoans,
  coa: renderCoa,
  open: renderOpen,
  opening: renderOpen,
  jv: renderJv,
  gl: renderGl,
  book: renderBook,
  tb: renderTb,
  pl: renderPl,
  bs: renderBs,
  set: renderSettings,
  settings: renderSettings
};

let currentPage = 'overview';

export function getPage() {
  const hash = window.location.hash;
  const raw = hash.replace(/^#\/?/, '').split('?')[0];
  const root = raw.split('/')[0];
  if (root === 'settings') return 'set';
  if (root === 'exp') return 'out';
  if (root === 'bills' && hash.includes('tab=inventory')) {
    billsState.tab = 'inventory';
    window.location.hash = '#/inventory';
    return 'inventory';
  }
  if (root === 'bills') {
    if (billsState.tab === 'inventory') billsState.tab = 'rec';
    return 'bills';
  }
  if (root === 'inventory') {
    billsState.tab = 'inventory';
    return 'inventory';
  }
  return VIEWS[root] ? root : (VIEWS[raw] ? raw : 'overview');
}

export function navigate(page, params = {}) {
  const query = new URLSearchParams(params).toString();
  window.location.hash = query ? `#/${page}?${query}` : `#/${page}`;
}

export function drawNav() {
  let h = `<div class="nav-brand">
    <img src="/svg/app-icon.svg" class="nav-logo" alt="BUFIN">
    <div class="nav-brand-text">
      <h1>BUFIN</h1>
      <small>${esc(db.biz.name)}</small>
    </div>
    <button type="button" class="drawer-close-btn universal-close-btn" data-a="menu" aria-label="Close navigation" title="Close">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  </div>`;
  for (const n of NAV) {
    if (n[2]) h += '<h6>' + n[2] + '</h6>';
    h += `<a class="${currentPage === n[0] ? 'on' : ''}" href="#/${n[0]}">${ic(n[0])}${n[1]}</a>`;
  }
  h += '<div class="nav-logout"><a data-a="logout"><svg class="i" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Lock App</a></div>';
  $('#nav').innerHTML = h;

  const T = [
    ['overview', 'Overview', 'overview', '#/overview', ['overview']],
    ['sales', 'Sales', 'sales', '#/sales', ['sales', 'bills', 'inventory', 'parties']],
    ['quick', 'Add', 'add', '', []],
    ['coa', 'Accounting', 'coa', '#/coa', ['coa', 'open', 'opening', 'jv', 'gl', 'book', 'tb', 'pl', 'bs', 'loans']],
    ['menu', 'Menu', 'menu', '', ['set', 'settings']]
  ];
  $('#tab').innerHTML = T.map(t => {
    const isQuick = t[0] === 'quick';
    if (isQuick) {
      return `<button type="button" class="tab-item tab-plus-btn" data-a="quick" aria-label="Quick Actions" title="Quick Actions">
        <span class="tab-plus-circle">
          <svg class="tab-plus-svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </span>
      </button>`;
    }
    const isActive = t[4].includes(currentPage);
    const isMenu = t[0] === 'menu';
    return `<a class="tab-item ${isActive ? 'on' : ''}" data-a="${isMenu ? 'menu' : 'nav'}" ${isMenu ? '' : `href="${t[3]}"`} data-i="${t[0]}">
      <span class="tab-icon">${ic(t[2])}</span>
      <span class="tab-label">${t[1]}</span>
    </a>`;
  }).join('');
}

const ROUTE_LOADERS = {
  sales: () => import('./views/sales.js'),
  bills: () => import('./views/bills.js'),
  inventory: () => import('./views/bills.js'),
  in: () => import('./views/money.js'),
  out: () => import('./views/money.js'),
  exp: () => import('./views/money.js'),
  xfer: () => import('./views/money.js'),
  txns: () => import('./views/money.js'),
  parties: () => import('./views/parties.js'),
  loans: () => import('./views/loans.js'),
  coa: () => import('./views/accounting.js'),
  open: () => import('./views/accounting.js'),
  opening: () => import('./views/accounting.js'),
  jv: () => import('./views/accounting.js'),
  gl: () => import('./views/accounting.js'),
  book: () => import('./views/accounting.js'),
  tb: () => import('./views/reports.js'),
  pl: () => import('./views/reports.js'),
  bs: () => import('./views/reports.js'),
  set: () => import('./views/settings.js'),
  settings: () => import('./views/settings.js')
};

const loadedChunks = new Set(['overview']);
async function loadRouteChunk(page) {
  if (loadedChunks.has(page)) return;
  const loader = ROUTE_LOADERS[page];
  if (loader) {
    try {
      await loader();
      loadedChunks.add(page);
    } catch (e) {
      console.warn('Chunk load failed:', e);
    }
  }
}

// Background idle preloading of route chunks for instantaneous navigation
if (typeof window !== 'undefined') {
  const prefetchRemaining = () => {
    const list = ['sales', 'bills', 'txns', 'coa', 'parties', 'loans', 'tb', 'set'];
    list.forEach(r => {
      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(() => loadRouteChunk(r));
      } else {
        setTimeout(() => loadRouteChunk(r), 1200);
      }
    });
  };
  if (document.readyState === 'complete') prefetchRemaining();
  else window.addEventListener('load', prefetchRemaining, { once: true });
}

let prevRenderPage = null;

function showNewDataRefreshPill() {
  if (typeof document === 'undefined') return;
  let pill = $('#newDataRefreshPill');
  if (!pill) {
    pill = document.createElement('div');
    pill.id = 'newDataRefreshPill';
    pill.className = 'new-data-pill';
    pill.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:9999;background:var(--p,#2563eb);color:#fff;padding:10px 18px;border-radius:999px;font-size:13px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,0.25);display:flex;align-items:center;gap:10px;cursor:pointer;';
    pill.innerHTML = `<span>⚡ New data available – Refresh</span><button type="button" style="background:rgba(255,255,255,0.25);border:none;color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px;cursor:pointer;line-height:1;margin-left:4px;">✕</button>`;
    document.body.appendChild(pill);
    pill.onclick = e => {
      if (e.target.tagName === 'BUTTON') {
        pill.remove();
        return;
      }
      salesState.formDirty = false;
      billsState.formDirty = false;
      pill.remove();
      render();
    };
  }
}

export async function render() {
  const newPage = getPage();
  if (prevRenderPage && prevRenderPage !== newPage) {
    if (prevRenderPage === 'sales') {
      if (salesState.formDirty) {
        salesState.draft = {
          savedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          lines: salesState.lines,
          selectedPartyId: salesState.selectedPartyId,
          files: salesState.files,
          paymentReceived: salesState.paymentReceived
        };
      }
      salesState.tab = 'rec';
      salesState.editNo = null;
      salesState.formDirty = false;
    }
    if (prevRenderPage === 'bills') {
      if (billsState.formDirty) {
        billsState.draft = {
          savedAt: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          editId: billsState.editId,
          files: billsState.files
        };
      }
      billsState.tab = 'rec';
      billsState.editId = null;
      billsState.formDirty = false;
    }
    const oldPill = $('#newDataRefreshPill');
    if (oldPill) oldPill.remove();
  } else if (prevRenderPage === newPage) {
    const isSalesDirty = newPage === 'sales' && salesState.tab === 'new' && salesState.formDirty;
    const isBillsDirty = newPage === 'bills' && billsState.tab === 'new' && billsState.formDirty;
    if (isSalesDirty || isBillsDirty) {
      showNewDataRefreshPill();
      return;
    }
  }
  prevRenderPage = newPage;
  currentPage = newPage;
  drawNav();

  const vEl = $('#v');
  if (vEl) {
    if (currentPage !== 'overview' && !loadedChunks.has(currentPage) && ROUTE_LOADERS[currentPage]) {
      vEl.innerHTML = `
        <div class="wrap" style="padding:16px;animation:pageFadeSlide 0.2s cubic-bezier(0.16,1,0.3,1)">
          <div style="height:32px;width:180px;background:var(--mu);border-radius:6px;margin-bottom:16px;opacity:0.7"></div>
          <div class="grid-2" style="margin-bottom:16px">
            <div class="card" style="height:90px;background:var(--mu);opacity:0.6;border:none"></div>
            <div class="card" style="height:90px;background:var(--mu);opacity:0.6;border:none"></div>
          </div>
          <div class="card" style="height:260px;background:var(--mu);opacity:0.5;border:none"></div>
        </div>`;
      await loadRouteChunk(currentPage);
    }

    const viewFn = VIEWS[currentPage] || VIEWS.overview;
    try {
      vEl.innerHTML = viewFn();
      bindViewEvents();
      enhanceMobile(vEl);

      if (isFirstRunNeeded() && typeof document !== 'undefined') {
        const dlg = $('#dlg');
        if (!dlg || !dlg.open) {
          showFirstRunWizard(render);
        }
      }
    } catch (err) {
      console.error('Error rendering ' + currentPage, err);
      vEl.innerHTML = `
        <div class="wrap" style="padding:24px;border-left:4px solid var(--rd)">
          <h3 style="color:var(--rd);margin-top:0">Unable to load ${esc(currentPage)}</h3>
          <p>${esc(err.message || 'An unexpected error occurred.')}</p>
          <button class="p" onclick="(window.hardReloadBufin ? window.hardReloadBufin() : location.reload())">Reload BUFIN</button>
        </div>`;
      enhanceMobile(vEl);
    }
  }
}

function opCalc() {
  let D = 0, C = 0;
  document.querySelectorAll('[data-c]').forEach(i => {
    if (!i.value) return;
    try {
      const x = P(i.value);
      i.dataset.s === 'd' ? D += x : C += x;
    } catch (e) {}
  });

  const df = D - C;
  const totDrEl = $('#op_tot_dr');
  const totCrEl = $('#op_tot_cr');
  const diffEl = $('#op_diff_stat');

  if (totDrEl) totDrEl.textContent = fmt(D);
  if (totCrEl) totCrEl.textContent = fmt(C);
  if (diffEl) {
    if (!D && !C) {
      diffEl.innerHTML = `<span style="color:var(--t2);">Enter balances above to calculate</span>`;
    } else if (df === 0) {
      diffEl.innerHTML = `<span style="display:inline-flex;align-items:center;gap:4px;color:#15803d;background:#f0fdf4;border:1px solid #bbf7d0;padding:2px 8px;border-radius:99px;font-size:11.5px;font-weight:600;">✓ Fully Balanced (No Equity Adjustment)</span>`;
    } else {
      const eqSide = df > 0 ? 'Credit' : 'Debit';
      const absDiff = Math.abs(df);
      diffEl.innerHTML = `<span style="display:inline-flex;align-items:center;gap:5px;color:#1e40af;background:#eff6ff;border:1px solid #bfdbfe;padding:2px 8px;border-radius:99px;font-size:11.5px;font-weight:600;">⚡ Auto-Balancing: ${fmt(absDiff)} to Opening Balance Equity (${eqSide})</span>`;
    }
  }

  // Check and update unorthodox balance warnings
  db.accounts.filter(a => a.code !== '3200').forEach(a => {
    const isNormD = a.t === 'A' || a.t === 'X';
    const dInput = document.querySelector(`[data-c="${a.code}"][data-s="d"]`);
    const cInput = document.querySelector(`[data-c="${a.code}"][data-s="c"]`);
    const warnEl = document.getElementById(`unorthodox_${a.code}`);
    if (!warnEl) return;

    let hasUnorthodox = false;
    if (isNormD) {
      let cVal = 0;
      try { cVal = P(cInput?.value || '0'); } catch (e) {}
      if (cVal > 0) hasUnorthodox = true;
    } else {
      let dVal = 0;
      try { dVal = P(dInput?.value || '0'); } catch (e) {}
      if (dVal > 0) hasUnorthodox = true;
    }
    warnEl.style.display = hasUnorthodox ? 'block' : 'none';
  });
}

function showOpenConfirmModal() {
  const asOfDate = $('#od')?.value || today();
  const rows = [];
  let totalD = 0, totalC = 0;

  const partyRows = [];
  document.querySelectorAll('[data-party-acc]').forEach(i => {
    if (i.value && parseFloat(i.value) > 0) {
      const code = i.dataset.partyAcc;
      const partyId = i.dataset.partyId;
      const side = i.dataset.s;
      let val = 0;
      try { val = P(i.value); } catch (e) { return; }
      if (!val) return;
      partyRows.push({ a: code, d: side === 'd' ? val : 0, c: side === 'c' ? val : 0, p: partyId });
    }
  });

  const loanRows = [];
  document.querySelectorAll('[data-loan-acc]').forEach(i => {
    if (i.value && parseFloat(i.value) > 0) {
      const code = i.dataset.loanAcc;
      const loanId = i.dataset.loanId;
      const partyId = i.dataset.partyId;
      const side = i.dataset.s;
      let val = 0;
      try { val = P(i.value); } catch (e) { return; }
      if (!val) return;
      loanRows.push({ a: code, d: side === 'd' ? val : 0, c: side === 'c' ? val : 0, p: partyId, meta: { loan: loanId } });
    }
  });

  const generalRows = [];
  document.querySelectorAll('[data-c]').forEach(i => {
    if (i.value && parseFloat(i.value) > 0) {
      const code = i.dataset.c;
      const side = i.dataset.s;
      let val = 0;
      try { val = P(i.value); } catch (e) { return; }
      if (!val) return;

      let r = generalRows.find(x => x.a === code);
      if (!r) {
        r = { a: code, d: 0, c: 0 };
        generalRows.push(r);
      }
      r[side] = val;
    }
  });

  // Merge general rows and party/loan rows
  const handledAccounts = new Set(['1100', '2000', '2100', '1400']);

  // Handle 1100
  const arPartyRows = partyRows.filter(r => r.a === '1100');
  const gen1100 = generalRows.find(r => r.a === '1100');
  if (arPartyRows.length) {
    arPartyRows.forEach(r => rows.push(r));
    const sumPartyAR = arPartyRows.reduce((s, r) => s + r.d, 0);
    if (gen1100 && gen1100.d > sumPartyAR) {
      rows.push({ a: '1100', d: gen1100.d - sumPartyAR, c: 0 });
    }
  } else if (gen1100) {
    rows.push(gen1100);
  }

  // Handle 2000
  const apPartyRows = partyRows.filter(r => r.a === '2000');
  const gen2000 = generalRows.find(r => r.a === '2000');
  if (apPartyRows.length) {
    apPartyRows.forEach(r => rows.push(r));
    const sumPartyAP = apPartyRows.reduce((s, r) => s + r.c, 0);
    if (gen2000 && gen2000.c > sumPartyAP) {
      rows.push({ a: '2000', d: 0, c: gen2000.c - sumPartyAP });
    }
  } else if (gen2000) {
    rows.push(gen2000);
  }

  // Handle 2100 & 1400
  ['2100', '1400'].forEach(c => {
    const lRows = loanRows.filter(r => r.a === c);
    const genLoan = generalRows.find(r => r.a === c);
    if (lRows.length) {
      lRows.forEach(r => rows.push(r));
      const sumLoan = lRows.reduce((s, r) => s + (r.d || r.c), 0);
      if (genLoan && (genLoan.d || genLoan.c) > sumLoan) {
        rows.push({ a: c, d: genLoan.d ? genLoan.d - sumLoan : 0, c: genLoan.c ? genLoan.c - sumLoan : 0 });
      }
    } else if (genLoan) {
      rows.push(genLoan);
    }
  });

  // All other accounts
  generalRows.forEach(r => {
    if (!handledAccounts.has(r.a)) rows.push(r);
  });

  rows.forEach(r => {
    totalD += r.d;
    totalC += r.c;
  });

  if (!rows.length || (totalD === 0 && totalC === 0)) {
    toast('Please enter at least one opening balance');
    return;
  }

  const diff = totalD - totalC;
  const equityPaisa = Math.abs(diff);
  const finalTotal = Math.max(totalD, totalC);

  const previewRows = rows.map(r => {
    const acct = acc(r.a);
    const typeName = acct ? TN[acct.t] : '';
    const partyName = r.p ? pn(r.p) : '';
    return `
      <tr>
        <td><b>${esc(acct?.name || an(r.a))}</b> <small style="color:var(--t2);">(${r.a})</small>${partyName ? `<span class="pill" style="font-size:10px;margin-left:6px;background:#f1f5f9;">${esc(partyName)}</span>` : ''}</td>
        <td><span class="pill" style="font-size:11px;background:var(--mu);padding:2px 6px;border-radius:4px;">${typeName}</span></td>
        <td class="num" style="font-weight:${r.d ? '600' : 'normal'};color:${r.d ? '#0f172a' : 'var(--t2)'};">${r.d ? fmt(r.d) : '—'}</td>
        <td class="num" style="font-weight:${r.c ? '600' : 'normal'};color:${r.c ? '#0f172a' : 'var(--t2)'};">${r.c ? fmt(r.c) : '—'}</td>
      </tr>
    `;
  }).join('');

  const equityRow = diff !== 0 ? `
    <tr style="background:#eff6ff;border-top:1px dashed #bfdbfe;border-bottom:1px dashed #bfdbfe;">
      <td>
        <b>Opening Balance Equity</b> <small style="color:var(--t2);">(3200)</small>
        <span style="font-size:10px;font-weight:700;color:#1e40af;background:#dbeafe;padding:2px 6px;border-radius:4px;margin-left:6px;text-transform:uppercase;">Auto-Balanced</span>
      </td>
      <td><span class="pill" style="font-size:11px;background:#dbeafe;color:#1e40af;padding:2px 6px;border-radius:4px;">Equity</span></td>
      <td class="num" style="font-weight:700;color:#1e40af;">${diff < 0 ? fmt(equityPaisa) : '—'}</td>
      <td class="num" style="font-weight:700;color:#1e40af;">${diff > 0 ? fmt(equityPaisa) : '—'}</td>
    </tr>
  ` : '';

  const activeOpen = db.entries.find(e => e.src === 'open' && e.status === 'posted');
  const actionTitle = activeOpen ? 'Update & Sync Opening Balances' : 'Confirm & Post Opening Balances';

  modal(`
    <div style="min-width:320px;max-width:580px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
        <h3 style="margin:0;font-size:17px;font-weight:700;color:var(--tx);">Confirmation: Post Opening Balances</h3>
        <span class="pill" style="font-size:11.5px;padding:3px 8px;border-radius:99px;background:#ecfdf5;color:#047857;font-weight:600;">As of ${asOfDate}</span>
      </div>

      <p style="font-size:13px;color:var(--t2);margin-top:0;margin-bottom:16px;">
        Please review the account balances below. Any difference between total debits and credits is automatically allocated to <b>Opening Balance Equity</b> to guarantee double-entry balance.
      </p>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px;">
        <div style="background:#f8fafc;border:1px solid var(--bd);border-radius:8px;padding:10px 12px;">
          <div style="font-size:11px;color:var(--t2);text-transform:uppercase;font-weight:600;">Total Debits</div>
          <div style="font-size:16px;font-weight:700;color:#047857;margin-top:2px;">${fmt(totalD)}</div>
        </div>
        <div style="background:#f8fafc;border:1px solid var(--bd);border-radius:8px;padding:10px 12px;">
          <div style="font-size:11px;color:var(--t2);text-transform:uppercase;font-weight:600;">Total Credits</div>
          <div style="font-size:16px;font-weight:700;color:#1e40af;margin-top:2px;">${fmt(totalC)}</div>
        </div>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 12px;">
          <div style="font-size:11px;color:#1e40af;text-transform:uppercase;font-weight:600;">Auto-Balanced Equity</div>
          <div style="font-size:15px;font-weight:700;color:#1d4ed8;margin-top:2px;">
            ${diff ? fmt(equityPaisa) + (diff > 0 ? ' (Cr)' : ' (Dr)') : '₹0.00 (Balanced)'}
          </div>
        </div>
      </div>

      <div class="wrap" style="max-height:240px;overflow-y:auto;border:1px solid var(--bd);border-radius:8px;margin-bottom:16px;">
        <table style="font-size:13px;margin:0;">
          <thead>
            <tr>
              <th>Account</th>
              <th>Type</th>
              <th class="num">Debit (Dr)</th>
              <th class="num">Credit (Cr)</th>
            </tr>
          </thead>
          <tbody>
            ${previewRows}
            ${equityRow}
            <tr class="tot" style="font-weight:700;background:var(--mu);">
              <td colspan="2">Final Balanced Ledger Total</td>
              <td class="num">${fmt(finalTotal)}</td>
              <td class="num">${fmt(finalTotal)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style="background:#f1f5f9;border:1px solid var(--bd);border-radius:8px;padding:10px 14px;font-size:12px;color:var(--t2);margin-bottom:18px;">
        🔒 Once posted, opening balances will be safely locked to protect against accidental edits. You can unlock or reverse them anytime from this page.
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;">
        <button type="button" class="btn alt" id="btn_modal_cancel">Cancel / Back to Edit</button>
        <button type="button" class="btn p" id="btn_modal_confirm">${actionTitle}</button>
      </div>
    </div>
  `);

  $('#btn_modal_cancel').onclick = closeM;
  $('#btn_modal_confirm').onclick = () => {
    try {
      postOpening(asOfDate, rows);
      accountingState.od = asOfDate;
      accountingState.openUnlocked = false;
      save();
      closeM();
      toast(activeOpen ? 'Opening balances and date updated' : 'Opening balances posted and locked successfully');
      render();
    } catch (e) {
      toast(e.message);
    }
  };
}

function showOpenReverseModal() {
  const activeOpen = db.entries.find(e => e.src === 'open' && e.status === 'posted');
  if (!activeOpen) return toast('No active opening entry to reverse');

  modal(`
    <div style="min-width:320px;max-width:480px;">
      <h3 style="margin:0 0 10px 0;font-size:17px;color:#991b1b;font-weight:700;">Reverse Opening Balances?</h3>
      <p style="font-size:13.5px;color:var(--tx);margin:0 0 14px 0;line-height:1.5;">
        Are you sure you want to reverse the active opening balances journal entry <b>${activeOpen.ref}</b> (As of ${activeOpen.date})?
      </p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;font-size:12.5px;color:#991b1b;margin-bottom:18px;">
        ⚠️ A formal reversal journal entry will be posted to the ledger, and opening balances will be reset so you can enter fresh figures.
      </div>
      <div style="display:flex;justify-content:flex-end;gap:10px;">
        <button type="button" class="btn alt" id="btn_cancel_rev">Cancel</button>
        <button type="button" class="btn d" id="btn_confirm_rev">Yes, Reverse Opening Balances</button>
      </div>
    </div>
  `);

  $('#btn_cancel_rev').onclick = closeM;
  $('#btn_confirm_rev').onclick = () => {
    try {
      reverse(activeOpen.id);
      save();
      accountingState.openUnlocked = true;
      closeM();
      toast('Opening balances reversed');
      render();
    } catch (e) {
      toast(e.message);
    }
  };
}

function postOpening(date, rows) {
  if (!rows.length) throw Error('Enter at least one balance');
  let D = 0, C = 0;
  rows.forEach(r => {
    if (r.d && r.c) throw Error(an(r.a) + ': use either a debit or a credit');
    D += r.d;
    C += r.c;
  });
  const L = rows.slice();
  if (D !== C) {
    if (!acc('3200')) db.accounts.push({ code: '3200', name: 'Opening Balance Equity', t: 'E' });
    L.push(D > C ? { a: '3200', d: 0, c: D - C } : { a: '3200', d: C - D, c: 0 });
  }

  // Create or update Opening Balance pseudo-documents for each party with opening AR or AP
  if (!db.docs) db.docs = [];
  for (const l of L) {
    if (l.a === '1100' && l.p && l.d > 0) {
      const partyId = l.p;
      const partyObj = (db.parties || []).find(p => p.id === partyId);
      const partyName = partyObj ? partyObj.name : 'Customer';
      let doc = db.docs.find(d => d.opening && d.type === 'sale' && d.party === partyId);
      if (!doc) {
        doc = {
          id: 'open_ar_' + partyId,
          no: 'OPEN-AR-' + (partyObj?.name || partyId).slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, ''),
          type: 'sale',
          opening: true,
          date: date,
          party: partyId,
          c: { n: partyName, p: partyObj?.phone || '', st: partyObj?.state || '', g: partyObj?.gstin || '' },
          total: l.d,
          paid: 0,
          pays: [],
          items: [{ desc: 'Opening Balance Receivable', a: l.d, q: 1, u: 'nos', r: l.d }],
          status: 'open'
        };
        db.docs.push(doc);
      } else {
        doc.total = l.d;
        doc.date = date;
      }
    } else if (l.a === '2000' && l.p && l.c > 0) {
      const partyId = l.p;
      const partyObj = (db.parties || []).find(p => p.id === partyId);
      const partyName = partyObj ? partyObj.name : 'Supplier';
      let doc = db.docs.find(d => d.opening && d.type === 'bill' && d.party === partyId);
      if (!doc) {
        doc = {
          id: 'open_ap_' + partyId,
          no: 'OPEN-AP-' + (partyObj?.name || partyId).slice(0, 6).toUpperCase().replace(/[^A-Z0-9]/g, ''),
          type: 'bill',
          opening: true,
          date: date,
          party: partyId,
          sup: partyName,
          total: l.c,
          paid: 0,
          pays: [],
          items: [{ desc: 'Opening Balance Payable', a: l.c, q: 1, u: 'nos', r: l.c }],
          status: 'open'
        };
        db.docs.push(doc);
      } else {
        doc.total = l.c;
        doc.date = date;
      }
    }
  }

  const existingOpen = db.entries.find(e => e.src === 'open' && e.status === 'posted');
  if (existingOpen) {
    existingOpen.date = date;
    existingOpen.lines = L;
    existingOpen.at = date + 'T00:00:00.000Z';
    log('update ' + existingOpen.ref, existingOpen.src);
    return existingOpen;
  }

  const newEntry = post({ date, narr: 'Opening balances', src: 'open', lines: L });
  newEntry.at = date + 'T00:00:00.000Z';
  return newEntry;
}

function openDateCardPicker(el) {
  if (!el) return;
  if (typeof el.showPicker === 'function') {
    try {
      el.showPicker();
      return;
    } catch (err) {}
  }
  el.focus();
}

function bindViewEvents() {
  if (currentPage === 'sales') {
    bindSalesEvents();
  }
  if (currentPage === 'bills' || currentPage === 'inventory') {
    bindBillsEvents();
  }

  if (currentPage === 'loans') {
    const lq = $('[data-k="lq"]');
    if (lq) {
      lq.oninput = () => {
        loansState.q = lq.value;
        clearTimeout(loansState.h);
        loansState.h = setTimeout(() => {
          render();
          const el = $('[data-k="lq"]');
          if (el) {
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
          }
        }, 300);
      };
    }
  }

  if (currentPage === 'txns' || currentPage === 'in' || currentPage === 'out' || currentPage === 'xfer') {
    const qInput = $('[data-k="q"]');
    if (qInput) {
      qInput.oninput = () => {
        moneyState.q = qInput.value;
        clearTimeout(moneyState.h);
        moneyState.h = setTimeout(() => {
          render();
          const el = $('[data-k="q"]');
          if (el) {
            el.focus();
            el.setSelectionRange(el.value.length, el.value.length);
          }
        }, 300);
      };
    }
  }

  if (currentPage === 'exp') {
    $('#expMonth')?.addEventListener('change', e => {
      moneyState.xm = e.target.value;
      render();
    });
    $('#expCat')?.addEventListener('change', e => {
      moneyState.xc = e.target.value;
      render();
    });
  }

  if (currentPage === 'parties') {
    const pq = $('[data-k="pq"]');
    if (pq) {
      pq.oninput = () => {
        partiesState.pq = pq.value;
        clearTimeout(partiesState.h);
        partiesState.h = setTimeout(() => {
          render();
          const el = $('[data-k="pq"]');
          if (el) {
            el.focus();
            el.selectionStart = el.selectionEnd = el.value.length;
          }
        }, 250);
      };
    }
  }

  if (currentPage === 'open' || currentPage === 'opening') {
    const odInput = $('#od');
    if (odInput) {
      const onDateChange = e => {
        accountingState.od = e.target.value;
        const readableEl = $('#od_readable');
        if (readableEl && e.target.value) {
          try {
            const [y, m, d] = e.target.value.split('-');
            const dtObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
            readableEl.textContent = dtObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
          } catch (err) {}
        }
      };
      odInput.addEventListener('input', onDateChange);
      odInput.addEventListener('change', onDateChange);
    }
    $$('[data-c]').forEach(i => {
      i.oninput = () => {
        const code = i.dataset.c;
        const side = i.dataset.s;
        const otherSide = side === 'd' ? 'c' : 'd';
        const otherInput = document.querySelector(`[data-c="${code}"][data-s="${otherSide}"]`);
        if (i.value && otherInput && otherInput.value) {
          otherInput.value = '';
        }
        opCalc();
      };
    });
    opCalc();
  }

  if (currentPage === 'jv') {
    const jq = $('[data-k="jq"]');
    if (jq) {
      jq.oninput = () => {
        accountingState.jq = jq.value;
        clearTimeout(accountingState.h);
        accountingState.h = setTimeout(render, 300);
      };
    }
  }

  if (currentPage === 'gl') {
    const accSel = $('#glAccSelect');
    if (accSel) {
      const handleAccChange = e => {
        if (e.target.value && e.target.value !== accountingState.gl.acc) {
          accountingState.gl.acc = e.target.value;
          render();
        }
      };
      accSel.addEventListener('change', handleAccChange);
      accSel.addEventListener('input', handleAccChange);
    }

    const fromEl = $('#glFrom');
    if (fromEl) {
      const handleFrom = e => {
        if (e.target.value !== accountingState.gl.f) {
          accountingState.gl.f = e.target.value;
          render();
        }
      };
      fromEl.addEventListener('change', handleFrom);
      fromEl.addEventListener('input', handleFrom);
    }

    const toEl = $('#glTo');
    if (toEl) {
      const handleTo = e => {
        if (e.target.value !== accountingState.gl.t) {
          accountingState.gl.t = e.target.value;
          render();
        }
      };
      toEl.addEventListener('change', handleTo);
      toEl.addEventListener('input', handleTo);
    }

    const handleGlFromPicker = () => openDateCardPicker($('#glFrom'));
    $('#glFromBox')?.addEventListener('click', handleGlFromPicker);
    $('#glFrom')?.addEventListener('click', handleGlFromPicker);
    const handleGlToPicker = () => openDateCardPicker($('#glTo'));
    $('#glToBox')?.addEventListener('click', handleGlToPicker);
    $('#glTo')?.addEventListener('click', handleGlToPicker);

    const glq = $('[data-k="glq"]');
    if (glq) {
      glq.oninput = () => {
        accountingState.gl.q = glq.value;
        clearTimeout(accountingState.h);
        accountingState.h = setTimeout(() => {
          render();
          const el = $('[data-k="glq"]');
          if (el) {
            el.focus();
            el.selectionStart = el.selectionEnd = el.value.length;
          }
        }, 300);
      };
    }
  }

  if (currentPage === 'book') {
    const bf = $('#bookFrom');
    const bt = $('#bookTo');
    const onDateChange = e => {
      if (e.target === bf) accountingState.cb.f = bf.value;
      if (e.target === bt) accountingState.cb.t = bt.value;
      render();
    };
    bf?.addEventListener('change', onDateChange);
    bf?.addEventListener('input', onDateChange);
    bt?.addEventListener('change', onDateChange);
    bt?.addEventListener('input', onDateChange);

    const handleCbFromPicker = () => openDateCardPicker($('#bookFrom'));
    $('#cbFromBox')?.addEventListener('click', handleCbFromPicker);
    $('#bookFrom')?.addEventListener('click', handleCbFromPicker);
    const handleCbToPicker = () => openDateCardPicker($('#bookTo'));
    $('#cbToBox')?.addEventListener('click', handleCbToPicker);
    $('#bookTo')?.addEventListener('click', handleCbToPicker);

    const bkq = $('[data-k="bkq"]');
    if (bkq) {
      bkq.oninput = () => {
        accountingState.cb.q = bkq.value;
        clearTimeout(accountingState.h);
        accountingState.h = setTimeout(() => {
          render();
          const el = $('[data-k="bkq"]');
          if (el) {
            el.focus();
            el.selectionStart = el.selectionEnd = el.value.length;
          }
        }, 300);
      };
    }
  }

  if (currentPage === 'tb') {
    const tbDate = $('#tbDate');
    if (tbDate) {
      const updateTbDate = e => {
        reportsState.tb.t = e.target.value;
        render();
      };
      tbDate.addEventListener('change', updateTbDate);
      tbDate.addEventListener('input', updateTbDate);
    }
    const handleTbPicker = () => openDateCardPicker($('#tbDate'));
    $('#tbDateBox')?.addEventListener('click', handleTbPicker);
    $('#tbDate')?.addEventListener('click', handleTbPicker);
    const tbq = $('[data-k="tbq"]');
    if (tbq) {
      tbq.oninput = () => {
        reportsState.tb.q = tbq.value;
        clearTimeout(reportsState.h);
        reportsState.h = setTimeout(() => {
          render();
          const el = $('[data-k="tbq"]');
          if (el) {
            el.focus();
            el.selectionStart = el.selectionEnd = el.value.length;
          }
        }, 250);
      };
    }
  }

  if (currentPage === 'pl') {
    const plFrom = $('#plFrom');
    const plTo = $('#plTo');
    if (plFrom) {
      const updatePlFrom = e => {
        reportsState.pl.f = e.target.value;
        render();
      };
      plFrom.addEventListener('change', updatePlFrom);
      plFrom.addEventListener('input', updatePlFrom);
    }
    if (plTo) {
      const updatePlTo = e => {
        reportsState.pl.t = e.target.value;
        render();
      };
      plTo.addEventListener('change', updatePlTo);
      plTo.addEventListener('input', updatePlTo);
    }
    const handlePlFromPicker = () => openDateCardPicker($('#plFrom'));
    $('#plFromBox')?.addEventListener('click', handlePlFromPicker);
    $('#plFrom')?.addEventListener('click', handlePlFromPicker);
    const handlePlToPicker = () => openDateCardPicker($('#plTo'));
    $('#plToBox')?.addEventListener('click', handlePlToPicker);
    $('#plTo')?.addEventListener('click', handlePlToPicker);
    attachPlChartTooltips();
  }

  if (currentPage === 'bs') {
    const bsDate = $('#bsDate');
    if (bsDate) {
      const updateBsDate = e => {
        reportsState.bs.t = e.target.value;
        render();
      };
      bsDate.addEventListener('change', updateBsDate);
      bsDate.addEventListener('input', updateBsDate);
    }
    const handleBsPicker = () => openDateCardPicker($('#bsDate'));
    $('#bsDateBox')?.addEventListener('click', handleBsPicker);
    $('#bsDate')?.addEventListener('click', handleBsPicker);
  }

  if (currentPage === 'set') {
    $('#bf')?.addEventListener('submit', e => {
      e.preventDefault();
      const cfForm = $('#cf');
      if (cfForm) {
        const cfData = Object.fromEntries(new FormData(cfForm));
        if (cfData.cloudName) db.biz.cloudinary_name = cfData.cloudName.trim();
        if (cfData.apiKey) db.biz.cloudinary_key = cfData.apiKey.trim();
        if (cfData.apiSecret) db.biz.cloudinary_secret = cfData.apiSecret.trim();
      }
      Object.assign(db.biz, Object.fromEntries(new FormData(e.target)));
      log('settings', 'updated');
      save();
      render();
      toast('Settings saved');
    });

    $('#cf')?.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const statEl = $('#c_stat');
      if (statEl) statEl.textContent = 'Saving credentials...';

      // Always persist to client-side database immediately
      if (fd.cloudName) db.biz.cloudinary_name = fd.cloudName.trim();
      if (fd.apiKey) db.biz.cloudinary_key = fd.apiKey.trim();
      if (fd.apiSecret) db.biz.cloudinary_secret = fd.apiSecret.trim();
      save();

      if (statEl) statEl.innerHTML = '<span style="color:#16a34a">✓ Saved in local business settings</span>';
      toast('Cloudinary account name saved');
    });

    $('#btnTestCloudinary')?.addEventListener('click', async () => {
      const resEl = $('#c_test_result');
      if (resEl) resEl.innerHTML = '<span style="color:#2563eb;">Checking Cloudinary server configuration...</span>';
      try {
        const res = await fetch('/api/cloudinary/config');
        if (res.ok) {
          const data = await res.json();
          if (data.configured) {
            if (resEl) resEl.innerHTML = `<span style="color:#16a34a;">✓ Connected to Cloudinary (Account: ${esc(data.cloudName)}) — Backend storage active.</span>`;
            toast('Cloudinary connection verified');
          } else {
            if (resEl) resEl.innerHTML = '<span style="color:#b45309;">⚠️ Cloudinary is not configured in backend environment variables.</span>';
          }
        } else {
          if (resEl) resEl.innerHTML = '<span style="color:#dc2626;">✕ Cloudinary service check returned status ' + esc(res.status) + '</span>';
        }
      } catch (err) {
        if (resEl) resEl.innerHTML = '<span style="color:#dc2626;">✕ Could not connect to backend server: ' + esc(err.message) + '</span>';
      }
    });

    $('#changePasswordForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const cur = $('#curPwInput')?.value || '';
      const newP = $('#newPwInput')?.value || '';
      const confP = $('#confPwInput')?.value || '';
      const statEl = $('#pwChangeStat');

      if (!cur || !newP) {
        if (statEl) statEl.innerHTML = '<span style="color:#dc2626">Both current and new password are required</span>';
        return;
      }
      if (newP !== confP) {
        if (statEl) statEl.innerHTML = '<span style="color:#dc2626">New password and confirmation do not match</span>';
        return;
      }
      if (newP.length < 4) {
        if (statEl) statEl.innerHTML = '<span style="color:#dc2626">New password must be at least 4 characters</span>';
        return;
      }

      if (statEl) statEl.innerHTML = '<span style="color:#64748b">Updating password...</span>';

      try {
        const res = await fetch('/api/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ currentPassword: cur, newPassword: newP })
        });
        const data = await res.json();
        if (res.ok) {
          if (statEl) statEl.innerHTML = '<span style="color:#16a34a">✓ Password updated successfully</span>';
          toast('Password updated successfully');
          if (/^\d{4}$/.test(newP)) {
            try {
              const { hashPin } = await import('./views/login.js');
              if (typeof hashPin === 'function') {
                const h = await hashPin(newP);
                if (h) localStorage.setItem('bufin_pin_hash', h);
              }
            } catch (err) {}
          }
          if ($('#curPwInput')) $('#curPwInput').value = '';
          if ($('#newPwInput')) $('#newPwInput').value = '';
          if ($('#confPwInput')) $('#confPwInput').value = '';
        } else {
          if (statEl) statEl.innerHTML = `<span style="color:#dc2626">⚠️ ${esc(data.error || 'Failed to update password')}</span>`;
        }
      } catch (err) {
        if (statEl) statEl.innerHTML = '<span style="color:#dc2626">⚠️ Server connection error</span>';
      }
    });

    const toggleBtn = $('#toggleApiSecret');
    const secretInput = $('#apiSecretInput');
    const eyeOpen = $('#eyeIconOpen');
    const eyeClosed = $('#eyeIconClosed');
    if (toggleBtn && secretInput) {
      toggleBtn.onclick = e => {
        e.preventDefault();
        e.stopPropagation();
        const isPass = secretInput.type === 'password';
        secretInput.type = isPass ? 'text' : 'password';
        if (eyeOpen && eyeClosed) {
          eyeOpen.style.display = isPass ? 'none' : 'block';
          eyeClosed.style.display = isPass ? 'block' : 'none';
        }
      };
    }

    async function loadAuditLog() {
      const tbody = $('#auditLogTbody');
      if (!tbody) return;
      try {
        const res = await fetch('/api/audit?limit=50');
        if (res.ok) {
          const records = await res.json();
          if (Array.isArray(records) && records.length) {
            tbody.innerHTML = records.map(r => {
              const at = r.at ? r.at.slice(0, 19).replace('T', ' ') : '-';
              const actor = r.actor || 'system';
              const action = r.action || '-';
              const entity = r.entity ? `${r.entity}${r.entity_id ? ' #' + r.entity_id : ''}` : '-';
              let detail = '';
              if (r.after) {
                try { detail = typeof r.after === 'string' ? r.after : JSON.stringify(r.after); } catch (_) { detail = String(r.after); }
              } else if (r.before) {
                try { detail = typeof r.before === 'string' ? r.before : JSON.stringify(r.before); } catch (_) { detail = String(r.before); }
              }
              if (detail.length > 60) detail = detail.slice(0, 57) + '...';
              const ip = r.ip || '-';
              return `<tr>
                <td style="white-space:nowrap;">${esc(at)}</td>
                <td><span class="pill sm">${esc(actor)}</span></td>
                <td><b>${esc(action)}</b></td>
                <td>${esc(entity)}</td>
                <td style="color:var(--t2);font-family:monospace;font-size:11.5px;">${esc(detail)}</td>
                <td style="white-space:nowrap;color:var(--t2);">${esc(ip)}</td>
              </tr>`;
            }).join('');
            return;
          }
        }
      } catch (_) {}
      if (db.audit && db.audit.length) {
        tbody.innerHTML = db.audit.slice(-25).reverse().map(a => `
          <tr>
            <td style="white-space:nowrap;">${esc(a.at ? a.at.slice(0, 19).replace('T', ' ') : '-')}</td>
            <td><span class="pill sm">client</span></td>
            <td><b>${esc(a.a || '-')}</b></td>
            <td>-</td>
            <td style="color:var(--t2);">${esc(a.d || '')}</td>
            <td>localhost</td>
          </tr>
        `).join('');
      } else {
        tbody.innerHTML = `<tr><td colspan="6" class="empty">No audit activity recorded yet.</td></tr>`;
      }
    }

    $('#btnRefreshAuditLog')?.addEventListener('click', loadAuditLog);
    loadAuditLog();
  }
}

// Global action dispatcher
const ACTIONS = {
  quick: quickAddModal,
  nav: i => {
    navigate(i);
    $('#nav').classList.remove('open');
  },
  menu: () => $('#nav').classList.toggle('open'),
  ent: showEnt,
  doc: showDoc,
  pay: payForm,
  loan: i => {
    loansState.activeLoanId = i;
    window.location.hash = '#/loans/' + i;
    render();
  },
  viewloan: i => {
    loansState.activeLoanId = i;
    window.location.hash = '#/loans/' + i;
    render();
  },
  backloans: () => {
    loansState.activeLoanId = null;
    window.location.hash = '#/loans';
    render();
  },
  editloan: editLoanModal,
  delloan: deleteLoanAction,
  loancsv: exportLoanCsv,
  repay: repayForm2,
  'show-unallocated': i => {
    const acct = i || '1100';
    const unallocEntries = (db.entries || []).filter(e =>
      (e.lines || []).some(l => l.a === acct && !l.p)
    );
    const rows = unallocEntries.map(e => {
      const line = (e.lines || []).find(l => l.a === acct && !l.p);
      const amt = line ? (line.d || line.c) : 0;
      const type = line && line.d ? 'Debit' : 'Credit';
      return `<tr class="k" data-a="ent" data-i="${e.id}">
        <td>${esc(e.date)}</td>
        <td>${esc(e.ref)}</td>
        <td>${esc(e.narr || '')}</td>
        <td>${type}</td>
        <td class="num">${fmt(amt)}</td>
      </tr>`;
    }).join('');

    modal(`
      <div style="min-width:320px;max-width:600px;">
        <h3 style="margin-top:0;">Unallocated Entries on ${an(acct)} (${acct})</h3>
        <p style="font-size:13px;color:var(--t2);">
          These entries affect account ${acct} but lack a specific party tag (<code>line.p</code>), causing a discrepancy between the general ledger and party sub-ledgers.
        </p>
        <div class="wrap" style="max-height:360px;overflow-y:auto;">
          <table>
            <thead><tr><th>Date</th><th>Ref</th><th>Narration</th><th>Side</th><th class="num">Amount</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5" class="empty">No unallocated entries found.</td></tr>'}</tbody>
          </table>
        </div>
        <div style="margin-top:16px;text-align:right;">
          <button type="button" class="btn" id="closeUnallocBtn">Close</button>
        </div>
      </div>
    `);
    const btn = $('#closeUnallocBtn');
    if (btn) btn.onclick = closeM;
  },
  gl: i => {
    accountingState.gl.acc = i;
    navigate('gl');
  },
  glpreset: i => {
    const pad = n => String(n).padStart(2, '0');
    const now = new Date();
    if (i === 'today') {
      accountingState.gl.f = today();
      accountingState.gl.t = today();
    } else if (i === 'all') {
      accountingState.gl.f = '';
      accountingState.gl.t = '';
    } else if (i === 'month') {
      accountingState.gl.f = `${today().slice(0, 7)}-01`;
      accountingState.gl.t = today();
    } else if (i === 'lastmonth') {
      const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      accountingState.gl.f = `${prevMonthDate.getFullYear()}-${pad(prevMonthDate.getMonth() + 1)}-01`;
      accountingState.gl.t = `${lastDayPrevMonth.getFullYear()}-${pad(lastDayPrevMonth.getMonth() + 1)}-${pad(lastDayPrevMonth.getDate())}`;
    } else if (i === 'fy') {
      const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      accountingState.gl.f = `${fyYear}-04-01`;
      accountingState.gl.t = `${fyYear + 1}-03-31`;
    }
    render();
  },
  glcsv: exportGlCsv,
  tbpreset: i => {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    if (i === 'today') {
      reportsState.tb.t = today();
    } else if (i === 'monthend') {
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      reportsState.tb.t = `${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}`;
    } else if (i === 'fyend') {
      const fyYear = now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear();
      reportsState.tb.t = `${fyYear}-03-31`;
    }
    render();
  },
  tbtoggle: i => {
    reportsState.tb.all = (i === 'all');
    render();
  },
  tbcsv: exportTbCsv,
  exportplchart: exportPlChartPng,
  plcsv: exportPlCsv,
  pltoggle: i => {
    reportsState.pl.view = i;
    render();
  },
  plpreset: i => {
    const pad = n => String(n).padStart(2, '0');
    const now = new Date();
    if (i === 'today') {
      reportsState.pl.f = today();
      reportsState.pl.t = today();
    } else if (i === 'month') {
      reportsState.pl.f = `${today().slice(0, 7)}-01`;
      reportsState.pl.t = today();
    } else if (i === 'lastmonth') {
      const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      reportsState.pl.f = `${prevMonthDate.getFullYear()}-${pad(prevMonthDate.getMonth() + 1)}-01`;
      reportsState.pl.t = `${lastDayPrevMonth.getFullYear()}-${pad(lastDayPrevMonth.getMonth() + 1)}-${pad(lastDayPrevMonth.getDate())}`;
    } else if (i === 'fy') {
      const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      reportsState.pl.f = `${fyYear}-04-01`;
      reportsState.pl.t = today();
    } else if (i === 'all') {
      reportsState.pl.f = '';
      reportsState.pl.t = today();
    }
    render();
  },
  bscsv: exportBsCsv,
  bspreset: i => {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    if (i === 'today') {
      reportsState.bs.t = today();
    } else if (i === 'monthend') {
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      reportsState.bs.t = `${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}`;
    } else if (i === 'fyend') {
      const fyYear = now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear();
      reportsState.bs.t = `${fyYear}-03-31`;
    }
    render();
  },
  bstoggle: i => {
    reportsState.bs.mode = (i === 'standard' ? 'standard' : 'net');
    render();
  },
  bk: i => {
    accountingState.cb.c = i;
    render();
  },
  bkpreset: i => {
    const pad = n => String(n).padStart(2, '0');
    const now = new Date();
    if (i === 'today') {
      accountingState.cb.f = today();
      accountingState.cb.t = today();
    } else if (i === 'all') {
      accountingState.cb.f = '';
      accountingState.cb.t = '';
    } else if (i === 'month') {
      accountingState.cb.f = `${today().slice(0, 7)}-01`;
      accountingState.cb.t = today();
    } else if (i === 'lastmonth') {
      const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      accountingState.cb.f = `${prevMonthDate.getFullYear()}-${pad(prevMonthDate.getMonth() + 1)}-01`;
      accountingState.cb.t = `${lastDayPrevMonth.getFullYear()}-${pad(lastDayPrevMonth.getMonth() + 1)}-${pad(lastDayPrevMonth.getDate())}`;
    } else if (i === 'fy') {
      const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      accountingState.cb.f = `${fyYear}-04-01`;
      accountingState.cb.t = `${fyYear + 1}-03-31`;
    }
    render();
  },
  bkcsv: exportBookCsv,
  qago: target => {
    closeM();
    if (target === 'sales' || target === 'sale') {
      salesState.tab = 'new';
      salesState.editNo = null;
      if (window.location.hash !== '#/sales') navigate('sales');
      else render();
    } else if (target === 'bills' || target === 'bill') {
      billsState.tab = 'new';
      billsState.editId = null;
      if (window.location.hash !== '#/bills') navigate('bills');
      else render();
    } else if (target === 'in') {
      if (window.location.hash !== '#/in') navigate('in');
      else render();
    } else if (target === 'out') {
      if (window.location.hash !== '#/out') navigate('out');
      else render();
    } else if (target === 'xfer') {
      if (window.location.hash !== '#/xfer') navigate('xfer');
      else render();
    } else if (target === 'parties' || target === 'party') {
      if (window.location.hash !== '#/parties') navigate('parties');
      else render();
    } else if (target === 'pl' || target === 'pnl') {
      if (window.location.hash !== '#/pl') navigate('pl');
      else render();
    }
  },
  newin: () => {
    closeM();
    txnForm('in');
  },
  newout: () => {
    closeM();
    txnForm('out');
  },
  newexp: () => {
    closeM();
    txnForm('out');
  },
  newxfer: () => {
    closeM();
    newTransferForm();
  },
  newdoc: i => {
    closeM();
    if (i === 'sale') {
      salesState.tab = 'new';
      salesState.editNo = null;
      if (window.location.hash !== '#/sales') navigate('sales');
      else render();
    } else if (i === 'bill') {
      billsState.tab = 'new';
      billsState.editId = null;
      if (window.location.hash !== '#/bills') navigate('bills');
      else render();
    } else {
      docForm2(i);
    }
  },
  newloan: loanForm2,
  newjv: jvForm2,
  edittxn: i => {
    closeM();
    const entry = db.entries.find(x => x.id === i);
    if (!entry) return;
    if (entry.src === 'in') moneyInForm(entry);
    else if (entry.src === 'out' || entry.src === 'exp' || entry.src === 'pay') moneyOutForm(entry);
    else if (entry.src === 'xfer') newTransferForm(entry);
    else if (entry.src === 'jv') jvForm2(entry);
    else jvForm2(entry);
  },
  editjv: i => {
    closeM();
    const entry = db.entries.find(x => x.id === i);
    if (entry) jvForm2(entry);
  },
  newparty: () => {
    closeM();
    const preType = partiesState.pt && partiesState.pt !== 'all' ? partiesState.pt : 'customer';
    partyForm(null, preType);
  },
  editparty: i => partyForm(i),
  delparty: i => deletePartyAction(i, render),
  mergeparty: i => mergePartyModal(i, render),
  ptab: i => {
    partiesState.pt = i;
    render();
  },
  clearpartiessearch: () => {
    partiesState.pq = '';
    render();
    const el = $('[data-k="pq"]');
    if (el) el.focus();
  },
  clearloanssearch: () => {
    loansState.q = '';
    render();
    const el = $('[data-k="lq"]');
    if (el) el.focus();
  },
  clearmoneysearch: () => {
    moneyState.q = '';
    render();
    const el = $('[data-k="q"]');
    if (el) el.focus();
  },
  clearjournalsearch: () => {
    accountingState.jq = '';
    render();
    const el = $('[data-k="jq"]');
    if (el) el.focus();
  },
  cleartbsearch: () => {
    reportsState.tb.q = '';
    render();
    const el = $('[data-k="tbq"]');
    if (el) el.focus();
  },
  clearglsearch: () => {
    accountingState.gl.q = '';
    render();
    const el = $('[data-k="glq"]');
    if (el) el.focus();
  },
  clearbksearch: () => {
    accountingState.cb.q = '';
    render();
    const el = $('[data-k="bkq"]');
    if (el) el.focus();
  },
  'overview-newsale': () => {
    salesState.tab = 'new';
    salesState.editNo = null;
    salesState.selectedPartyId = null;
    salesState.lines = [];
    salesState.files = [];
    salesState.newNo = nextInvNo();
    navigate('sales');
  },
  'overview-newbill': () => {
    billsState.tab = 'new';
    billsState.editId = null;
    billsState.selectedPartyId = null;
    billsState.files = [];
    navigate('bills');
  },
  psale: i => {
    salesState.tab = 'new';
    salesState.editNo = null;
    salesState.selectedPartyId = i;
    navigate('sales');
  },
  pbill: i => {
    billsState.tab = 'new';
    billsState.editId = null;
    billsState.selectedPartyId = i;
    navigate('bills');
  },
  recv: i => partyPay(i, 'sale'),
  payp: i => partyPay(i, 'bill'),
  lf: i => {
    loansState.lf = i;
    render();
  },
  lterms: i => {
    const l = db.loans.find(x => x.id === i);
    form('Edit loan terms',
      `<div class="two">
        ${fld('rate', 'Interest % p.a.', 'number', l.rate)}
        ${fld('due', 'Next due date', 'date', l.due)}
        ${fld('emi', 'Installment (₹)', 'text', l.emi ? (l.emi / 100).toFixed(2) : '')}
      </div>
      ${fld('notes', 'Notes', 'text', l.notes)}
      <small>Terms apply from now on. Past transactions are unchanged.</small>`,
      v => {
        l.rate = parseFloat(v.rate || 0);
        l.due = v.due;
        l.emi = v.emi ? P(v.emi) : 0;
        l.notes = v.notes;
        log('loan terms', l.ref);
      }
    );
  },
  lfee: i => {
    const l = db.loans.find(x => x.id === i), t = l.dir === 'taken';
    form('Fee or penalty',
      `<div class="two">
        ${fld('date', 'Date', 'date', today(), 1)}
        ${fld('amt', 'Amount (₹)', 'text', '', 1)}
        ${sel('acct', 'Account', accOpts(a => a.cash))}
      </div>
      <small>${t ? 'Charged to Miscellaneous Expense.' : 'Recorded as Other Income.'}</small>`,
      v => {
        const a = P(v.amt);
        if (!a) throw Error('Amount must be above zero');
        post({
          date: v.date,
          src: 'loan',
          narr: l.ref + ' fee / penalty',
          meta: { loan: i, kind: 'fee', pr: 0, int: a },
          lines: t ? [{ a: '5600', d: a, c: 0, p: l.party }, { a: v.acct, d: 0, c: a, p: l.party }] : [{ a: v.acct, d: a, c: 0, p: l.party }, { a: '4200', d: 0, c: a, p: l.party }]
        });
      }
    );
  },
  ltop: i => {
    const l = db.loans.find(x => x.id === i), t = l.dir === 'taken';
    form('Top-up (further disbursement)',
      `<div class="two">
        ${fld('date', 'Date', 'date', today(), 1)}
        ${fld('amt', 'Amount (₹)', 'text', '', 1)}
        ${sel('acct', 'Account', accOpts(a => a.cash))}
      </div>`,
      v => {
        const a = P(v.amt);
        if (!a) throw Error('Amount must be above zero');
        post({
          date: v.date,
          src: 'loan',
          narr: l.ref + ' top-up',
          meta: { loan: i, kind: 'topup', pr: a },
          lines: t ? [{ a: v.acct, d: a, c: 0, p: l.party }, { a: '2100', d: 0, c: a, p: l.party }] : [{ a: '1400', d: a, c: 0, p: l.party }, { a: v.acct, d: 0, c: a, p: l.party }]
        });
        l.principal += a;
      }
    );
  },
  settle: i => {
    const l = db.loans.find(x => x.id === i);
    repayForm2(i, { pr: l.principal - l.repaid, int: lacr(l) });
  },
  newacc: () => form('Add account',
    `<div class="two">
      ${fld('code', 'Code', 'text', '', 1)}
      ${fld('name', 'Name', 'text', '', 1)}
      ${sel('t', 'Type', opts(Object.entries(TN)))}
      ${sel('cash', 'Cash or bank account?', opts([['0', 'No'], ['1', 'Yes']]))}
    </div>`,
    v => {
      if (acc(v.code)) throw Error('Code already in use');
      db.accounts.push({ code: v.code, name: v.name, t: v.t, cash: v.cash === '1' });
      log('account', v.code);
    }
  ),
  editacc: i => {
    const a = acc(i);
    form('Edit account ' + i,
      `${fld('name', 'Name', 'text', a.name, 1)}
      ${a.t === 'A' ? sel('cash', 'Cash or bank account?', opts([['0', 'No'], ['1', 'Yes']], a.cash ? '1' : '0')) : ''}
      <small>Code and type cannot change. Past entries keep their postings.</small>`,
      v => {
        a.name = v.name.trim();
        if (a.t === 'A' && v.cash !== undefined) a.cash = v.cash === '1';
        log('account edit', i);
      }
    );
  },
  delacc: i => {
    if (db.entries.some(e => e.lines.some(l => l.a === i)) || SYS.includes(i)) return toast('This account is in use and cannot be deleted');
    if (confirm('Delete account ' + an(i) + '?')) {
      db.accounts = db.accounts.filter(a => a.code !== i);
      save();
      render();
    }
  },
  rev: i => {
    const e = db.entries.find(x => x.id === i);
    const refStr = e ? e.ref : 'this transaction';
    if (!confirm(`Are you sure you want to reverse ${refStr}? A reversal entry will be posted to counteract it.`)) return;
    try {
      reverse(i);
      save();
      closeM();
      render();
      toast('Transaction reversed successfully');
    } catch (e) {
      toast(e.message);
    }
  },
  cdoc: i => {
    const d = db.docs.find(x => x.id === i);
    if (!d) return;
    if (d.cancelled) return toast('Document is already cancelled');
    if (!confirm('Cancel ' + d.no + '? Its entries and payments will be reversed.')) return;
    const snapshot = JSON.parse(JSON.stringify(db));
    try {
      if (Array.isArray(d.pays)) {
        for (const p of d.pays) {
          if (!p.void && p.je) {
            reverse(p.je);
            p.void = 1;
          }
        }
      }
      if (d.je) {
        reverse(d.je);
      }
      d.cancelled = 1;
      save();
      closeM();
      render();
      toast('Cancelled');
    } catch (e) {
      setDb(snapshot);
      toast(e.message || 'Failed to cancel document');
    }
  },
  stmt: stmt2,
  csv: showCsvModal,
  backup: showBackupModal,
  restore: showRestoreModal,
  wipe: () => {
    if (confirm('Erase ALL data in this browser? Take a backup first.') && confirm('This cannot be undone. Erase now?')) {
      localStorage.removeItem('bufin-v1');
      location.reload();
    }
  },
  logout: () => performLogout({ msg: 'Session logged out' }),
  promptopen: () => showOpenConfirmModal(),
  saveopen: () => showOpenConfirmModal(),
  unlockopen: () => {
    accountingState.openUnlocked = true;
    render();
    toast('Opening balances unlocked for editing');
  },
  unlockdate: () => {
    accountingState.openUnlocked = true;
    render();
    setTimeout(() => {
      const od = $('#od');
      if (od) {
        od.focus();
        try {
          if (typeof od.showPicker === 'function') od.showPicker();
        } catch (e) {}
      }
    }, 60);
    toast('Opening balances unlocked for editing');
  },
  lockopen: () => {
    const activeOpen = db.entries.find(e => e.src === 'open' && e.status === 'posted');
    accountingState.od = activeOpen ? activeOpen.date : '';
    accountingState.openUnlocked = false;
    render();
  },
  revopen: () => showOpenReverseModal(),
  files: async id => {
    const { getAttachments, showAttachmentViewer } = await import('./modules/attachments.js');
    const files = await getAttachments(id);
    if (!files || !files.length) toast('No attachments found');
    else showAttachmentViewer(files, 0);
  }
};

if (typeof window !== 'undefined') {
  window.ACTIONS = ACTIONS;
}

document.addEventListener('click', e => {
  const closeBtn = e.target.closest('.dlg-close, .universal-close-btn');
  if (closeBtn && !closeBtn.classList.contains('drawer-close-btn') && closeBtn.id !== 'pd_modal_close' && closeBtn.id !== 'bfClose' && closeBtn.id !== 'bfVx') {
    closeM();
    return;
  }
  const navLink = e.target.closest('#nav a');
  if (navLink) {
    $('#nav').classList.remove('open');
  }
  const t = e.target.closest('[data-a]');
  if (t && ACTIONS[t.dataset.a]) {
    ACTIONS[t.dataset.a](t.dataset.i);
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    const t = e.target.closest('[data-a]');
    if (t && ACTIONS[t.dataset.a] && t.getAttribute('role') === 'button' && t.tagName !== 'BUTTON' && t.tagName !== 'INPUT') {
      e.preventDefault();
      ACTIONS[t.dataset.a](t.dataset.i);
    }
  }
});

window.addEventListener('hashchange', render);
window.addEventListener('bufin-render', render);

export async function performLogout(opts = {}) {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch (e) {}

  if (typeof navigator !== 'undefined' && navigator.serviceWorker && navigator.serviceWorker.controller) {
    try {
      navigator.serviceWorker.controller.postMessage('PURGE_API_CACHE');
    } catch (e) {}
  }

  wipeStorage();
  toast(opts.msg || 'Session logged out');
  showPinLogin(boot);
}

let idleTimer = null;
let idleTrackingInitialized = false;

export function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  const minutes = (db && db.biz && typeof db.biz.autoLockMinutes === 'number')
    ? db.biz.autoLockMinutes
    : 5;
  if (!minutes || minutes <= 0) return; // 0 or negative disables auto-lock

  idleTimer = setTimeout(() => {
    const pinScreen = document.getElementById('pinScreen');
    if (pinScreen && pinScreen.style.display !== 'none') return; // already locked

    // Close any open modals
    const modal = document.getElementById('modal');
    if (modal) modal.style.display = 'none';

    showPinLogin(() => {
      resetIdleTimer();
      render();
    }, {
      title: 'App Locked',
      sub: 'Locked due to inactivity. Enter PIN to resume.'
    });
  }, minutes * 60 * 1000);
}

export function initIdleTracking() {
  if (idleTrackingInitialized || typeof window === 'undefined') return;
  idleTrackingInitialized = true;

  const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];
  const handleActivity = () => {
    const pinScreen = document.getElementById('pinScreen');
    if (pinScreen && pinScreen.style.display !== 'none') return;
    resetIdleTimer();
  };

  events.forEach(evt => {
    window.addEventListener(evt, handleActivity, { passive: true });
  });

  resetIdleTimer();
}

if (typeof window !== 'undefined') {
  window.addEventListener('bufin-auth-required', e => {
    const resumePush = e.detail && e.detail.resumePush;
    showPinLogin(() => {
      resetIdleTimer();
      if (resumePush && dirty) {
        push();
      } else {
        boot();
      }
    }, {
      title: 'Session Expired',
      sub: 'Session expired – log in again, your unsaved changes are kept'
    });
  });
}

export async function boot(opts = {}) {
  initPinKeypad();
  initIdleTracking();
  resetIdleTimer();

  // If fast-unlocked via instant local PIN verification, render immediately without blocking!
  if (opts && opts.fastUnlock) {
    if (!window.location.hash) {
      window.location.hash = '#/overview';
    } else {
      render();
    }
    return;
  }

  // Pre-render immediately from localStorage if available
  if (db && db.biz && window.location.hash) {
    render();
  }

  const startTime = Date.now();
  let delay = 1000;
  const timeoutMs = 60000;

  while (Date.now() - startTime < timeoutMs) {
    try {
      const r = await fetch('/api/state');

      // 401 Unauthorized: Session required
      if (r.status === 401) {
        hideSyncBanner();
        showPinLogin(boot, {
          title: 'Session Expired',
          sub: 'Session expired – log in again, your unsaved changes are kept'
        });
        return;
      }

      // Check for Service Worker offline stub (503 with offline: true)
      if (r.status === 503) {
        let isOfflineStub = false;
        try {
          const stubJson = await r.clone().json();
          if (stubJson && stubJson.offline) isOfflineStub = true;
        } catch (e) {}

        if (isOfflineStub || (typeof navigator !== 'undefined' && !navigator.onLine)) {
          hideSyncBanner();
          if (db && db.biz) {
            unlockApp();
            updateSyncPill('offline');
            if (!window.location.hash) window.location.hash = '#/overview';
            else render();
            return;
          } else {
            showPinLogin(boot);
            return;
          }
        }
      }

      // 2xx Success: server truth loaded
      if (r.ok) {
        hideSyncBanner();
        unlockApp();
        const j = await r.json();
        const remoteVersion = j.version;
        const remoteData = j.data;

        if (dirty) {
          if (remoteVersion !== ver && remoteVersion > baseVer) {
            showConflictModal(j);
          } else {
            push();
          }
        } else {
          setVer(remoteVersion);
          setBaseVer(remoteVersion);
          if (remoteData) {
            setDb(remoteData);
          }
          setDirty(false, 0);
          updateSyncPill('saved');
        }

        if (!window.location.hash) {
          window.location.hash = '#/overview';
        } else {
          render();
        }
        return;
      }

      // Non-2xx (Render cold start 502/503/504, etc.): do not call setDb with local data as server truth!
      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      showSyncBanner(`Server is waking up… (${elapsedSec}s) Connecting to backend service`, 'warn');
      updateSyncPill('saving');

    } catch (netErr) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        hideSyncBanner();
        if (db && db.biz) {
          unlockApp();
          updateSyncPill('offline');
          if (!window.location.hash) window.location.hash = '#/overview';
          else render();
          return;
        } else {
          showPinLogin(boot);
          return;
        }
      }

      const elapsedSec = Math.round((Date.now() - startTime) / 1000);
      showSyncBanner(`Server is waking up… (${elapsedSec}s) Connecting to backend service`, 'warn');
      updateSyncPill('saving');
    }

    // Exponential back-off wait (cap at 5s)
    await new Promise(resolve => setTimeout(resolve, delay));
    delay = Math.min(delay * 1.5, 5000);
  }

  // 60s timeout expired
  if (db && db.biz) {
    showSyncBanner('Server connection timed out. Running with saved offline data.', 'warn');
    unlockApp();
    updateSyncPill('offline');
    if (!window.location.hash) window.location.hash = '#/overview';
    else render();
  } else {
    showSyncBanner('Server is currently unavailable. Please check your network and refresh.', 'error');
    showPinLogin(boot);
  }
}

boot();
