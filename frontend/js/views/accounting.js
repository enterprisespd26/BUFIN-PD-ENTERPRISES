import { esc, fmt, today, prev, head, kpi, toast, downloadCSV } from '../modules/utils.js';
import { db, TN, SYS, acc, an, net, sgn, cashAcc, pn, sortEntries } from '../modules/state.js';
import { entTable, accOpts } from '../modules/components.js';

export const accountingState = {
  jq: '',
  od: '',
  openUnlocked: false,
  gl: { acc: '1000', f: '', t: '', q: '' },
  cb: { c: 'all', f: '', t: '', q: '' },
  tb: { d: today() }
};

export function renderCoa() {
  const cashBal = net('1000');
  const negCashBanner = cashBal < 0 ? `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:20px;">⚠️</span>
        <div>
          <b style="color:#991b1b;font-size:14px;">Negative Cash in Hand Balance (${fmt(cashBal)})</b>
          <div style="color:#7f1d1d;font-size:12.5px;margin-top:2px;">In real-world accounting, physical cash cannot be negative. Please set your opening cash balance or deposit cash into Cash in Hand.</div>
        </div>
      </div>
      <button class="p sm" data-a="nav" data-i="open" style="white-space:nowrap;">Set Opening Balance</button>
    </div>
  ` : '';

  return head('Chart of Accounts', `<button data-a="nav" data-i="open">Opening balances</button><button class="p" data-a="newacc">Add account</button>`) +
    negCashBanner +
    Object.keys(TN).map(t => {
      const L = db.accounts.filter(a => a.t === t).sort((a, b) => a.code.localeCompare(b.code));
      return `<h3>${TN[t]}</h3><div class="wrap"><table><tr><th>Account Name</th><th>Cash/Bank</th><th class="num">Balance</th><th></th></tr>${L.map(a => {
        const used = db.entries.some(e => e.lines.some(l => l.a === a.code));
        const bal = sgn(a, net(a.code));
        const isNegCash = a.code === '1000' && bal < 0;
        const balDisplay = isNegCash 
          ? `<span style="color:#dc2626;font-weight:700;">${fmt(bal)}</span> <span class="b rd" style="font-size:10px;margin-left:4px;">Negative Cash</span>`
          : (bal < 0 ? `<span style="color:#dc2626;">${fmt(bal)}</span>` : fmt(bal));

        return `<tr class="k" data-a="gl" data-i="${a.code}"><td><b>${esc(a.name)}</b> <small style="color:var(--t2)">(${a.code})</small></td><td>${a.cash ? '<span class="b ok">Yes</span>' : ''}</td><td class="num">${balDisplay}</td><td class="num"><button data-a="editacc" data-i="${a.code}">Edit</button>${!used && !SYS.includes(a.code) ? `<button class="d" data-a="delacc" data-i="${a.code}">Delete</button>` : ''}</td></tr>`;
      }).join('') || '<tr><td colspan="4" class="empty">None</td></tr>'}</table></div>`;
    }).join('');
}

