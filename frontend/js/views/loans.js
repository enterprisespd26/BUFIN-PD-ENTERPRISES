import { esc, fmt, fmtDate, head, kpi, today } from '../modules/utils.js';
import { db, pn, sgn, acc, an, net, lstat, lacr } from '../modules/state.js';

export const loansState = {
  lf: 'all',          // 'all' | 'taken' | 'given' | 'active' | 'closed'
  activeLoanId: null, // string | null
  q: '',
  h: null
};

export function renderLoans() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const pathPart = raw.split('?')[0];
  const queryPart = raw.split('?')[1] || '';
  const urlParams = new URLSearchParams(queryPart);
  const pathLoanId = pathPart.startsWith('loans/') ? pathPart.slice(6) : urlParams.get('id');
  const activeLoanId = pathLoanId || loansState.activeLoanId;

  let body = '';
  if (activeLoanId) {
    const loan = db.loans.find(x => x.id === activeLoanId);
    body = loan ? renderLoanDetail(loan) : renderLoansDashboard();
  } else {
    body = renderLoansDashboard();
  }

  return `<div class="loan-page pb-28">${body}</div>`;
}

function renderLoansDashboard() {
  const f = loansState.lf || 'all';
  const q = (loansState.q || '').toLowerCase();
  const AL = db.loans.filter(l => lstat(l)[0] !== 'Closed');

  const totalBorrowedOut = db.loans.filter(l => l.dir === 'taken').reduce((s, l) => s + Math.max(0, l.principal - l.repaid), 0);
  const totalLentOut = db.loans.filter(l => l.dir === 'given').reduce((s, l) => s + Math.max(0, l.principal - l.repaid), 0);
  const activeCount = AL.length;
  const overdueCount = AL.filter(l => lstat(l)[0] === 'Overdue').length;

  const sm = (a, d) => a.filter(l => l.dir === d).reduce((s, l) => s + l.principal - l.repaid, 0);
  const ok = sm(db.loans, 'taken') === sgn(acc('2100'), net('2100')) && sm(db.loans, 'given') === net('1400');

  const filteredLoans = db.loans.filter(l => {
    const status = lstat(l)[0];
    const matchesFilter = f === 'all' || l.dir === f || (f === 'active' && status !== 'Closed') || (f === 'closed' && status === 'Closed');
    if (!matchesFilter) return false;
    if (!q) return true;
    const name = l.name || '';
    const party = l.partyName || pn(l.party) || '';
    const ref = l.ref || '';
    return (name + ' ' + party + ' ' + ref).toLowerCase().includes(q);
  }).slice().reverse();

  return head('Loans', `<button class="p loan-btn-register shrink-0" data-a="newloan">+ Register loan</button>`, 'loan-header-bar') +
    `<div class="grid loan-summary-grid">
      ${kpi('<span class="loan-lbl-full">Total Borrowed Outstanding</span><span class="loan-lbl-short">Total Borrowed</span>', fmt(totalBorrowedOut))}
      ${kpi('<span class="loan-lbl-full">Total Lent Outstanding</span><span class="loan-lbl-short">Total Lent</span>', fmt(totalLentOut))}
      ${kpi('<span class="loan-lbl-full">Active Loans Count</span><span class="loan-lbl-short">Active Loans</span>', activeCount)}
      ${kpi('<span class="loan-lbl-full">Overdue Loans Count</span><span class="loan-lbl-short">Overdue Loans</span>', overdueCount > 0 ? `<span style="color:var(--rd,#dc2626);">${overdueCount}</span>` : overdueCount)}
    </div>
    <div class="filters loan-filters-toolbar">
      <div class="loan-filter-pills flex items-center gap-2 overflow-x-auto no-scrollbar py-1 w-full -webkit-overflow-scrolling-touch">
        ${[['all', 'All'], ['taken', 'Borrowed'], ['given', 'Lent'], ['active', 'Active'], ['closed', 'Closed']].map(x => `<button type="button" class="loan-pill-btn shrink-0 ${f === x[0] ? 'p on' : 'alt'}" data-a="lf" data-i="${x[0]}">${x[1]}</button>`).join('')}
      </div>
      <div class="loan-search-wrap">
        <svg class="loan-search-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input type="text" data-k="lq" class="loan-search-input" placeholder="Search loans, party, ref..." value="${esc(loansState.q || '')}">
        ${loansState.q ? `
          <button type="button" class="loan-search-clear" data-a="clearloanssearch" aria-label="Clear search" title="Clear search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        ` : ''}
      </div>
    </div>` +
    (filteredLoans.length
      ? `<div class="wrap loan-table-wrap w-full bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-4 md:p-6">
          <div class="w-full overflow-x-auto">
            <table class="loan-table w-full">
              <colgroup>
                <col class="col-loan-name" style="width: 25%; min-width: 190px;">
                <col class="col-loan-type" style="width: 10%; min-width: 95px;">
                <col class="col-loan-principal" style="width: 13%; min-width: 120px;">
                <col class="col-loan-balance" style="width: 14%; min-width: 130px;">
                <col class="col-loan-due" style="width: 11%; min-width: 105px;">
                <col class="col-loan-status" style="width: 9%; min-width: 85px;">
                <col class="col-loan-actions" style="width: 18%; min-width: 200px;">
              </colgroup>
              <thead>
                <tr class="grid grid-cols-[minmax(170px,1.8fr)_minmax(80px,0.7fr)_minmax(125px,1.1fr)_minmax(125px,1.1fr)_minmax(90px,0.8fr)_minmax(75px,0.6fr)_auto] gap-4 px-4 w-full">
                  <th class="loan-th text-left">Loan Name & Party</th>
                  <th class="loan-th text-center">Type</th>
                  <th class="loan-th num text-right">Principal Amount</th>
                  <th class="loan-th num text-right">Outstanding Balance</th>
                  <th class="loan-th text-left">Next Due Date</th>
                  <th class="loan-th text-center">Status</th>
                  <th class="loan-th text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${filteredLoans.map(l => {
                  const s = lstat(l);
                  const o = Math.max(0, l.principal - l.repaid);
                  const partyName = l.partyName || pn(l.party) || 'Unknown Party';
                  const isOverdue = s[0] === 'Overdue';
                  return `<tr class="k loan-row grid grid-cols-[minmax(170px,1.8fr)_minmax(80px,0.7fr)_minmax(125px,1.1fr)_minmax(125px,1.1fr)_minmax(90px,0.8fr)_minmax(75px,0.6fr)_auto] gap-4 px-4 w-full" data-a="viewloan" data-i="${l.id}">
                    <td class="loan-td-name">
                      <a href="#/loans/${l.id}" class="loan-name-title" title="${esc(l.name || l.ref)}">
                        ${esc(l.name || l.ref)}
                      </a>
                      <div class="loan-party-subtitle">
                        ${esc(partyName)} · <span class="loan-ref-code">${esc(l.ref)}</span>
                      </div>
                    </td>
                    <td class="loan-td-type text-center">
                      ${l.dir === 'taken'
                        ? `<span class="loan-pill pill-borrowed">Borrowed</span>`
                        : `<span class="loan-pill pill-lent">Lent</span>`}
                    </td>
                    <td class="loan-td-principal num text-right">${fmt(l.principal)}</td>
                    <td class="loan-td-balance num text-right ${o > 0 ? (l.dir === 'taken' ? 'text-rose-600' : 'text-emerald-600') : 'text-slate-400'}">
                      ${fmt(o)}
                    </td>
                    <td class="loan-td-due">
                      ${l.due ? (isOverdue ? `<span class="loan-due-overdue">${l.due} ⚠️</span>` : `<span class="loan-due-normal">${l.due}</span>`) : `<span class="text-slate-400">–</span>`}
                    </td>
                    <td class="loan-td-status text-center">
                      <span class="loan-pill pill-${s[0].toLowerCase()}">${s[0]}</span>
                    </td>
                    <td class="loan-card-actions text-right flex items-center justify-end gap-2 shrink-0 pr-2">
                      <!-- Desktop Action Group -->
                      <div class="loan-actions-desktop flex items-center justify-end gap-2 shrink-0 pr-2">
                        ${o > 0 ? `
                          <button type="button" class="loan-btn-primary loan-btn-repay shrink-0" data-a="repay" data-i="${l.id}" title="Record Payment / EMI" onclick="if (window.ACTIONS && window.ACTIONS.repay) { window.ACTIONS.repay('${l.id}'); event.stopPropagation(); }">
                            Record Payment / EMI
                          </button>
                        ` : ''}
                        <button type="button" class="loan-btn-secondary loan-btn-view shrink-0" data-a="viewloan" data-i="${l.id}" title="View Statement" onclick="if (window.ACTIONS && window.ACTIONS.viewloan) { window.ACTIONS.viewloan('${l.id}'); event.stopPropagation(); }">
                          View Statement
                        </button>
                        
                        <!-- Compact More Actions (Edit & Delete) -->
                        <div class="loan-more-wrap shrink-0">
                          <button type="button" class="loan-btn-more shrink-0" title="More options" aria-label="More options" onclick="event.stopPropagation(); const wrap = this.closest('.loan-more-wrap'); const wasOpen = wrap.classList.contains('is-open'); document.querySelectorAll('.loan-more-wrap.is-open').forEach(w => w.classList.remove('is-open')); if (!wasOpen) { const rect = wrap.getBoundingClientRect(); const tableWrap = wrap.closest('.loan-table-wrap'); const spaceBelow = tableWrap ? (tableWrap.getBoundingClientRect().bottom - rect.bottom) : 200; if (spaceBelow < 120) wrap.classList.add('drop-up'); else wrap.classList.remove('drop-up'); wrap.classList.add('is-open'); }">
                            ⋮
                          </button>
                          <div class="loan-dropdown-menu">
                            <button type="button" class="loan-dropdown-item" data-a="editloan" data-i="${l.id}" onclick="this.closest('.loan-more-wrap').classList.remove('is-open'); if (window.ACTIONS && window.ACTIONS.editloan) { window.ACTIONS.editloan('${l.id}'); event.stopPropagation(); }">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
                              </svg>
                              <span>Edit Loan</span>
                            </button>
                            <button type="button" class="loan-dropdown-item red" data-a="delloan" data-i="${l.id}" onclick="this.closest('.loan-more-wrap').classList.remove('is-open'); if (window.ACTIONS && window.ACTIONS.delloan) { window.ACTIONS.delloan('${l.id}'); event.stopPropagation(); }">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                <line x1="10" y1="11" x2="10" y2="17"></line>
                                <line x1="14" y1="11" x2="14" y2="17"></line>
                              </svg>
                              <span>Delete Loan</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      <!-- Mobile Action Footer -->
                      <div class="loan-action-footer">
                        ${o > 0 ? `<button type="button" class="btn p sm loan-btn-repay" data-a="repay" data-i="${l.id}">Record Payment / EMI</button>` : ''}
                      <div class="loan-action-row">
                        <button type="button" class="btn alt sm loan-btn-view" data-a="viewloan" data-i="${l.id}">View Statement</button>
                        <button type="button" class="btn alt sm loan-btn-edit" data-a="editloan" data-i="${l.id}">Edit</button>
                        <button type="button" class="btn alt sm red loan-btn-del" data-a="delloan" data-i="${l.id}">Delete</button>
                      </div>
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>`
      : `<div class="wrap loan-table-wrap"><div class="empty" style="padding:40px 20px;text-align:center;color:#64748b;">No loans found. Register each loan separately; every loan keeps its own ledger statement.</div></div>`) +
    `<div class="loan-ledger-check" style="font-size:12px;color:#64748b;margin-top:8px;">Ledger check: ${ok ? 'loan balances match ledger accounts 2100 / 1400.' : 'loan balances differ from ledger accounts 2100 / 1400 (manual journals can cause this).'}</div>`;
}

