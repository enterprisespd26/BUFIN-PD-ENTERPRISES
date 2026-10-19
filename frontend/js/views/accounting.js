import { esc, fmt, today, prev, head, kpi, toast } from '../modules/utils.js';
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
      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:14px 18px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-size:26px;">🔒</span>
          <div>
            <div style="display:flex;align-items:center;gap:8px;">
              <b style="color:#065f46;font-size:14.5px;">Opening Balances Recorded & Locked</b>
              <span class="pill" style="font-size:10.5px;padding:2px 8px;border-radius:99px;background:#059669;color:#fff;font-weight:700;">ACTIVE</span>
            </div>
            <div style="color:#047857;font-size:12.5px;margin-top:2px;">
              Recorded as of <b>${activeOpen.date}</b> · Journal Ref: <b>${activeOpen.ref}</b> · Total Ledger Effect: <b>${fmt(totalDr)}</b>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button type="button" class="btn sm" data-a="unlockopen" style="font-weight:600;display:inline-flex;align-items:center;gap:6px;">
            <span>✏️</span> <span>Edit Balances</span>
          </button>
          <button type="button" class="btn d sm" data-a="revopen" style="font-weight:600;display:inline-flex;align-items:center;gap:6px;">
            <span>↩️</span> <span>Reverse & Edit</span>
          </button>
        </div>
      </div>`;
  } else if (activeOpen && !isLocked) {
    statusBanner = `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:12px 16px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:22px;">✏️</span>
          <div>
            <b style="color:#1e40af;font-size:14px;">Editing Active Opening Balances</b>
            <div style="color:#1d4ed8;font-size:12.5px;margin-top:1px;">
              Modify your opening balances below. Changes will sync in-place upon review and confirmation.
            </div>
          </div>
        </div>
        <button type="button" class="btn alt sm" data-a="lockopen">Cancel Edit / Re-lock</button>
      </div>`;
  } else {
    statusBanner = `
      <div class="warn" style="padding:10px 14px;line-height:1.6;font-size:13px;border-radius:8px;margin-bottom:18px;">
        💡 <b>Smart Opening Balances</b>: Enter initial account balances on your BUFIN start date. Standard asset and expense normal balance is <b>Debit</b>; liability, equity, and income is <b>Credit</b>. Any difference automatically balances to <b>Opening Balance Equity (3200)</b>.
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
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <b>${esc(an(a.code))}</b>
            <small style="color:var(--t2);">(${a.code})</small>
            <span class="pill" style="font-size:10px;padding:1px 6px;border-radius:4px;background:var(--mu);">${TN[a.t]}</span>
            <span style="font-size:10px;padding:1px 6px;border-radius:4px;background:${normBg};color:${normColor};font-weight:600;">${normLabel}</span>
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
        <span style="color:var(--t2);font-size:13px;display:flex;align-items:center;gap:6px;">
          <span>🔒</span> <span>Opening balances are locked to prevent accidental modifications.</span>
        </span>
        <button type="button" class="btn sm" data-a="unlockopen">✏️ Unlock & Edit</button>
      ` : `
        <span style="color:var(--t2);font-size:13px;">
          Review balance summary before posting to ledger.
        </span>
        <button type="button" class="btn p" data-a="promptopen">
          ${activeOpen ? 'Review & Update Opening Balances' : 'Review & Post Opening Balances'}
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
    const statusBadge = isReversed ? ` <span class="b wn" style="font-size:10px;padding:1px 6px;border-radius:4px;">Reversed</span>` : '';
    const details = `${party ? `<b style="color:var(--tx)">${esc(party)}</b><br>` : ''}${esc(e.narr || '—')}${statusBadge}<br><small style="color:var(--t2)">${esc(oth)}</small>`;

    rows += `<tr class="k" data-a="ent" data-i="${e.id}" style="${isReversed ? 'opacity:0.65;background:rgba(239,68,68,0.03);' : ''}">
      <td>${e.date}</td>
      <td><code>${esc(e.ref)}</code></td>
      <td>${details}</td>
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
    <div class="filters" style="margin-bottom:8px">
      <select id="glAccSelect" style="width:100%;font-weight:600;padding:6px 10px;">${accOptionsHtml}</select>
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
          <tr class="tot">
            <td colspan="5"><b>Opening balance</b> (as of ${u.f || 'period start'})</td>
            <td class="num" style="font-weight:700;">${fmt(op)}</td>
          </tr>
          ${rows || `<tr><td colspan="6" class="empty">No entries for ${esc(a.name)} in this period.</td></tr>`}
          <tr class="tot">
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
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `general_ledger_${a.code}_${u.f || 'all'}_to_${u.t || 'all'}_${today()}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
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
    const statusBadge = isReversed ? ` <span class="b wn" style="font-size:10px;padding:1px 6px;border-radius:4px;">Reversed</span>` : '';
    const details = `${partyNames ? `<b style="color:var(--tx)">${esc(partyNames)}</b><br>` : ''}${esc(e.narr || '—')}${statusBadge}<br><small style="color:var(--t2)">${esc(oth)}</small>`;
    rows += `<tr class="k" data-a="ent" data-i="${e.id}" style="${isReversed ? 'opacity:0.65;background:rgba(239,68,68,0.03);' : ''}">
      <td>${e.date}</td>
      <td><code>${esc(e.ref)}</code></td>
      <td>${details}</td>
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

  const actions = `<div class="bar-actions" style="display:flex;gap:8px;flex-wrap:wrap">
    <button class="p" data-a="newin">+ Money In</button>
    <button data-a="newout">- Money Out</button>
    <button data-a="newxfer">⇄ Transfer</button>
    <button data-a="bkcsv">Export CSV</button>
  </div>`;

  return head('Cash and Bank Book', actions) +
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
    <div class="filters mc-chips cb-acc-filters" style="margin-bottom:8px">
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
          <tr class="tot">
            <td colspan="5"><b>Opening balance</b> (as of ${u.f || 'period start'})</td>
            <td class="num" style="font-weight:700;">${fmt(op)}</td>
          </tr>
          ${rows || '<tr><td colspan="6" class="empty">No cash or bank transactions in this period.</td></tr>'}
          <tr class="tot">
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
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cash_and_bank_book_${today()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Cash & Bank Book CSV exported');
}