export function renderOpen() {
  const activeOpen = db.entries.find(e => e.src === 'open' && e.status === 'posted');
  const isLocked = Boolean(activeOpen && !accountingState.openUnlocked);
  const earliestDate = db.entries.length ? db.entries.map(e => e.date).sort()[0] : today();
  const dt = accountingState.od || (activeOpen ? activeOpen.date : earliestDate);
  const prior = db.entries.filter(e => e.src === 'open' || (e.src === 'rev' && e.rev && db.entries.some(x => x.id === e.rev && x.src === 'open')));

  const openDebits = {};
  const openCredits = {};
  let totalDr = 0;
  if (activeOpen && activeOpen.lines) {
    activeOpen.lines.forEach(l => {
      if (l.d) {
        openDebits[l.a] = l.d;
        totalDr += l.d;
      }
      if (l.c) openCredits[l.a] = l.c;
    });
  }

  // Top Status / Guidance Banner
  let statusBanner = '';
  if (activeOpen && isLocked) {
    statusBanner = `
      <div class="ob-status-card ob-locked-card">
        <div class="ob-card-main">
          <div class="ob-card-icon ob-icon-green">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <div class="ob-card-body">
            <div class="ob-title-wrap">
              <span class="ob-card-title">Opening Balances Recorded &amp; Locked</span>
              <span class="ob-pill ob-pill-green">
                <span class="ob-dot ob-dot-green"></span>
                ACTIVE
              </span>
            </div>
            <div class="ob-meta-row">
              <div class="ob-meta-item">
                <span class="ob-meta-label">Recorded as of</span>
                <b class="ob-meta-val">${activeOpen.date ? activeOpen.date.split('-').reverse().join('/') : ''}</b>
              </div>
              <div class="ob-meta-divider"></div>
              <div class="ob-meta-item">
                <span class="ob-meta-label">Journal Ref</span>
                <b class="ob-meta-val">${activeOpen.ref}</b>
              </div>
              <div class="ob-meta-divider"></div>
              <div class="ob-meta-item ob-meta-total">
                <span class="ob-meta-label">Total Ledger Effect</span>
                <b class="ob-meta-val ob-val-emerald">${fmt(totalDr)}</b>
              </div>
            </div>
          </div>
        </div>
        <div class="ob-actions-row">
          <button type="button" class="btn sm ob-btn-edit" data-a="unlockopen">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
            <span>Edit Balances</span>
          </button>
          <button type="button" class="btn sm ob-btn-rev" data-a="revopen">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <polyline points="1 4 1 10 7 10"></polyline>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            </svg>
            <span>Reverse &amp; Edit</span>
          </button>
        </div>
      </div>`;
  } else if (activeOpen && !isLocked) {
    statusBanner = `
      <div class="ob-status-card ob-edit-card">
        <div class="ob-card-main">
          <div class="ob-card-icon ob-icon-blue">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </div>
          <div class="ob-card-body">
            <div class="ob-title-wrap">
              <span class="ob-card-title">Editing Active Opening Balances</span>
              <span class="ob-pill ob-pill-blue">
                <span class="ob-dot ob-dot-blue"></span>
                EDIT MODE
              </span>
            </div>
            <div class="ob-edit-desc">
              Modify account opening balances below. Changes will sync in-place upon review and confirmation.
            </div>
          </div>
        </div>
        <div class="ob-actions-row">
          <button type="button" class="btn sm ob-btn-cancel" data-a="lockopen">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span>Cancel Edit / Re-lock</span>
          </button>
        </div>
      </div>`;
  } else {
    statusBanner = `
      <div class="ob-status-card" style="background:linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);border:1px solid #e2e8f0;border-left:4px solid #3b82f6;">
        <div class="ob-card-main">
          <div class="ob-card-icon" style="background:#eff6ff;border:1px solid #bfdbfe;color:#2563eb;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
          </div>
          <div class="ob-card-body">
            <div class="ob-card-title">Initialize Opening Ledger Balances</div>
            <div class="ob-edit-desc">
              Enter initial account balances on your BUFIN start date. Standard asset and expense normal balance is <b>Debit</b>; liability, equity, and income is <b>Credit</b>. Any difference automatically balances to <b style="color:#2563eb;">Opening Balance Equity (3200)</b>.
            </div>
          </div>
        </div>
      </div>`;
  }

  const tableRows = db.accounts.filter(a => a.code !== '3200').sort((a, b) => a.code.localeCompare(b.code)).map(a => {
    const isNormD = a.t === 'A' || a.t === 'X';
    const normLabel = isNormD ? 'Normal: Debit' : 'Normal: Credit';
    const normBg = isNormD ? '#eff6ff' : '#f5f3ff';
    const normColor = isNormD ? '#1d4ed8' : '#6d28d9';
    const dVal = openDebits[a.code] ? (openDebits[a.code] / 100).toFixed(2) : '';
    const cVal = openCredits[a.code] ? (openCredits[a.code] / 100).toFixed(2) : '';
    const disabledAttr = isLocked ? 'disabled' : '';
    const dStyle = isNormD ? 'border-color:#93c5fd;background:var(--sf);' : 'background:var(--sf);';
    const cStyle = !isNormD ? 'border-color:#c4b5fd;background:var(--sf);' : 'background:var(--sf);';
    const showUnorthodox = (isNormD && cVal) || (!isNormD && dVal);

    return `
      <tr>
        <td>
          <div class="op-acc-header" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;width:100%;">
            <div style="display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;">
              <b>${esc(an(a.code))}</b>
              <small style="color:var(--t2);">(${a.code})</small>
            </div>
            <div style="display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <span class="pill" style="font-size:10px;padding:2px 6px;border-radius:4px;background:var(--mu);white-space:nowrap;flex-shrink:0;">${TN[a.t]}</span>
              <span style="font-size:10px;padding:2px 6px;border-radius:4px;background:${normBg};color:${normColor};font-weight:600;white-space:nowrap;flex-shrink:0;">${normLabel}</span>
            </div>
          </div>
          <div id="unorthodox_${a.code}" style="display:${showUnorthodox ? 'block' : 'none'};color:#b45309;font-size:11.5px;margin-top:3px;font-weight:500;">
            ⚠️ ${isNormD ? 'Credit balance entered for Asset account (overdraft/contra)' : 'Debit balance entered for Liability/Equity/Income account'}
          </div>
        </td>
        <td>
          <input data-c="${a.code}" data-s="d" inputmode="decimal" placeholder="0.00" value="${dVal}" style="${dStyle}" ${disabledAttr} aria-label="${esc(a.name)} debit">
        </td>
        <td>
          <input data-c="${a.code}" data-s="c" inputmode="decimal" placeholder="0.00" value="${cVal}" style="${cStyle}" ${disabledAttr} aria-label="${esc(a.name)} credit">
        </td>
      </tr>
    `;
  }).join('');

  return head('Opening Balances') +
    statusBanner +
    `<div class="filters"><label>Balances as of<input type="date" id="od" value="${dt}" ${isLocked ? 'disabled' : ''}></label></div>
    <div class="wrap">
      <table>
        <thead>
          <tr>
            <th style="min-width:220px;">Account Name & Normal Balance</th>
            <th class="num" style="width:190px;">Debit (Dr)</th>
            <th class="num" style="width:190px;">Credit (Cr)</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows}
        </tbody>
        <tfoot>
          <tr class="tot">
            <td style="font-weight:600;">
              <div style="font-size:13px;">Totals & Auto-Balancing Status</div>
              <div id="op_diff_stat" style="margin-top:4px;font-size:12px;font-weight:normal;">Calculating...</div>
            </td>
            <td class="num" style="font-size:15px;color:#047857;font-weight:700;">
              <span style="font-size:11px;color:var(--t2);display:block;font-weight:normal;">Total Dr</span>
              <span id="op_tot_dr">₹0.00</span>
            </td>
            <td class="num" style="font-size:15px;color:#1e40af;font-weight:700;">
              <span style="font-size:11px;color:var(--t2);display:block;font-weight:normal;">Total Cr</span>
              <span id="op_tot_cr">₹0.00</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div class="bar" style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
      ${isLocked ? `
        <span style="color:#64748b;font-size:13px;display:flex;align-items:center;gap:7px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <span>Opening balances are locked to prevent accidental modifications.</span>
        </span>
        <button type="button" class="btn sm" data-a="unlockopen" style="background:#ffffff;color:#1e293b;border:1px solid #cbd5e1;font-weight:600;font-size:13px;padding:7px 14px;border-radius:8px;display:inline-flex;align-items:center;gap:7px;box-shadow:0 1px 2px rgba(15,23,42,0.05);cursor:pointer;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
          <span>Unlock &amp; Edit</span>
        </button>
      ` : `
        <span style="color:#64748b;font-size:13px;">
          Review balance summary before posting to ledger.
        </span>
        <button type="button" class="btn p" data-a="promptopen" style="font-weight:600;padding:8px 18px;border-radius:8px;display:inline-flex;align-items:center;gap:7px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>${activeOpen ? 'Review & Update Opening Balances' : 'Review & Post Opening Balances'}</span>
        </button>
      `}
    </div>` +
    (prior.length ? '<h3 style="margin-top:24px;">Posted opening & reversal entries</h3>' + entTable(prior) : '');
}