if (typeof window !== 'undefined' && !window.__loanDropdownBound) {
  window.__loanDropdownBound = true;
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.loan-more-wrap')) {
      document.querySelectorAll('.loan-more-wrap.is-open').forEach(w => w.classList.remove('is-open'));
    }
  });
}

function renderLoanDetail(l) {
  const t = l.dir === 'taken';
  const o = Math.max(0, l.principal - l.repaid);
  const s = lstat(l);
  const acr = lacr(l);
  const partyName = l.partyName || pn(l.party) || 'Party';

  const entries = db.entries.filter(e => e.meta && e.meta.loan === l.id).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.at || '').localeCompare(b.at || ''));
  const K2 = { disb: 'Disbursement', topup: 'Top-up Principal', fee: 'Fee / Penalty', rep: 'EMI / Repayment' };

  let run = 0;
  const rows = entries.map(e => {
    const m = e.meta || {};
    const pr = m.pr || 0;
    const it = m.int || 0;
    if (m.kind === 'disb' || m.kind === 'topup') {
      run += pr;
    } else if (m.kind === 'rep') {
      run -= pr;
    }
    const cashL = e.lines.find(line => acc(line.a)?.cash);
    const acctName = cashL ? an(cashL.a) : (m.acct ? an(m.acct) : '-');
    const total = (m.kind === 'rep') ? (pr + it) : (pr || it);
    const refNo = m.ref || m.docNo || e.ref;

    return `<tr>
      <td>${fmtDate(e.date)}</td>
      <td><span class="pd-pill ${m.kind === 'disb' ? 'p' : m.kind === 'rep' ? 'ok' : 'u'}">${K2[m.kind] || m.kind || 'Transaction'}</span></td>
      <td><code>${esc(refNo)}</code></td>
      <td>${esc(acctName)}</td>
      <td class="num">${pr ? fmt(pr) : '-'}</td>
      <td class="num">${it ? fmt(it) : '-'}</td>
      <td class="num" style="font-weight:600">${fmt(total)}</td>
      <td class="num" style="font-weight:700">${fmt(Math.max(0, run))}</td>
      <td style="text-align:right" class="noprint"><button class="btn alt sm" data-a="ent" data-i="${e.id}" style="padding:2px 8px;font-size:11px;">View Voucher</button></td>
    </tr>`;
  }).join('');

  return `
    <div class="noprint loan-detail-top-nav">
      <button type="button" class="btn alt sm loan-back-btn" data-a="backloans">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
        <span>Back to Loans</span>
      </button>
      <button type="button" class="btn alt sm loan-btn-csv-top" data-a="loancsv" data-i="${l.id}" title="Export Statement CSV">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
        <span>Export CSV</span>
      </button>
    </div>

    <!-- PRINT HEADER -->
    <div class="print-only" style="display:none;margin-bottom:20px;border-bottom:2px solid #000;padding-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <h2 style="margin:0;font-size:20px;">${esc(db.biz.name)}</h2>
          <div style="font-size:12px;color:#555;">${esc(db.biz.addr || '')}</div>
          <div style="font-size:12px;color:#555;">GSTIN: ${esc(db.biz.gstin || '-')} · Phone: ${esc(db.biz.phone || '-')}</div>
        </div>
        <div style="text-align:right;">
          <h3 style="margin:0;font-size:18px;">LOAN STATEMENT</h3>
          <div style="font-size:12px;color:#555;">Date: ${today()}</div>
          <div style="font-size:12px;color:#555;">Ref: <b>${esc(l.ref)}</b></div>
        </div>
      </div>
    </div>

    <!-- MAIN HEADER -->
    <div class="pd-card loan-detail-card" style="margin-bottom:16px;">
      <div class="loan-detail-card-inner">
        <div class="loan-detail-header-info">
          <div class="loan-detail-badges">
            <h2 class="loan-detail-name">${esc(l.name || l.ref)}</h2>
            <span class="loan-detail-ref">${esc(l.ref)}</span>
            ${t
              ? `<span class="pd-pill pill-borrowed">Borrowed (We owe)</span>`
              : `<span class="pd-pill pill-lent">Lent (Given)</span>`}
            <span class="b ${s[1]}">${s[0]}</span>
          </div>
          <div class="loan-detail-meta">
            Party: <b>${esc(partyName)}</b> · Start Date: <b>${l.date}</b>
          </div>
        </div>

        <div class="loan-detail-actions noprint">
          ${o > 0 ? `
            <button type="button" class="loan-btn-primary loan-act-repay-btn" data-a="repay" data-i="${l.id}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>+ Record Payment / EMI</span>
            </button>
          ` : ''}
          <div class="loan-actions-sub-grid">
            ${o > 0 ? `
              <button type="button" class="btn alt sm loan-sub-btn" data-a="ltop" data-i="${l.id}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                <span>Top-up Principal</span>
              </button>
            ` : ''}
            ${o > 0 ? `
              <button type="button" class="btn alt sm loan-sub-btn" data-a="lfee" data-i="${l.id}">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                <span>Add Fee / Penalty</span>
              </button>
            ` : ''}
            <button type="button" class="btn alt sm loan-sub-btn" data-a="editloan" data-i="${l.id}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
              <span>Edit Terms</span>
            </button>
            <button type="button" class="btn alt sm loan-sub-btn" onclick="window.print()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
              <span>Print Statement</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- LOAN OVERVIEW GRID -->
    <div class="grid loan-detail-kpis" style="margin-bottom:16px;">
      <div class="kpi">
        <span>Current Outstanding</span>
        <b style="font-size:20px;color:${o > 0 ? (t ? 'var(--rd,#dc2626)' : 'var(--ok,#16a34a)') : 'inherit'}">${fmt(o)}</b>
      </div>
      <div class="kpi">
        <span>Initial Principal</span>
        <b>${fmt(l.principal)}</b>
      </div>
      <div class="kpi">
        <span>Total Principal Repaid</span>
        <b>${fmt(l.repaid)}</b>
      </div>
      <div class="kpi">
        <span>Accrued Interest</span>
        <b>${fmt(acr)}</b>
      </div>
      <div class="kpi">
        <span>Interest Rate</span>
        <b>${l.rate}% p.a. (simple)</b>
      </div>
      <div class="kpi">
        <span>Installment / EMI</span>
        <b>${l.emi ? fmt(l.emi) : '-'}</b>
      </div>
      <div class="kpi">
        <span>Next Due Date</span>
        <b style="${s[0] === 'Overdue' ? 'color:var(--rd)' : ''}">${l.due ? (s[0] === 'Overdue' ? l.due + ' ⚠️' : l.due) : '-'}</b>
      </div>
      <div class="kpi">
        <span>Disbursement Account</span>
        <b>${esc(an(l.acct) || 'Cash / Bank')}</b>
      </div>
    </div>

    ${l.notes ? `
      <div class="pd-card" style="margin-bottom:16px;padding:12px 16px;background:var(--mu);font-size:13px;">
        <span style="font-weight:600;color:var(--tx);">Agreement / Notes:</span> ${esc(l.notes)}
      </div>
    ` : ''}

    <!-- STATEMENT TRANSACTIONS TABLE -->
    <div class="pd-card">
      <div class="pd-btn-row" style="margin-bottom:12px;justify-content:space-between;align-items:center;">
        <h3 style="margin:0;font-size:16px;">Loan Transaction History Statement</h3>
        <span style="font-size:12px;color:var(--t2);">${entries.length} transaction${entries.length === 1 ? '' : 's'} recorded</span>
      </div>

      <div class="wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Txn Type</th>
              <th>Receipt / Ref No.</th>
              <th>Account</th>
              <th class="num">Principal Paid</th>
              <th class="num">Interest</th>
              <th class="num">Total Paid / Moved</th>
              <th class="num">Remaining Balance</th>
              <th style="text-align:right" class="noprint">Voucher</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="9" class="empty">No transactions recorded yet for this loan.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}
