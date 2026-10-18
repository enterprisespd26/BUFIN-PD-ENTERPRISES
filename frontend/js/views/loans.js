import { esc, fmt, head, kpi, today } from '../modules/utils.js';
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

  if (activeLoanId) {
    const loan = db.loans.find(x => x.id === activeLoanId);
    if (loan) return renderLoanDetail(loan);
  }

  return renderLoansDashboard();
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

  return head('Loans', `<button class="p" data-a="newloan">+ Register loan</button>`) +
    `<div class="grid">
      ${kpi('Total Borrowed Outstanding', fmt(totalBorrowedOut))}
      ${kpi('Total Lent Outstanding', fmt(totalLentOut))}
      ${kpi('Active Loans Count', activeCount)}
      ${kpi('Overdue Loans Count', overdueCount)}
    </div>
    <div class="filters" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        ${[['all', 'All'], ['taken', 'Borrowed'], ['given', 'Lent'], ['active', 'Active'], ['closed', 'Closed']].map(x => `<button class="${f === x[0] ? 'p' : ''}" data-a="lf" data-i="${x[0]}">${x[1]}</button>`).join('')}
      </div>
      <input data-k="lq" placeholder="Search loan name, party, reference..." value="${esc(loansState.q || '')}" style="width:260px;max-width:100%;">
    </div>` +
    (filteredLoans.length
      ? `<div class="wrap"><table>
          <thead>
            <tr>
              <th>Loan Name & Party</th>
              <th>Type</th>
              <th class="num">Principal Amount</th>
              <th class="num">Outstanding Balance</th>
              <th>Next Due Date</th>
              <th>Status</th>
              <th style="text-align:right">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${filteredLoans.map(l => {
              const s = lstat(l);
              const o = Math.max(0, l.principal - l.repaid);
              const partyName = l.partyName || pn(l.party) || 'Unknown Party';
              const isOverdue = s[0] === 'Overdue';
              return `<tr class="k" data-a="viewloan" data-i="${l.id}">
                <td>
                  <a href="#/loans/${l.id}" style="font-weight:600;color:var(--ac,#2563eb);text-decoration:none;">${esc(l.name || l.ref)}</a>
                  <div style="font-size:12px;color:var(--t2,#64748b);margin-top:2px;">
                    ${esc(partyName)} · <span style="font-family:monospace;">${esc(l.ref)}</span>
                  </div>
                </td>
                <td>
                  ${l.dir === 'taken'
                    ? `<span class="pd-pill" style="background:#eff6ff;color:#1e40af;font-weight:600;border:1px solid #bfdbfe;">Borrowed</span>`
                    : `<span class="pd-pill" style="background:#fef3c7;color:#92400e;font-weight:600;border:1px solid #fde68a;">Lent</span>`}
                </td>
                <td class="num">${fmt(l.principal)}</td>
                <td class="num" style="font-weight:700;color:${o > 0 ? (l.dir === 'taken' ? 'var(--rd,#dc2626)' : 'var(--ok,#16a34a)') : 'var(--t2,#64748b)'}">${fmt(o)}</td>
                <td>${l.due ? (isOverdue ? `<span style="color:var(--rd);font-weight:600;">${l.due} ⚠️</span>` : l.due) : '-'}</td>
                <td><span class="b ${s[1]}">${s[0]}</span></td>
                <td style="text-align:right;white-space:nowrap;" onclick="event.stopPropagation()">
                  ${o > 0 ? `<button class="p sm" data-a="repay" data-i="${l.id}" style="padding:4px 8px;font-size:12px;margin-right:4px;">Record Payment / EMI</button>` : ''}
                  <button class="btn alt sm" data-a="viewloan" data-i="${l.id}" style="padding:4px 8px;font-size:12px;margin-right:4px;">View Statement</button>
                  <button class="btn alt sm" data-a="editloan" data-i="${l.id}" style="padding:4px 8px;font-size:12px;margin-right:4px;">Edit</button>
                  <button class="btn alt sm" data-a="delloan" data-i="${l.id}" style="padding:4px 8px;font-size:12px;color:var(--rd);">Delete</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table></div>`
      : `<div class="wrap"><div class="empty">No loans found. Register each loan separately; every loan keeps its own ledger statement.</div></div>`) +
    `<small>Ledger check: ${ok ? 'loan balances match ledger accounts 2100 / 1400.' : 'loan balances differ from ledger accounts 2100 / 1400 (manual journals can cause this).'}</small>`;
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
      <td>${e.date}</td>
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
    <div class="noprint" style="margin-bottom:14px;">
      <button type="button" class="btn alt sm" data-a="backloans" style="display:inline-flex;align-items:center;gap:6px;font-weight:600;padding:6px 12px;">
        ← Back to Loans
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
    <div class="pd-card" style="margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
            <h2 style="margin:0;font-size:20px;color:var(--tx);">${esc(l.name || l.ref)}</h2>
            <span style="font-family:monospace;background:var(--mu);padding:2px 8px;border-radius:4px;font-size:12px;">${esc(l.ref)}</span>
            ${t
              ? `<span class="pd-pill" style="background:#eff6ff;color:#1e40af;font-weight:600;border:1px solid #bfdbfe;">Borrowed (We owe)</span>`
              : `<span class="pd-pill" style="background:#fef3c7;color:#92400e;font-weight:600;border:1px solid #fde68a;">Lent (Given)</span>`}
            <span class="b ${s[1]}">${s[0]}</span>
          </div>
          <div style="font-size:13px;color:var(--t2);">
            Party: <b>${esc(partyName)}</b> · Start Date: <b>${l.date}</b>
          </div>
        </div>

        <div class="pd-btn-row noprint" style="margin:0;gap:8px;flex-wrap:wrap;">
          ${o > 0 ? `<button type="button" class="p sm" data-a="repay" data-i="${l.id}" style="font-weight:600;">+ Record Payment / EMI</button>` : ''}
          ${o > 0 ? `<button type="button" class="btn alt sm" data-a="ltop" data-i="${l.id}">Top-up Principal</button>` : ''}
          ${o > 0 ? `<button type="button" class="btn alt sm" data-a="lfee" data-i="${l.id}">Add Fee / Penalty</button>` : ''}
          <button type="button" class="btn alt sm" data-a="editloan" data-i="${l.id}">Edit Terms</button>
          <button type="button" class="btn alt sm" onclick="window.print()">Print Loan Statement</button>
          <button type="button" class="btn alt sm" data-a="loancsv" data-i="${l.id}">Export CSV</button>
        </div>
      </div>
    </div>

    <!-- LOAN OVERVIEW GRID -->
    <div class="grid" style="grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:12px;margin-bottom:16px;">
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