export function renderJv() {
  const q = (accountingState.jq || '').toLowerCase();
  const L = db.entries.filter(e => !q || (e.narr + e.ref + e.src).toLowerCase().includes(q)).slice().reverse();
  return head('Journal Entries', `<button class="p" data-a="newjv">New journal</button>`) +
    `<div class="filters"><input data-k="jq" placeholder="Search journals" value="${esc(accountingState.jq || '')}"></div>` +
    entTable(L, 'No journals match.');
}

export function renderGl() {
  const u = accountingState.gl;
  const a = acc(u.acc) || db.accounts.find(ac => ac.code === '1000') || db.accounts[0];
  if (a && u.acc !== a.code) u.acc = a.code;

  // Single-pass optimized computation for account entries & opening balance
  const sorted = sortEntries(db.entries);
  let opNet = 0; // pre-period net (Debit - Credit)
  let periodDr = 0;
  let periodCr = 0;
  const accountEntries = [];

  for (const e of sorted) {
    if (!e.lines) continue;
    for (const l of e.lines) {
      if (l.a === a.code) {
        if (u.f && e.date < u.f) {
          opNet += (l.d || 0) - (l.c || 0);
        } else if (!u.t || e.date <= u.t) {
          periodDr += (l.d || 0);
          periodCr += (l.c || 0);
          accountEntries.push({ e, l });
        }
      }
    }
  }

  // Opening balance in account's normal balance orientation (Assets/Expenses: Dr-Cr; Liab/Eq/Inc: Cr-Dr)
  const op = sgn(a, opNet);
  // Closing balance after all period debits and credits
  const closingBalance = op + sgn(a, periodDr - periodCr);

  let run = op;
  let matchedDr = 0;
  let matchedCr = 0;
  let count = 0;
  let rows = '';
  const q = (u.q || '').trim().toLowerCase();

  for (const { e, l } of accountEntries) {
    run += sgn(a, (l.d || 0) - (l.c || 0));

    const party = l.p ? pn(l.p) : (e.lines.find(x => x.p)?.p ? pn(e.lines.find(x => x.p).p) : '');
    const nonAccountLines = e.lines.filter(line => line.a !== a.code);
    const oth = [...new Set(nonAccountLines.map(line => acc(line.a)?.name || an(line.a) || line.a))].join(', ') || 'Direct journal posting';

    if (q) {
      const match = (e.ref || '').toLowerCase().includes(q) ||
        (e.date || '').includes(q) ||
        (e.narr || '').toLowerCase().includes(q) ||
        party.toLowerCase().includes(q) ||
        oth.toLowerCase().includes(q);
      if (!match) continue;
    }

    matchedDr += (l.d || 0);
    matchedCr += (l.c || 0);
    count++;

    const isReversed = e.status === 'reversed';
    const statusBadge = isReversed ? ` <span class="b wn" style="font-size:10px;padding:1px 6px;border-radius:4px;vertical-align:middle;margin-left:4px;">Reversed</span>` : '';
    const details = `<div class="gl-details-block">
      ${party ? `<div class="gl-party-name">${esc(party)}</div>` : ''}
      <div class="gl-narr-text">${esc(e.narr || '—')}${statusBadge}</div>
      <div class="gl-counter-wrap"><span class="gl-counter-badge">${esc(oth)}</span></div>
    </div>`;

    rows += `<tr class="k" data-a="ent" data-i="${e.id}" style="${isReversed ? 'opacity:0.65;background:rgba(239,68,68,0.03);' : ''}">
      <td>${e.date}</td>
      <td><code>${esc(e.ref)}</code></td>
      <td class="gl-details-cell">${details}</td>
      <td class="num">${l.d ? fmt(l.d) : ''}</td>
      <td class="num">${l.c ? fmt(l.c) : ''}</td>
      <td class="num" style="font-weight:600;color:${run < 0 ? '#b91c1c' : 'inherit'};">${fmt(run)}</td>
    </tr>`;
  }

  // Active date preset detection
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const thisMonthStart = `${today().slice(0, 7)}-01`;
  const thisMonthEnd = today();
  const isThisMonth = u.f === thisMonthStart && u.t === thisMonthEnd;

  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const lastMonthStart = `${prevMonthDate.getFullYear()}-${pad(prevMonthDate.getMonth() + 1)}-01`;
  const lastMonthEnd = `${lastDayPrevMonth.getFullYear()}-${pad(lastDayPrevMonth.getMonth() + 1)}-${pad(lastDayPrevMonth.getDate())}`;
  const isLastMonth = u.f === lastMonthStart && u.t === lastMonthEnd;

  const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyStart = `${fyYear}-04-01`;
  const fyEnd = `${fyYear + 1}-03-31`;
  const isThisFy = u.f === fyStart && u.t === fyEnd;
  const isAll = !u.f && !u.t;

  const sortedAccounts = db.accounts.slice().sort((x, y) => x.code.localeCompare(y.code));
  const accOptionsHtml = sortedAccounts.map(ac =>
    `<option value="${esc(ac.code)}"${ac.code === a.code ? ' selected' : ''}>${esc(ac.code)} · ${esc(ac.name)} (${TN[ac.t] || ac.t})</option>`
  ).join('');

  const actions = `<div class="bar-actions" style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="p" data-a="newjv">+ New Journal</button>
    <button data-a="glcsv">Export CSV</button>
  </div>`;

  return head('General Ledger', actions) +
    `<div class="print-only gl-print-header" style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:10px;">
        <div>
          <h1 style="margin:0;font-size:20px;font-weight:700;color:#0f172a;">${esc(db.biz.name || 'BUFIN')}</h1>
          <div style="font-size:12px;color:#475569;margin-top:2px;">
            ${db.biz.gstin ? `GSTIN: ${esc(db.biz.gstin)} · ` : ''}${esc(db.biz.phone || '')}
          </div>
          <div style="font-size:14px;font-weight:700;color:#1e293b;margin-top:8px;letter-spacing:0.5px;">
            GENERAL LEDGER STATEMENT
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:15px;font-weight:700;color:#0f172a;">${esc(a.code)} · ${esc(a.name)}</div>
          <div style="font-size:12px;color:#475569;margin-top:2px;">Account Type: <b>${TN[a.t] || a.t}</b></div>
          <div style="font-size:11.5px;color:#64748b;margin-top:4px;">Period: <b>${u.f || 'Beginning'}</b> to <b>${u.t || 'Present'}</b></div>
        </div>
      </div>
    </div>
    <div class="grid-5">
      ${kpi('Account', `${esc(a.code)} · ${esc(a.name)} (${TN[a.t]})`)}
      ${kpi('Opening Balance', fmt(op))}
      ${kpi('Period Debits', fmt(periodDr))}
      ${kpi('Period Credits', fmt(periodCr))}
      ${kpi('Closing Balance', fmt(closingBalance))}
    </div>
    <div class="gl-account-picker-wrap">
      <div class="gl-account-label-bar">
        <label for="glAccSelect" class="gl-account-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"></path>
          </svg>
          <span>Select Account Dropdown</span>
        </label>
        <span class="gl-account-hint">Switch Account</span>
      </div>
      <div class="gl-select-container">
        <div class="gl-select-icon-left" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"></path>
            <path d="M6 2v14"></path>
          </svg>
        </div>
        <select id="glAccSelect" class="gl-account-select" aria-label="Select Ledger Account">
          ${accOptionsHtml}
        </select>
        <div class="gl-select-chevron-right" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      </div>
    </div>
    <div class="filters gl-filter-bar">
      <div class="mc-chips gl-presets">
        <button class="${isAll ? 'p' : ''}" data-a="glpreset" data-i="all">All Time</button>
        <button class="${isThisMonth ? 'p' : ''}" data-a="glpreset" data-i="month">This Month</button>
        <button class="${isLastMonth ? 'p' : ''}" data-a="glpreset" data-i="lastmonth">Last Month</button>
        <button class="${isThisFy ? 'p' : ''}" data-a="glpreset" data-i="fy">This FY</button>
      </div>
      <div class="mc-row gl-dates">
        <label>
          From <input type="date" id="glFrom" value="${u.f || ''}">
        </label>
        <label>
          To <input type="date" id="glTo" value="${u.t || ''}">
        </label>
      </div>
      <div class="gl-search-wrap" style="width:100%">
        <input data-k="glq" placeholder="Search narration, ref, party, counter-account..." value="${esc(u.q || '')}">
      </div>
    </div>
    <div class="wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Ref</th>
            <th>Details / Narration</th>
            <th class="num">Debit</th>
            <th class="num">Credit</th>
            <th class="num">Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr class="tot gl-opening-row">
            <td colspan="5">
              <div class="gl-op-label-wrap">
                <span class="gl-op-title">Opening balance</span>
                <span class="gl-op-sub">(as of ${u.f || 'period start'})</span>
              </div>
            </td>
            <td class="num gl-op-val" style="font-weight:700;">${fmt(op)}</td>
          </tr>
          ${rows || `<tr><td colspan="6" class="empty">No entries for ${esc(a.name)} in this period.</td></tr>`}
          <tr class="tot gl-closing-row">
            <td colspan="3"><b>Totals / Closing Balance</b>${q ? ` (${count} of ${accountEntries.length} matched)` : ''}</td>
            <td class="num" style="font-weight:700;">${fmt(q ? matchedDr : periodDr)}</td>
            <td class="num" style="font-weight:700;">${fmt(q ? matchedCr : periodCr)}</td>
            <td class="num" style="font-weight:700;color:${closingBalance < 0 ? '#b91c1c' : 'inherit'};">${fmt(closingBalance)}</td>
          </tr>
        </tbody>
      </table>
    </div>`;
}

export function exportGlCsv() {
  const u = accountingState.gl;
  const a = acc(u.acc) || db.accounts.find(ac => ac.code === '1000') || db.accounts[0];
  const sorted = sortEntries(db.entries);
  let opNet = 0;
  let periodDr = 0;
  let periodCr = 0;
  const accountEntries = [];

  for (const e of sorted) {
    if (!e.lines) continue;
    for (const l of e.lines) {
      if (l.a === a.code) {
        if (u.f && e.date < u.f) {
          opNet += (l.d || 0) - (l.c || 0);
        } else if (!u.t || e.date <= u.t) {
          periodDr += (l.d || 0);
          periodCr += (l.c || 0);
          accountEntries.push({ e, l });
        }
      }
    }
  }

  const op = sgn(a, opNet);
  const closingBalance = op + sgn(a, periodDr - periodCr);
  let run = op;
  const q = (u.q || '').trim().toLowerCase();

  const rows = [];
  // Metadata header
  rows.push([`${db.biz.name || 'BUFIN'} - GENERAL LEDGER STATEMENT`]);
  if (db.biz.gstin) rows.push([`GSTIN: ${db.biz.gstin}`]);
  rows.push([`Account: ${a.code} - ${a.name} (${TN[a.t] || a.t})`]);
  rows.push([`Period: ${u.f || 'Beginning'} to ${u.t || 'Present'}`]);
  rows.push([`Exported At: ${new Date().toLocaleString()}`]);
  rows.push([]);

  // Column headers
  rows.push(['Date', 'Reference', 'Details / Narration', 'Party', 'Counter Account', 'Debit', 'Credit', 'Balance']);
  // Opening balance row
  rows.push([u.f || 'Start', '', 'Opening balance', '', '', '', '', (op / 100).toFixed(2)]);

  for (const { e, l } of accountEntries) {
    run += sgn(a, (l.d || 0) - (l.c || 0));

    const party = l.p ? pn(l.p) : (e.lines.find(x => x.p)?.p ? pn(e.lines.find(x => x.p).p) : '');
    const nonAccountLines = e.lines.filter(line => line.a !== a.code);
    const oth = [...new Set(nonAccountLines.map(line => acc(line.a)?.name || an(line.a) || line.a))].join(', ') || 'Direct journal posting';

    if (q) {
      const match = (e.ref || '').toLowerCase().includes(q) ||
        (e.date || '').includes(q) ||
        (e.narr || '').toLowerCase().includes(q) ||
        party.toLowerCase().includes(q) ||
        oth.toLowerCase().includes(q);
      if (!match) continue;
    }

    const narration = (e.narr || '') + (e.status === 'reversed' ? ' [REVERSED]' : '');
    rows.push([
      e.date,
      e.ref,
      narration,
      party,
      oth,
      l.d ? (l.d / 100).toFixed(2) : '',
      l.c ? (l.c / 100).toFixed(2) : '',
      (run / 100).toFixed(2)
    ]);
  }

  // Totals / Closing balance row
  rows.push([u.t || today(), '', 'Totals / Closing Balance', '', '', (periodDr / 100).toFixed(2), (periodCr / 100).toFixed(2), (closingBalance / 100).toFixed(2)]);

  const csv = rows.map(r => r.map(f => '"' + String(f ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
  downloadCSV(csv, `general_ledger_${a.code}_${u.f || 'all'}_to_${u.t || 'all'}`);
  toast(`GL for ${a.name} exported`);
}

export function renderBook() {
  const u = accountingState.cb;
  const cs = cashAcc().map(a => a.code);
  const sl = u.c === 'all' ? cs : [u.c];

  // Chronologically sorted entries
  const sorted = sortEntries(db.entries);

  // Compute opening balance & period entries in a single clean pass
  let op = 0;
  const periodEntries = [];

  for (const e of sorted) {
    if (!e.lines) continue;
    let d = 0, c = 0;
    e.lines.forEach(l => {
      if (sl.includes(l.a)) {
        d += l.d || 0;
        c += l.c || 0;
      }
    });
    if (!d && !c) continue;

    const isOpeningEntry = e.src === 'open';

    if (u.f) {
      if (e.date < u.f) {
        op += (d - c);
      } else if (isOpeningEntry && e.date === u.f) {
        // If opening balance entry was recorded on the From date, include it in opening balance
        op += (d - c);
      } else if (!u.t || e.date <= u.t) {
        periodEntries.push({ e, d, c });
      }
    } else {
      // All Time view: Opening Balances posted via /#/open sit in the starting balance row
      if (isOpeningEntry) {
        op += (d - c);
      } else if (!u.t || e.date <= u.t) {
        periodEntries.push({ e, d, c });
      }
    }
  }

  let run = op;
  let dr = 0, cr = 0, matchedDr = 0, matchedCr = 0, rows = '', count = 0;
  const q = (u.q || '').trim().toLowerCase();

  for (const { e, d, c } of periodEntries) {
    run += d - c;
    dr += d;
    cr += c;

    const partyIds = [...new Set(e.lines.map(l => l.p).filter(Boolean))];
    const partyNames = partyIds.map(pid => pn(pid) || pid).join(', ');
    const nonCashLines = e.lines.filter(l => !sl.includes(l.a));
    const oth = [...new Set(nonCashLines.map(l => acc(l.a)?.name || an(l.a) || l.a))].join(', ') || 'Transfer between selected accounts';

    if (q) {
      const match = (e.ref || '').toLowerCase().includes(q) ||
        (e.date || '').includes(q) ||
        (e.narr || '').toLowerCase().includes(q) ||
        partyNames.toLowerCase().includes(q) ||
        oth.toLowerCase().includes(q);
      if (!match) continue;
    }

    matchedDr += d;
    matchedCr += c;
    count++;

    const isReversed = e.status === 'reversed';
    const statusBadge = isReversed ? ` <span class="b wn" style="font-size:10px;padding:1px 6px;border-radius:4px;vertical-align:middle;margin-left:4px;">Reversed</span>` : '';
    const details = `<div class="gl-details-block">
      ${partyNames ? `<div class="gl-party-name">${esc(partyNames)}</div>` : ''}
      <div class="gl-narr-text">${esc(e.narr || '—')}${statusBadge}</div>
      <div class="gl-counter-wrap"><span class="gl-counter-badge">${esc(oth)}</span></div>
    </div>`;
    rows += `<tr class="k" data-a="ent" data-i="${e.id}" style="${isReversed ? 'opacity:0.65;background:rgba(239,68,68,0.03);' : ''}">
      <td>${e.date}</td>
      <td><code>${esc(e.ref)}</code></td>
      <td class="gl-details-cell">${details}</td>
      <td class="num">${d ? fmt(d) : ''}</td>
      <td class="num">${c ? fmt(c) : ''}</td>
      <td class="num" style="font-weight:600;color:${run < 0 ? '#b91c1c' : 'inherit'};">${fmt(run)}</td>
    </tr>`;
  }

  // Calculate KPIs
  const cashBal = net('1000');
  const bankBal = net('1010');
  const totalLiquid = cashAcc().reduce((s, a) => s + net(a.code), 0);
  const netFlow = dr - cr;

  // Active date preset detection
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const thisMonthStart = `${today().slice(0, 7)}-01`;
  const thisMonthEnd = today();
  const isThisMonth = u.f === thisMonthStart && u.t === thisMonthEnd;

  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastDayPrevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const lastMonthStart = `${prevMonthDate.getFullYear()}-${pad(prevMonthDate.getMonth() + 1)}-01`;
  const lastMonthEnd = `${lastDayPrevMonth.getFullYear()}-${pad(lastDayPrevMonth.getMonth() + 1)}-${pad(lastDayPrevMonth.getDate())}`;
  const isLastMonth = u.f === lastMonthStart && u.t === lastMonthEnd;

  const fyYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyStart = `${fyYear}-04-01`;
  const fyEnd = `${fyYear + 1}-03-31`;
  const isThisFy = u.f === fyStart && u.t === fyEnd;
  const isAll = !u.f && !u.t;

  const actions = `<div class="bar-actions cb-bar-actions" style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="p" data-a="newin">+ Money In</button>
    <button data-a="newout">- Money Out</button>
    <button data-a="newxfer">⇄ Transfer</button>
    <button data-a="bkcsv">Export CSV</button>
  </div>`;

  return head('Cash and Bank Book', actions, 'cb-header-bar') +
    `<div class="print-only book-print-header" style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:10px;">
        <div>
          <h1 style="margin:0;font-size:20px;font-weight:700;color:#0f172a;">${esc(db.biz.name || 'BUFIN')}</h1>
          <div style="font-size:12px;color:#475569;margin-top:2px;">
            ${db.biz.gstin ? `GSTIN: ${esc(db.biz.gstin)} · ` : ''}${esc(db.biz.phone || '')}
          </div>
          <div style="font-size:14px;font-weight:700;color:#1e293b;margin-top:8px;letter-spacing:0.5px;">
            CASH AND BANK BOOK STATEMENT
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:15px;font-weight:700;color:#0f172a;">${u.c === 'all' ? 'All Cash & Bank Accounts' : an(u.c)}</div>
          <div style="font-size:11.5px;color:#64748b;margin-top:4px;">Period: <b>${u.f || 'Beginning'}</b> to <b>${u.t || 'Present'}</b></div>
        </div>
      </div>
    </div>
    <div class="grid-6">
      ${kpi('Total Cash & Bank', fmt(totalLiquid))}
      ${kpi('Cash in Hand', fmt(cashBal))}
      ${kpi('Bank Balance', fmt(bankBal))}
      ${kpi('Period Inflow', fmt(dr))}
      ${kpi('Period Outflow', fmt(cr))}
      ${kpi('Net Period Flow', fmt(netFlow))}
    </div>
    <div class="mc-chips cb-acc-filters" style="margin-bottom:8px">
      ${[['all', 'All cash and bank']].concat(cashAcc().map(a => [a.code, a.name])).map(x => `<button class="${u.c === x[0] ? 'p' : ''}" data-a="bk" data-i="${x[0]}">${esc(x[1])}</button>`).join('')}
    </div>
    <div class="filters cb-filter-bar">
      <div class="mc-chips cb-presets">
        <button class="${isAll ? 'p' : ''}" data-a="bkpreset" data-i="all">All Time</button>
        <button class="${isThisMonth ? 'p' : ''}" data-a="bkpreset" data-i="month">This Month</button>
        <button class="${isLastMonth ? 'p' : ''}" data-a="bkpreset" data-i="lastmonth">Last Month</button>
        <button class="${isThisFy ? 'p' : ''}" data-a="bkpreset" data-i="fy">This FY</button>
      </div>
      <div class="mc-row cb-dates">
        <label>
          From <input type="date" id="bookFrom" value="${u.f || ''}">
        </label>
        <label>
          To <input type="date" id="bookTo" value="${u.t || ''}">
        </label>
      </div>
      <div class="cb-search-wrap" style="width:100%">
        <input data-k="bkq" placeholder="Search narration, ref, party, account..." value="${esc(u.q || '')}">
      </div>
    </div>
    <div class="wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Ref</th>
            <th>Details</th>
            <th class="num">Money in</th>
            <th class="num">Money out</th>
            <th class="num">Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr class="tot book-opening-row gl-opening-row">
            <td colspan="5">
              <div class="gl-op-label-wrap">
                <span class="gl-op-title">Opening balance</span>
                <span class="gl-op-sub">(as of ${u.f || 'period start'})</span>
              </div>
            </td>
            <td class="num gl-op-val" style="font-weight:700;">${fmt(op)}</td>
          </tr>
          ${rows || '<tr><td colspan="6" class="empty">No cash or bank transactions in this period.</td></tr>'}
          <tr class="tot book-closing-row gl-closing-row">
            <td colspan="3"><b>Totals / Closing Balance</b>${q ? ` (${count} of ${periodEntries.length} matched)` : ''}</td>
            <td class="num" style="font-weight:700;">${fmt(q ? matchedDr : dr)}</td>
            <td class="num" style="font-weight:700;">${fmt(q ? matchedCr : cr)}</td>
            <td class="num" style="font-weight:700;color:${run < 0 ? '#b91c1c' : 'inherit'};">${fmt(run)}</td>
          </tr>
        </tbody>
      </table>
    </div>`;
}

export function exportBookCsv() {
  const u = accountingState.cb;
  const cs = cashAcc().map(a => a.code);
  const sl = u.c === 'all' ? cs : [u.c];

  const sorted = sortEntries(db.entries);
  let op = 0;
  const periodEntries = [];

  for (const e of sorted) {
    if (!e.lines) continue;
    let d = 0, c = 0;
    e.lines.forEach(l => {
      if (sl.includes(l.a)) {
        d += l.d || 0;
        c += l.c || 0;
      }
    });
    if (!d && !c) continue;

    const isOpeningEntry = e.src === 'open';

    if (u.f) {
      if (e.date < u.f) {
        op += (d - c);
      } else if (isOpeningEntry && e.date === u.f) {
        op += (d - c);
      } else if (!u.t || e.date <= u.t) {
        periodEntries.push({ e, d, c });
      }
    } else {
      if (isOpeningEntry) {
        op += (d - c);
      } else if (!u.t || e.date <= u.t) {
        periodEntries.push({ e, d, c });
      }
    }
  }

  let run = op;
  let totIn = 0, totOut = 0;
  const q = (u.q || '').trim().toLowerCase();

  const rows = [];
  rows.push([`${db.biz.name || 'BUFIN'} - CASH AND BANK BOOK STATEMENT`]);
  if (db.biz.gstin) rows.push([`GSTIN: ${db.biz.gstin}`]);
  rows.push([`Account: ${u.c === 'all' ? 'All Cash and Bank Accounts' : an(u.c)}`]);
  rows.push([`Period: ${u.f || 'Beginning'} to ${u.t || 'Present'}`]);
  rows.push([`Exported At: ${new Date().toLocaleString()}`]);
  rows.push([]);

  rows.push(['Date', 'Reference', 'Details / Narration', 'Party', 'Counter Account', 'Money In (₹)', 'Money Out (₹)', 'Balance (₹)']);
  rows.push([u.f || 'Start', '', 'Opening balance', '', '', '', '', (op / 100).toFixed(2)]);

  for (const { e, d, c } of periodEntries) {
    run += d - c;

    const partyIds = [...new Set(e.lines.map(l => l.p).filter(Boolean))];
    const partyNames = partyIds.map(pid => pn(pid) || pid).join(', ');
    const nonCashLines = e.lines.filter(l => !sl.includes(l.a));
    const oth = [...new Set(nonCashLines.map(l => acc(l.a)?.name || an(l.a) || l.a))].join(', ') || 'Transfer between selected accounts';

    if (q) {
      const match = (e.ref || '').toLowerCase().includes(q) ||
        (e.date || '').includes(q) ||
        (e.narr || '').toLowerCase().includes(q) ||
        partyNames.toLowerCase().includes(q) ||
        oth.toLowerCase().includes(q);
      if (!match) continue;
    }

    totIn += d;
    totOut += c;
    const narration = (e.narr || '') + (e.status === 'reversed' ? ' [REVERSED]' : '');

    rows.push([
      e.date,
      e.ref,
      narration,
      partyNames,
      oth,
      d ? (d / 100).toFixed(2) : '',
      c ? (c / 100).toFixed(2) : '',
      (run / 100).toFixed(2)
    ]);
  }

  rows.push([u.t || today(), '', 'Totals / Closing Balance', '', '', (totIn / 100).toFixed(2), (totOut / 100).toFixed(2), (run / 100).toFixed(2)]);

  const csv = rows.map(r => r.map(f => '"' + String(f ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
  downloadCSV(csv, 'cash_and_bank_book');
  toast('Cash & Bank Book CSV exported');
}

