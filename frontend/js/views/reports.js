import { esc, fmt, today, head, kpi, toast } from '../modules/utils.js';
import { db, TN, acc, net, sgn } from '../modules/state.js';

export const reportsState = {
  pl: { f: today().slice(0, 8) + '01', t: today(), view: 'both' },
  bs: { t: today() },
  tb: { t: today(), all: false, q: '' }
};

function getMonthEnd() {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const pad = n => String(n).padStart(2, '0');
  return `${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}`;
}

function getFyEnd() {
  const now = new Date();
  const fyYear = now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear();
  return `${fyYear}-03-31`;
}

// ==========================================
// 1. TRIAL BALANCE MODULE
// ==========================================

export function renderTb() {
  const u = reportsState.tb;
  const t = u.t || today();
  const q = (u.q || '').trim().toLowerCase();
  let D = 0, C = 0, activeCount = 0;
  const overdrawnAssets = [];
  const abnormalAccounts = [];

  const sortedAccounts = db.accounts.slice().sort((a, b) => a.code.localeCompare(b.code));

  const rows = sortedAccounts.map(a => {
    const n = net(a.code, '', t);
    const hasBal = n !== 0;
    if (hasBal) activeCount++;
    if (!u.all && !hasBal) return '';

    if (q) {
      const match = a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || (TN[a.t] || '').toLowerCase().includes(q);
      if (!match) return '';
    }

    if (n > 0) D += n;
    else if (n < 0) C -= n;

    const isAssetOrExpense = 'AX'.includes(a.t);
    let badges = [];
    let debitCell = '';
    let creditCell = '';

    if (n === 0) {
      debitCell = '<span style="color:var(--t2);">—</span>';
      creditCell = '<span style="color:var(--t2);">—</span>';
    } else if (isAssetOrExpense) {
      // Normal balance rule: DEBIT
      if (n > 0) {
        debitCell = fmt(n);
      } else {
        // Abnormal Credit balance
        creditCell = fmt(-n);
        if (a.t === 'A') {
          overdrawnAssets.push({ code: a.code, name: a.name, bal: -n });
          badges.push(`<span class="pill" style="font-size:10.5px;font-weight:700;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;padding:2px 7px;border-radius:4px;margin-left:6px;display:inline-flex;align-items:center;gap:3px;" title="Asset carries a negative credit balance. Standard assets require a debit normal balance.">⚠️ Overdrawn Asset</span>`);
          creditCell = `<span style="color:#b91c1c;font-weight:700;">${fmt(-n)}</span> <span class="pill" style="font-size:9.5px;font-weight:600;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;padding:1px 5px;border-radius:3px;margin-left:4px;">Overdrawn (Cr)</span>`;
        } else {
          badges.push(`<span class="pill" style="font-size:10.5px;font-weight:700;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;padding:2px 7px;border-radius:4px;margin-left:6px;">⚠️ Negative Expense</span>`);
          creditCell = `<span style="color:#b91c1c;font-weight:600;">${fmt(-n)}</span>`;
        }
      }
    } else {
      // Liability, Equity, Income: Normal balance is CREDIT
      if (n < 0) {
        creditCell = fmt(-n);
      } else {
        // Abnormal Debit balance
        debitCell = fmt(n);
        abnormalAccounts.push({ code: a.code, name: a.name, bal: n, type: TN[a.t] });
        badges.push(`<span class="pill" style="font-size:10.5px;font-weight:600;background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;padding:2px 6px;border-radius:4px;margin-left:6px;" title="Account has an abnormal debit balance">⚠️ Debit Balance</span>`);
        debitCell = `<span style="color:#1e40af;font-weight:600;">${fmt(n)}</span>`;
      }
    }

    return `<tr class="k" data-a="gl" data-i="${a.code}">
      <td>
        <b>${esc(a.name)}</b> <small style="color:var(--t2);">(${a.code})</small>
        ${badges.join('')}
      </td>
      <td><span class="b">${TN[a.t]}</span></td>
      <td class="num">${debitCell}</td>
      <td class="num">${creditCell}</td>
    </tr>`;
  }).join('');

  const isBalanced = D === C;
  const diff = Math.abs(D - C);

  const actions = `<div style="display:flex;gap:8px;flex-wrap:wrap">
    <button data-a="tbcsv">Export CSV</button>
    <button onclick="window.print()">Print</button>
  </div>`;

  const overdrawnBanner = overdrawnAssets.length ? `
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #ea580c;border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:flex-start;gap:12px;">
      <span style="font-size:20px;line-height:1;margin-top:2px;">⚠️</span>
      <div style="flex:1;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <h4 style="margin:0;font-size:13.5px;font-weight:700;color:#9a3412;">Audit Warning: Overdrawn Asset Accounts Detected (${overdrawnAssets.length})</h4>
          <span class="pill" style="font-size:11px;background:#ffedd5;color:#9a3412;border:1px solid #fdba74;padding:2px 8px;border-radius:99px;font-weight:600;">Liquidity Anomaly</span>
        </div>
        <p style="margin:5px 0 8px 0;font-size:12.5px;color:#7c2d12;line-height:1.5;">
          Standard asset accounts (e.g. Cash and Bank) carry a normal <b>Debit</b> balance. The following asset account${overdrawnAssets.length > 1 ? 's have' : ' has'} negative liquidity sitting on the Credit side:
        </p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
          ${overdrawnAssets.map(oa => `
            <span style="font-size:12px;background:#ffffff;border:1px solid #fed7aa;border-radius:6px;padding:3px 9px;color:#9a3412;font-weight:600;display:inline-flex;align-items:center;gap:6px;">
              <span>${esc(oa.name)} (${oa.code})</span>
              <span style="color:#b91c1c;font-weight:700;">-${fmt(oa.bal)}</span>
            </span>
          `).join('')}
        </div>
        <div style="font-size:12px;color:#9a3412;">
          👉 <b>Recommended Action</b>: Physical cash and positive bank balances cannot be negative. Please set initial balances in <a href="#/open" style="color:#c2410c;font-weight:700;text-decoration:underline;">Opening Balances</a> or record unposted receipts in <a href="#/book" style="color:#c2410c;font-weight:700;text-decoration:underline;">Cash and Bank Book</a>.
        </div>
      </div>
    </div>
  ` : '';

  const printHeader = `
    <div class="print-only" style="margin-bottom:14px;border-bottom:2px solid #0f172a;padding-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <h2 style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">${esc(db.biz.name || 'BUFIN Business Ledger')}</h2>
          ${db.biz.gstin ? `<div style="font-size:12px;color:#475569;">GSTIN: <b>${esc(db.biz.gstin)}</b></div>` : ''}
        </div>
        <div style="text-align:right;">
          <h3 style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">Trial Balance</h3>
          <div style="font-size:12px;color:#475569;">As of: <b>${t}</b></div>
        </div>
      </div>
    </div>
  `;

  return head('Trial Balance', actions) +
    printHeader +
    `<div class="grid">
      ${kpi('Total Debits', fmt(D))}
      ${kpi('Total Credits', fmt(C))}
      ${kpi('Balance Status', isBalanced 
        ? `<span style="color:var(--ok);font-weight:600;">✓ Balanced</span>${overdrawnAssets.length ? ` <span style="font-size:11px;color:#ea580c;display:block;">(${overdrawnAssets.length} asset warning${overdrawnAssets.length > 1 ? 's' : ''})</span>` : ''}` 
        : `<span style="color:var(--rd);font-weight:700;">⚠ Diff: ${fmt(diff)}</span>`)}
      ${kpi('Active Accounts', `${activeCount} with balance <small style="color:var(--t2);">(${sortedAccounts.length} total)</small>`)}
    </div>` +
    overdrawnBanner +
    `<div class="filters" style="align-items:center">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="${t === today() ? 'p' : ''}" data-a="tbpreset" data-i="today">Today</button>
        <button class="${t === getMonthEnd() ? 'p' : ''}" data-a="tbpreset" data-i="monthend">Month End</button>
        <button class="${t === getFyEnd() ? 'p' : ''}" data-a="tbpreset" data-i="fyend">FY End</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <label style="display:flex;align-items:center;gap:6px;margin:0;font-size:12px;color:var(--t2)">
          As of <input type="date" id="tbDate" value="${t}" style="width:auto">
        </label>
      </div>
      <div style="display:flex;gap:6px">
        <button class="${!u.all ? 'p' : ''}" data-a="tbtoggle" data-i="active">With Balance</button>
        <button class="${u.all ? 'p' : ''}" data-a="tbtoggle" data-i="all">All Accounts</button>
      </div>
      <div style="flex:1;min-width:180px">
        <input data-k="tbq" placeholder="Search account..." value="${esc(u.q || '')}">
      </div>
    </div>
    <div class="wrap">
      <table>
        <thead>
          <tr>
            <th>Account Name</th>
            <th>Type</th>
            <th class="num">Debit (Dr)</th>
            <th class="num">Credit (Cr)</th>
          </tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="4" class="empty">No accounts match the criteria.</td></tr>'}
          <tr class="tot">
            <td colspan="2">Total ${isBalanced ? '<span class="b ok">Balanced</span>' : `<span class="b rd">Out of Balance (${fmt(diff)})</span>`}</td>
            <td class="num">${fmt(D)}</td>
            <td class="num">${fmt(C)}</td>
          </tr>
        </tbody>
      </table>
    </div>`;
}

export function exportTbCsv() {
  const u = reportsState.tb;
  const t = u.t || today();
  const q = (u.q || '').trim().toLowerCase();
  let D = 0, C = 0;

  const rows = [
    ['BUFIN Business Ledger - Trial Balance'],
    [`Business Name: ${db.biz.name || 'BUFIN'}${db.biz.gstin ? ' | GSTIN: ' + db.biz.gstin : ''}`],
    [`As of Date: ${t}`],
    [`Filter: ${u.all ? 'All Accounts' : 'Accounts with Balance Only'}`],
    [],
    ['Account Code', 'Account Name', 'Account Type', 'Debit (₹)', 'Credit (₹)', 'Audit Note']
  ];

  db.accounts.slice().sort((a, b) => a.code.localeCompare(b.code)).forEach(a => {
    const n = net(a.code, '', t);
    if (!u.all && !n) return;
    if (q) {
      const match = a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || (TN[a.t] || '').toLowerCase().includes(q);
      if (!match) return;
    }
    if (n > 0) D += n;
    else if (n < 0) C -= n;

    let auditNote = '';
    if ('AX'.includes(a.t) && n < 0) {
      auditNote = a.t === 'A' ? '⚠️ Overdrawn Asset (Abnormal Credit Balance)' : '⚠️ Negative Expense (Abnormal Credit)';
    } else if ('LEI'.includes(a.t) && n > 0) {
      auditNote = '⚠️ Abnormal Debit Balance';
    }

    rows.push([
      a.code,
      a.name,
      TN[a.t] || a.t,
      n > 0 ? (n / 100).toFixed(2) : (n === 0 ? '0.00' : ''),
      n < 0 ? (-n / 100).toFixed(2) : (n === 0 ? '0.00' : ''),
      auditNote
    ]);
  });

  const isBalanced = D === C;
  rows.push([]);
  rows.push([
    'Total',
    isBalanced ? 'Balanced' : `Out of Balance (Diff: ${((Math.abs(D - C)) / 100).toFixed(2)})`,
    '',
    (D / 100).toFixed(2),
    (C / 100).toFixed(2),
    isBalanced ? 'Verified Balanced' : '⚠️ OUT OF BALANCE'
  ]);

  const csv = rows.map(r => r.map(f => '"' + String(f ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trial_balance_${t}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Trial Balance CSV exported');
}

// ==========================================
// 2. PROFIT AND LOSS MODULE
// ==========================================

const PL_COLORS = {
  rev: '#0d9488',
  cogs: '#d97706',
  gp: '#16a34a',
  opx: '#6366f1',
  oi: '#0891b2',
  int: '#64748b',
  profit: '#2563eb',
  loss: '#dc2626'
};

const dmy = s => (s || '').split('-').reverse().join('/');
const plPeriod = u => `${u.f ? dmy(u.f) : 'Beginning'} – ${dmy(u.t)}`;

// All P&L numbers in one place (used by the page, the chart and the PNG export)
function getPlData() {
  const u = reportsState.pl;
  const v = c => sgn(acc(c.code), net(c.code, u.f, u.t));
  const S = f => db.accounts.filter(f).map(a => [a, v(a)]).filter(x => x[1]);

  const rev = S(a => /^4[01]/.test(a.code));
  const cogs = S(a => a.code === '5000');
  const opx = S(a => a.t === 'X' && !['5000', '5500'].includes(a.code));
  const oi = S(a => a.t === 'I' && !/^4[01]/.test(a.code));
  const int = S(a => a.code === '5500');

  const sum = l => l.reduce((s, x) => s + x[1], 0);
  const revT = sum(rev);
  const cogsT = sum(cogs);
  const opxT = sum(opx);
  const oiT = sum(oi);
  const intT = sum(int);
  const gp = revT - cogsT;
  const np = gp - opxT + oiT - intT;

  return { u, rev, cogs, opx, oi, int, revT, cogsT, opxT, oiT, intT, gp, np };
}

// Rows for the horizontal summary bars (also used by the PNG export)
function plBars(d) {
  const bars = [
    { k: 'Revenue', v: d.revT, c: PL_COLORS.rev },
    { k: 'Cost of goods sold', v: d.cogsT, c: PL_COLORS.cogs },
    { k: 'Gross profit', v: d.gp, c: PL_COLORS.gp },
    { k: 'Operating expenses', v: d.opxT, c: PL_COLORS.opx }
  ];
  if (d.oiT) bars.push({ k: 'Other income', v: d.oiT, c: PL_COLORS.oi });
  if (d.intT) bars.push({ k: 'Interest expense', v: d.intT, c: PL_COLORS.int });
  bars.push({ k: d.np >= 0 ? 'Net profit' : 'Net loss', v: d.np, c: d.np >= 0 ? PL_COLORS.profit : PL_COLORS.loss });
  return bars;
}

// Slices for the donut (also used by the PNG export)
function plSegs(d) {
  return [
    { label: 'Cost of goods sold', val: d.cogsT, c: PL_COLORS.cogs },
    { label: 'Operating expenses', val: d.opxT, c: PL_COLORS.opx },
    { label: 'Interest expense', val: d.intT, c: PL_COLORS.int },
    { label: 'Net profit', val: Math.max(0, d.np), c: PL_COLORS.profit }
  ].filter(s => s.val > 0);
}

const PL_CSS = `
.plx-root .print-only { display: none; }
.plx-sub { margin: -4px 0 16px; font-size: 13px; color: var(--t2); display: flex; flex-wrap: wrap; gap: 4px 16px; }
.plx-sub b { color: var(--tx); font-weight: 600; }

/* Filters */
.plx-filters { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; margin-bottom: 16px; }
.plx-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.plx-dates { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.plx-dates label { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 12px; color: var(--t2); }
.plx-dates input { width: auto; }
.plx-seg { display: inline-flex; margin-left: auto; border: 1px solid var(--bd); border-radius: 8px; overflow: hidden; background: var(--sf); }
.plx-seg button { border: 0; border-right: 1px solid var(--bd); border-radius: 0; margin: 0; box-shadow: none; white-space: nowrap; }
.plx-seg button:last-child { border-right: 0; }

/* KPI cards */
.plx-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.plx-kpi { background: var(--sf); border: 1px solid var(--bd); border-top: 3px solid var(--kc, var(--bd)); border-radius: 10px; padding: 12px 14px; min-width: 0; }
.plx-kpi span { display: block; font-size: 11px; font-weight: 600; color: var(--t2); text-transform: uppercase; letter-spacing: .5px; }
.plx-kpi b { display: block; margin-top: 4px; font-size: 19px; font-weight: 700; color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.plx-kpi small { display: block; margin-top: 2px; font-size: 11.5px; color: var(--t2); }

/* Cards + charts */
.plx-card { background: var(--sf); border: 1px solid var(--bd); border-radius: 12px; padding: 16px 18px; min-width: 0; }
.plx-card h3 { margin: 0 0 2px; font-size: 14.5px; font-weight: 700; }
.plx-hint { margin: 0 0 14px; font-size: 12px; color: var(--t2); }
.plx-charts { position: relative; display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 14px; margin-bottom: 16px; }

.plx-bar { padding: 8px 0; }
.plx-bar + .plx-bar { border-top: 1px dashed var(--bd); }
.plx-bar-top { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 6px; }
.plx-bar-name { font-size: 13px; font-weight: 600; color: var(--tx); }
.plx-bar-val { font-size: 13px; font-weight: 700; color: var(--tx); font-variant-numeric: tabular-nums; white-space: nowrap; }
.plx-bar-val em { font-style: normal; font-weight: 500; font-size: 11.5px; color: var(--t2); margin-left: 6px; }
.plx-track { height: 10px; background: var(--mu); border-radius: 99px; overflow: hidden; }
.plx-fill { height: 100%; border-radius: 99px; }

.plx-donut-wrap { display: flex; flex-direction: column; align-items: center; gap: 14px; }
.plx-donut { width: 100%; max-width: 190px; height: auto; display: block; }
.plx-donut .donut-slice { cursor: pointer; transition: opacity .15s; }
.plx-donut .donut-slice:hover { opacity: .8; }
.plx-legend { width: 100%; }
.plx-legend-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px dashed var(--bd); font-size: 12.5px; }
.plx-legend-row:last-child { border-bottom: 0; }
.plx-legend-l { display: flex; align-items: center; gap: 8px; font-weight: 600; min-width: 0; }
.plx-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
.plx-legend-r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.plx-legend-r em { font-style: normal; color: var(--t2); font-size: 11.5px; margin-left: 4px; }
.plx-insight { width: 100%; padding: 9px 12px; background: var(--mu); border-radius: 8px; font-size: 12px; color: var(--t2); line-height: 1.5; }
.plx-empty { font-size: 12.5px; color: var(--t2); padding: 10px 0; }

.plx-tip { display: none; position: absolute; z-index: 20; pointer-events: none; background: #0f172a; color: #fff; padding: 7px 11px; border-radius: 8px; box-shadow: 0 6px 20px rgba(0,0,0,.25); }

/* Statement table */
.plx-tablecard { padding: 0; overflow: hidden; }
.plx-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
.plx-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.plx-table th { text-align: left; padding: 10px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: var(--t2); background: var(--mu); border-bottom: 1px solid var(--bd); }
.plx-table td { padding: 9px 16px; border-bottom: 1px solid var(--bd); }
.plx-table .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.plx-sec td { font-weight: 700; padding-top: 13px; }
.plx-item td { color: var(--t2); }
.plx-item td:first-child { padding-left: 34px; }
.plx-zero td { opacity: .55; }
.plx-key td { font-weight: 700; background: var(--mu); }
.plx-net td { font-weight: 800; font-size: 15px; border-top: 2px solid var(--tx); border-bottom: 0; }
.plx-pos { color: #16a34a; }
.plx-neg { color: #dc2626; }

/* Tablet */
@media (max-width: 900px) {
  .plx-charts { grid-template-columns: minmax(0, 1fr); }
  .plx-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

/* Mobile */
@media (max-width: 640px) {
  .plx-filters { gap: 10px; }
  .plx-chips { flex-wrap: nowrap; overflow-x: auto; width: 100%; padding-bottom: 2px; -webkit-overflow-scrolling: touch; }
  .plx-chips button { flex-shrink: 0; }
  .plx-dates { width: 100%; }
  .plx-dates label { flex: 1; min-width: 0; }
  .plx-dates input { width: 100%; min-width: 0; }
  .plx-seg { display: flex; width: 100%; margin-left: 0; }
  .plx-seg button { flex: 1; padding-left: 6px; padding-right: 6px; }
  .plx-kpi { padding: 10px 12px; }
  .plx-kpi b { font-size: 16px; }
  .plx-card { padding: 14px; }
  .plx-table { font-size: 13px; }
  .plx-table th, .plx-table td { padding: 8px 12px; }
  .plx-item td:first-child { padding-left: 22px; }
}
@media (max-width: 520px) {
  .plx-pc { display: none; }
}

@media print {
  .plx-root .print-only { display: block; }
  .plx-noprint, .plx-sub { display: none !important; }
  .plx-card, .plx-kpi { box-shadow: none; break-inside: avoid; }
  .plx-charts { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); }
  .plx-kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
`;

function buildPlCharts(d) {
  const { revT, cogsT, opxT, intT, np } = d;

  const bars = plBars(d);
  const maxV = Math.max(...bars.map(b => Math.abs(b.v)), 1);
  const barsHtml = bars.map(b => {
    const w = b.v === 0 ? 0 : Math.max(1.5, (Math.abs(b.v) / maxV) * 100);
    const p = revT > 0 ? ((b.v / revT) * 100).toFixed(1) + '%' : '—';
    return `
      <div class="plx-bar chart-bar-group" data-label="${esc(b.k)}" data-val="${esc(fmt(b.v))}" data-pct="${p}">
        <div class="plx-bar-top">
          <span class="plx-bar-name">${esc(b.k)}</span>
          <span class="plx-bar-val">${fmt(b.v)}<em>${p}</em></span>
        </div>
        <div class="plx-track"><div class="plx-fill" style="width:${w}%;background:${b.c}"></div></div>
      </div>`;
  }).join('');

  const segs = plSegs(d);
  const tot = segs.reduce((s, x) => s + x.val, 0);
  const R = 42;
  const CIRC = 2 * Math.PI * R;
  let off = 0;
  const arcs = segs.map(s => {
    const len = (s.val / tot) * CIRC;
    const gap = segs.length > 1 ? 1.6 : 0;
    const draw = Math.max(len - gap, 0.1);
    const pct = ((s.val / tot) * 100).toFixed(1) + '%';
    const el = `<circle class="donut-slice" cx="60" cy="60" r="${R}" fill="none" stroke="${s.c}" stroke-width="15"
        stroke-dasharray="${draw} ${CIRC - draw}" stroke-dashoffset="${-off}" transform="rotate(-90 60 60)"
        data-label="${esc(s.label)}" data-val="${esc(fmt(s.val))}" data-pct="${pct}"></circle>`;
    off += len;
    return el;
  }).join('');

  const margin = revT > 0 ? (np / revT) * 100 : 0;
  const marginTxt = revT > 0 ? margin.toFixed(1) + '%' : '—';
  const marginColor = np >= 0 ? PL_COLORS.profit : PL_COLORS.loss;

  const legend = segs.map(s => `
    <div class="plx-legend-row">
      <span class="plx-legend-l"><span class="plx-dot" style="background:${s.c}"></span>${esc(s.label)}</span>
      <span class="plx-legend-r"><b>${fmt(s.val)}</b><em>${((s.val / tot) * 100).toFixed(1)}%</em></span>
    </div>`).join('');

  const insight = revT <= 0
    ? 'No revenue recorded for this period.'
    : np >= 0
      ? `For every ₹100 of revenue, <b>₹${margin.toFixed(2)}</b> is kept as net profit.`
      : `The business is running at a net loss of <b>₹${Math.abs(margin).toFixed(2)}</b> for every ₹100 of revenue.`;

  return `
    <div class="plx-charts" id="plChartsWrapper">
      <div id="chartTooltip3d" class="plx-tip"></div>

      <div class="plx-card">
        <h3>Profit &amp; loss summary</h3>
        <p class="plx-hint">Each bar shows the amount; the % is the share of revenue.</p>
        ${barsHtml}
      </div>

      <div class="plx-card">
        <h3>Where revenue goes</h3>
        <p class="plx-hint">Costs and profit as a share of the total.</p>
        <div class="plx-donut-wrap">
          <svg class="plx-donut" viewBox="0 0 120 120" role="img" aria-label="Cost and profit breakdown">
            <circle cx="60" cy="60" r="${R}" fill="none" style="stroke:var(--mu)" stroke-width="15"></circle>
            ${arcs}
            <text x="60" y="55" text-anchor="middle" font-size="7" font-weight="600" style="fill:var(--t2)">NET MARGIN</text>
            <text x="60" y="71" text-anchor="middle" font-size="15" font-weight="700" fill="${marginColor}">${marginTxt}</text>
          </svg>
          <div class="plx-legend">
            ${legend || '<div class="plx-empty">No costs or profit to display.</div>'}
          </div>
          <div class="plx-insight">${insight}</div>
        </div>
      </div>
    </div>`;
}

export function renderPl() {
  const d = getPlData();
  const { u, rev, cogs, opx, oi, int, revT, cogsT, opxT, oiT, intT, gp, np } = d;
  const view = u.view || 'both';
  const totalExp = cogsT + opxT + intT;
  const pctOf = x => revT > 0 ? ((x / revT) * 100).toFixed(1) + '%' : '—';
  const gpMargin = pctOf(gp);
  const npMargin = pctOf(np);

  const actions = `<button data-a="plcsv">Export CSV</button>`;

  const kpis = `
    <div class="plx-kpis">
      <div class="plx-kpi" style="--kc:${PL_COLORS.rev}"><span>Revenue</span><b>${fmt(revT)}</b><small>Sales &amp; operating income</small></div>
      <div class="plx-kpi" style="--kc:${PL_COLORS.gp}"><span>Gross profit</span><b>${fmt(gp)}</b><small>${gpMargin} of revenue</small></div>
      <div class="plx-kpi" style="--kc:${PL_COLORS.cogs}"><span>Total expenses</span><b>${fmt(totalExp)}</b><small>COGS + operating + interest</small></div>
      <div class="plx-kpi" style="--kc:${np >= 0 ? PL_COLORS.profit : PL_COLORS.loss}"><span>Net ${np < 0 ? 'loss' : 'profit'}</span><b class="${np >= 0 ? '' : 'plx-neg'}">${fmt(np)}</b><small>${npMargin} net margin</small></div>
    </div>`;

  const sec = (title, list, total) => {
    const zero = !list.length && !total;
    return `<tr class="plx-sec ${zero ? 'plx-zero' : ''}"><td>${title}</td><td class="n">${fmt(total)}</td><td class="n plx-pc">${pctOf(total)}</td></tr>` +
      list.map(x => `<tr class="plx-item"><td>${esc(x[0].name)}</td><td class="n">${fmt(x[1])}</td><td class="n plx-pc">${pctOf(x[1])}</td></tr>`).join('');
  };

  const tableHtml = view !== 'charts' ? `
    <div class="plx-card plx-tablecard">
      <div class="plx-scroll">
        <table class="plx-table">
          <thead><tr><th>Particulars</th><th class="n">Amount</th><th class="n plx-pc">% of revenue</th></tr></thead>
          <tbody>
            ${sec('Revenue', rev, revT)}
            ${sec('Cost of goods sold', cogs, cogsT)}
            <tr class="plx-key"><td>Gross profit</td><td class="n ${gp >= 0 ? 'plx-pos' : 'plx-neg'}">${fmt(gp)}</td><td class="n plx-pc">${gpMargin}</td></tr>
            ${sec('Operating expenses', opx, opxT)}
            ${sec('Other income', oi, oiT)}
            ${sec('Interest expense', int, intT)}
            <tr class="plx-net"><td>Net ${np < 0 ? 'loss' : 'profit'}</td><td class="n ${np >= 0 ? 'plx-pos' : 'plx-neg'}">${fmt(np)}</td><td class="n plx-pc">${npMargin}</td></tr>
          </tbody>
        </table>
      </div>
    </div>` : '';

  const printHeader = `
    <div class="print-only" style="margin-bottom:14px;border-bottom:2px solid #0f172a;padding-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <h2 style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">${esc(db.biz.name || 'BUFIN Business Ledger')}</h2>
          ${db.biz.gstin ? `<div style="font-size:12px;color:#475569;">GSTIN: <b>${esc(db.biz.gstin)}</b></div>` : ''}
        </div>
        <div style="text-align:right;">
          <h3 style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">Statement of Profit and Loss</h3>
          <div style="font-size:12px;color:#475569;">Period: <b>${u.f || 'Beginning'}</b> to <b>${u.t}</b></div>
        </div>
      </div>
    </div>`;

  const sub = `<div class="plx-sub"><span><b>${esc(db.biz.name || 'BUFIN Business Ledger')}</b></span><span>Period: <b>${plPeriod(u)}</b></span></div>`;

  const filters = `
    <div class="plx-filters plx-noprint">
      <div class="plx-chips">
        <button class="${u.f === today().slice(0, 8) + '01' && u.t === today() ? 'p' : ''}" data-a="plpreset" data-i="month">This Month</button>
        <button data-a="plpreset" data-i="lastmonth">Last Month</button>
        <button data-a="plpreset" data-i="fy">FY to Date</button>
        <button data-a="plpreset" data-i="all">All Time</button>
      </div>
      <div class="plx-dates">
        <label>From <input type="date" id="plFrom" value="${u.f}"></label>
        <label>To <input type="date" id="plTo" value="${u.t}"></label>
      </div>
      <div class="plx-seg">
        <button class="${view === 'both' ? 'p' : ''}" data-a="pltoggle" data-i="both" title="Charts and statement">Overview</button>
        <button class="${view === 'charts' ? 'p' : ''}" data-a="pltoggle" data-i="charts" title="Charts only">Charts</button>
        <button class="${view === 'table' ? 'p' : ''}" data-a="pltoggle" data-i="table" title="Statement only">Statement</button>
      </div>
    </div>`;

  const chartsHtml = view !== 'table' ? buildPlCharts(d) : '';

  return `<div class="plx-root"><style>${PL_CSS}</style>` +
    head('Profit and Loss', actions) +
    printHeader +
    sub +
    filters +
    kpis +
    chartsHtml +
    tableHtml +
    `</div>`;
}

// Interactive tooltip for the P&L charts
export function attachPlChartTooltips() {
  const container = document.getElementById('plChartsWrapper');
  const tip = document.getElementById('chartTooltip3d');
  if (!container || !tip) return;

  const elements = container.querySelectorAll('.chart-bar-group, .donut-slice');
  elements.forEach(el => {
    el.addEventListener('mouseenter', () => {
      const label = el.getAttribute('data-label') || '';
      const val = el.getAttribute('data-val') || '';
      const pct = el.getAttribute('data-pct') || '';
      tip.innerHTML = `
        <div style="font-weight:700;font-size:12px;margin-bottom:2px;">${label}</div>
        <div style="font-size:13.5px;color:#38bdf8;font-weight:700;">${val}</div>
        ${pct && pct !== '—' ? `<div style="font-size:10px;color:#94a3b8;margin-top:2px;">${pct}</div>` : ''}
      `;
      tip.style.display = 'block';
    });

    el.addEventListener('mousemove', e => {
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left + 14;
      const y = e.clientY - rect.top - 48;
      tip.style.left = `${Math.max(0, Math.min(x, rect.width - 160))}px`;
      tip.style.top = `${Math.max(8, y)}px`;
    });

    el.addEventListener('mouseleave', () => {
      tip.style.display = 'none';
    });
  });
}

// Export the P&L summary as a clean, high-resolution PNG
export function exportPlChartPng() {
  const d = getPlData();
  const { u, revT, cogsT, opxT, intT, gp, np } = d;

  const W = 1200, H = 700, S = 2;
  const canvas = document.createElement('canvas');
  canvas.width = W * S;
  canvas.height = H * S;
  const ctx = canvas.getContext('2d');
  ctx.scale(S, S);

  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  const rr = (x, y, w, h, r) => {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  };
  const pct = x => revT > 0 ? ((x / revT) * 100).toFixed(1) + '%' : '—';

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 24px ${FONT}`;
  ctx.fillText(db.biz.name || 'BUFIN Business Ledger', 40, 52);
  ctx.fillStyle = '#64748b';
  ctx.font = `400 14px ${FONT}`;
  ctx.fillText(`Profit & Loss Summary${db.biz.gstin ? '  |  GSTIN: ' + db.biz.gstin : ''}`, 40, 76);
  ctx.fillText(`Period: ${plPeriod(u)}   •   Generated on ${dmy(today())}`, 40, 96);

  // KPI cards
  const kpis = [
    { label: 'REVENUE', val: fmt(revT), color: PL_COLORS.rev },
    { label: 'GROSS PROFIT', val: fmt(gp), color: PL_COLORS.gp },
    { label: 'TOTAL EXPENSES', val: fmt(cogsT + opxT + intT), color: PL_COLORS.cogs },
    { label: np >= 0 ? 'NET PROFIT' : 'NET LOSS', val: fmt(np), color: np >= 0 ? PL_COLORS.profit : PL_COLORS.loss }
  ];
  kpis.forEach((k, i) => {
    const x = 40 + i * 285, y = 118, w = 265, h = 72;
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    rr(x, y, w, h, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = k.color;
    ctx.fillRect(x + 1, y + 10, 4, h - 20);
    ctx.fillStyle = '#64748b';
    ctx.font = `700 11px ${FONT}`;
    ctx.fillText(k.label, x + 20, y + 28);
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText(k.val, x + 20, y + 54);
  });

  // Left card: summary bars
  const lx = 40, ly = 210, lw = 690, lh = 440;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#e2e8f0';
  rr(lx, ly, lw, lh, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 16px ${FONT}`;
  ctx.fillText('Profit & loss summary', lx + 24, ly + 36);

  const bars = plBars(d);
  const maxV = Math.max(...bars.map(b => Math.abs(b.v)), 1);
  const rowH = Math.min(58, (lh - 80) / bars.length);
  const trackX = lx + 24, trackW = lw - 48;
  bars.forEach((b, i) => {
    const y = ly + 68 + i * rowH;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#334155';
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText(b.k, trackX, y + 12);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 13px ${FONT}`;
    ctx.fillText(`${fmt(b.v)}   ${pct(b.v)}`, trackX + trackW, y + 12);
    ctx.fillStyle = '#eef2f6';
    rr(trackX, y + 22, trackW, 10, 5); ctx.fill();
    const w = b.v === 0 ? 0 : Math.max(8, (Math.abs(b.v) / maxV) * trackW);
    if (w) { ctx.fillStyle = b.c; rr(trackX, y + 22, w, 10, 5); ctx.fill(); }
  });

  // Right card: donut
  const rx = 750, ry = 210, rw = 410, rh = 440;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#e2e8f0';
  rr(rx, ry, rw, rh, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.font = `700 16px ${FONT}`;
  ctx.fillText('Where revenue goes', rx + 24, ry + 36);

  const segs = plSegs(d);
  const tot = segs.reduce((s, x) => s + x.val, 0);
  const cx = rx + rw / 2, cy = ry + 180, oR = 88, iR = 58;
  if (!segs.length) {
    ctx.fillStyle = '#eef2f6';
    ctx.beginPath(); ctx.arc(cx, cy, oR, 0, Math.PI * 2); ctx.arc(cx, cy, iR, Math.PI * 2, 0, true); ctx.closePath(); ctx.fill();
  }
  let a0 = -Math.PI / 2;
  segs.forEach(s => {
    const a1 = a0 + (s.val / tot) * Math.PI * 2;
    const gap = segs.length > 1 ? 0.012 : 0;
    ctx.fillStyle = s.c;
    ctx.beginPath();
    ctx.arc(cx, cy, oR, a0, a1 - gap);
    ctx.arc(cx, cy, iR, a1 - gap, a0, true);
    ctx.closePath();
    ctx.fill();
    a0 = a1;
  });
  ctx.textAlign = 'center';
  ctx.fillStyle = '#64748b';
  ctx.font = `700 11px ${FONT}`;
  ctx.fillText('NET MARGIN', cx, cy - 6);
  ctx.fillStyle = np >= 0 ? PL_COLORS.profit : PL_COLORS.loss;
  ctx.font = `700 22px ${FONT}`;
  ctx.fillText(revT > 0 ? ((np / revT) * 100).toFixed(1) + '%' : '—', cx, cy + 20);

  // Legend
  segs.forEach((s, i) => {
    const y = ry + 312 + i * 28;
    ctx.fillStyle = s.c;
    rr(rx + 28, y, 12, 12, 3); ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#334155';
    ctx.font = `600 13px ${FONT}`;
    ctx.fillText(s.label, rx + 50, y + 11);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0f172a';
    ctx.font = `700 13px ${FONT}`;
    ctx.fillText(`${fmt(s.val)}  (${((s.val / tot) * 100).toFixed(1)}%)`, rx + rw - 28, y + 11);
  });

  // Footer
  ctx.textAlign = 'left';
  ctx.fillStyle = '#94a3b8';
  ctx.font = `400 11px ${FONT}`;
  ctx.fillText('BUFIN Business Ledger', 40, 682);

  canvas.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `PL_Summary_${u.f || 'start'}_to_${u.t}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('P&L chart exported as PNG');
  }, 'image/png');
}

export function exportPlCsv() {
  const u = reportsState.pl;
  const v = c => sgn(acc(c.code), net(c.code, u.f, u.t));
  const S = f => db.accounts.filter(f).map(a => [a, v(a)]).filter(x => x[1]);

  const rev = S(a => /^4[01]/.test(a.code));
  const cogs = S(a => a.code === '5000');
  const opx = S(a => a.t === 'X' && !['5000', '5500'].includes(a.code));
  const oi = S(a => a.t === 'I' && !/^4[01]/.test(a.code));
  const int = S(a => a.code === '5500');

  const sum = l => l.reduce((s, x) => s + x[1], 0);
  const gp = sum(rev) - sum(cogs);
  const np = gp - sum(opx) + sum(oi) - sum(int);

  const rows = [
    ['BUFIN Business Ledger - Profit and Loss Statement'],
    [`Business: ${db.biz.name || 'BUFIN'}${db.biz.gstin ? ' | GSTIN: ' + db.biz.gstin : ''}`],
    [`Period: ${u.f || 'Beginning'} to ${u.t}`],
    [],
    ['Category', 'Account', 'Amount (₹)']
  ];

  const addSec = (title, list) => {
    rows.push([title, '', (sum(list) / 100).toFixed(2)]);
    list.forEach(item => {
      rows.push(['', item[0].name, (item[1] / 100).toFixed(2)]);
    });
  };

  addSec('Revenue', rev);
  addSec('Cost of Goods Sold', cogs);
  rows.push(['Gross Profit', '', (gp / 100).toFixed(2)]);
  addSec('Operating Expenses', opx);
  addSec('Other Income', oi);
  addSec('Interest Expense', int);
  rows.push(['Net Profit / (Loss)', '', (np / 100).toFixed(2)]);

  const csv = rows.map(r => r.map(f => '"' + String(f ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `profit_loss_${u.f || 'start'}_to_${u.t}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('P&L CSV exported');
}

// ==========================================
// 3. BALANCE SHEET MODULE
// ==========================================

export function renderBs() {
  const u = reportsState.bs;
  const t = u.t || today();
  const isStandardMode = u.mode !== 'net';

  const g = ty => db.accounts
    .filter(a => a.t === ty)
    .map(a => [a, sgn(a, net(a.code, '', t))])
    .filter(x => x[1] !== 0);

  const A_raw = g('A');
  const L_raw = g('L');
  const E_raw = g('E');

  const earn = -db.accounts.filter(a => a.t === 'I' || a.t === 'X').reduce((s, a) => s + net(a.code, '', t), 0);
  const overdrawnAssets = A_raw.filter(x => x[1] < 0);

  let A_display = [];
  let L_display = [];
  let E_display = E_raw;

  if (isStandardMode) {
    A_display = A_raw.filter(x => x[1] > 0);
    const reclassifiedOverdrafts = overdrawnAssets.map(x => [
      x[0],
      -x[1],
      true
    ]);
    L_display = [...L_raw, ...reclassifiedOverdrafts];
  } else {
    A_display = A_raw;
    L_display = L_raw;
  }

  const sumList = l => l.reduce((x, y) => x + y[1], 0);
  const totalAssets = sumList(A_display);
  const totalLiabilities = sumList(L_display);
  const totalEquity = sumList(E_display) + earn;
  const totalLiabAndEquity = totalLiabilities + totalEquity;

  const isBalanced = totalAssets === totalLiabAndEquity;
  const diff = Math.abs(totalAssets - totalLiabAndEquity);

  const actions = `<div style="display:flex;gap:8px;flex-wrap:wrap">
    <button data-a="bscsv">Export CSV</button>
    <button onclick="window.print()">Print</button>
  </div>`;

  const overdrawnBanner = overdrawnAssets.length ? `
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #ea580c;border-radius:8px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:flex-start;gap:12px;">
      <span style="font-size:20px;line-height:1;margin-top:2px;">⚠️</span>
      <div style="flex:1;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
          <h4 style="margin:0;font-size:13.5px;font-weight:700;color:#9a3412;">Audit Notice: Overdrawn Asset Accounts (${overdrawnAssets.length})</h4>
          <span class="pill" style="font-size:11px;background:#ffedd5;color:#9a3412;border:1px solid #fdba74;padding:2px 8px;border-radius:99px;font-weight:600;">Balance Sheet Classification</span>
        </div>
        <p style="margin:5px 0 8px 0;font-size:12.5px;color:#7c2d12;line-height:1.5;">
          The following asset accounts have negative balances:
          ${overdrawnAssets.map(oa => `<b>${esc(oa[0].name)} (-${fmt(-oa[1])})</b>`).join(', ')}.
          ${isStandardMode 
            ? 'According to standard accounting principles, these overdrawn balances have been reclassified under <b>Current Liabilities (Overdrafts / Deficits)</b> to avoid distorting total asset value.' 
            : 'In Direct Ledger view, these negative balances subtract directly from total assets.'}
        </p>
        <div style="font-size:12px;color:#9a3412;">
          👉 <b>Recommended Action</b>: Please verify and record starting cash in <a href="#/open" style="color:#c2410c;font-weight:700;text-decoration:underline;">Opening Balances</a> or record missing deposits in <a href="#/book" style="color:#c2410c;font-weight:700;text-decoration:underline;">Cash and Bank Book</a>.
        </div>
      </div>
    </div>
  ` : '';

  const renderSection = (title, list, extraLabel, extraVal) => {
    const subtotal = sumList(list) + (extraVal || 0);
    const rowsHtml = list.map(item => {
      const a = item[0];
      const val = item[1];
      const isReclass = item[2];
      const isNegative = val < 0;

      let badge = '';
      if (isReclass) {
        badge = `<span class="pill" style="font-size:10px;font-weight:700;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;padding:1px 6px;border-radius:4px;margin-left:6px;">⚠️ Overdrawn Asset (Liability)</span>`;
      } else if (isNegative) {
        badge = `<span class="pill" style="font-size:10px;font-weight:700;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;padding:1px 6px;border-radius:4px;margin-left:6px;">⚠️ Negative Balance</span>`;
      }

      return `<tr class="k" data-a="gl" data-i="${a.code}">
        <td>&nbsp;&nbsp;${esc(a.name)} <small style="color:var(--t2);">(${a.code})</small>${badge}</td>
        <td class="num" style="${isNegative ? 'color:#b91c1c;font-weight:600;' : ''}">${isNegative ? '-' + fmt(-val) : fmt(val)}</td>
      </tr>`;
    }).join('');

    const extraRow = (extraLabel !== undefined && extraVal !== undefined) ? `
      <tr>
        <td>&nbsp;&nbsp;${esc(extraLabel)} <span class="pill" style="font-size:10px;background:#eff6ff;color:#1e40af;padding:1px 6px;border-radius:4px;margin-left:6px;font-weight:600;">Real-Time P&L</span></td>
        <td class="num" style="font-weight:600;color:${extraVal >= 0 ? '#1e40af' : '#b91c1c'};">${extraVal < 0 ? '-' + fmt(-extraVal) : fmt(extraVal)}</td>
      </tr>
    ` : '';

    return `
      <tr class="tot" style="background:#f8fafc;font-weight:700;">
        <td>${title}</td>
        <td class="num">${fmt(subtotal)}</td>
      </tr>
      ${rowsHtml || '<tr><td colspan="2" style="color:var(--t2);font-style:italic;">&nbsp;&nbsp;No accounts in this category</td></tr>'}
      ${extraRow}
    `;
  };

  const printHeader = `
    <div class="print-only" style="margin-bottom:14px;border-bottom:2px solid #0f172a;padding-bottom:10px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <h2 style="margin:0;font-size:18px;font-weight:700;color:#0f172a;">${esc(db.biz.name || 'BUFIN Business Ledger')}</h2>
          ${db.biz.gstin ? `<div style="font-size:12px;color:#475569;">GSTIN: <b>${esc(db.biz.gstin)}</b></div>` : ''}
        </div>
        <div style="text-align:right;">
          <h3 style="margin:0;font-size:16px;font-weight:700;color:#0f172a;">Balance Sheet Statement</h3>
          <div style="font-size:12px;color:#475569;">As of: <b>${t}</b></div>
        </div>
      </div>
    </div>
  `;

  return head('Balance Sheet', actions) +
    printHeader +
    `<div class="grid">
      ${kpi('Total Assets', fmt(totalAssets))}
      ${kpi('Total Liabilities', fmt(totalLiabilities))}
      ${kpi('Total Equity & Net Earnings', fmt(totalEquity))}
      ${kpi('Balance Equilibrium', isBalanced 
        ? `<span style="color:var(--ok);font-weight:600;">✓ In Equilibrium (A = L + E)</span>` 
        : `<span style="color:var(--rd);font-weight:700;">⚠ Out of Balance (${fmt(diff)})</span>`)}
    </div>` +
    overdrawnBanner +
    `<div class="filters" style="align-items:center;flex-wrap:wrap;">
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="${t === today() ? 'p' : ''}" data-a="bspreset" data-i="today">Today</button>
        <button class="${t === getMonthEnd() ? 'p' : ''}" data-a="bspreset" data-i="monthend">Month End</button>
        <button class="${t === getFyEnd() ? 'p' : ''}" data-a="bspreset" data-i="fyend">FY End</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <label style="display:flex;align-items:center;gap:6px;margin:0;font-size:12px;color:var(--t2)">
          As of <input type="date" id="bsDate" value="${t}" style="width:auto">
        </label>
      </div>
      <div style="display:flex;gap:6px;margin-left:auto;">
        <button class="${isStandardMode ? 'p' : ''}" data-a="bstoggle" data-i="standard" title="Reclassify overdrawn assets to liabilities per accounting standards">Standard (Reclassify Overdrafts)</button>
        <button class="${!isStandardMode ? 'p' : ''}" data-a="bstoggle" data-i="net" title="Show direct net ledger balances">Direct Ledger View</button>
      </div>
    </div>
    <div class="wrap">
      <table>
        ${renderSection('Assets', A_display)}
        ${renderSection('Liabilities', L_display)}
        ${renderSection('Equity', E_display, 'Retained earnings to date', earn)}
        <tr class="tot" style="background:${isBalanced ? '#f0fdf4' : '#fef2f2'};font-size:14px;font-weight:700;border-top:2px solid var(--bd);">
          <td>
            Total Assets (${fmt(totalAssets)}) vs Total Liabilities + Equity (${fmt(totalLiabAndEquity)})
            ${isBalanced 
              ? '<span class="b ok" style="margin-left:8px;">Balanced (A = L + E)</span>' 
              : `<span class="b rd" style="margin-left:8px;">Out of Balance (${fmt(diff)})</span>`}
          </td>
          <td class="num" style="color:${isBalanced ? '#047857' : '#b91c1c'};font-size:15px;">
            ${fmt(totalAssets)}
          </td>
        </tr>
      </table>
    </div>`;
}

export function exportBsCsv() {
  const u = reportsState.bs;
  const t = u.t || today();
  const isStandardMode = u.mode !== 'net';

  const g = ty => db.accounts
    .filter(a => a.t === ty)
    .map(a => [a, sgn(a, net(a.code, '', t))])
    .filter(x => x[1] !== 0);

  const A_raw = g('A');
  const L_raw = g('L');
  const E_raw = g('E');
  const earn = -db.accounts.filter(a => a.t === 'I' || a.t === 'X').reduce((s, a) => s + net(a.code, '', t), 0);

  const overdrawnAssets = A_raw.filter(x => x[1] < 0);
  let A_display = [];
  let L_display = [];
  let E_display = E_raw;

  if (isStandardMode) {
    A_display = A_raw.filter(x => x[1] > 0);
    const reclass = overdrawnAssets.map(x => [x[0], -x[1], true]);
    L_display = [...L_raw, ...reclass];
  } else {
    A_display = A_raw;
    L_display = L_raw;
  }

  const sumList = l => l.reduce((x, y) => x + y[1], 0);
  const totalAssets = sumList(A_display);
  const totalLiabilities = sumList(L_display);
  const totalEquity = sumList(E_display) + earn;
  const totalLiabAndEquity = totalLiabilities + totalEquity;

  const rows = [
    ['BUFIN Business Ledger - Balance Sheet Statement'],
    [`Business: ${db.biz.name || 'BUFIN'}${db.biz.gstin ? ' | GSTIN: ' + db.biz.gstin : ''}`],
    [`As of Date: ${t}`],
    [`Classification Mode: ${isStandardMode ? 'Standard (Reclassify Overdrafts to Current Liabilities)' : 'Direct Net Ledger View'}`],
    [],
    ['Classification', 'Account Code', 'Account Name', 'Amount (₹)', 'Audit Note']
  ];

  // Assets
  rows.push(['ASSETS', '', '', (totalAssets / 100).toFixed(2), '']);
  A_display.forEach(x => {
    const a = x[0], val = x[1];
    rows.push(['Assets', a.code, a.name, (val / 100).toFixed(2), val < 0 ? '⚠️ Overdrawn Asset' : '']);
  });

  // Liabilities
  rows.push([]);
  rows.push(['LIABILITIES', '', '', (totalLiabilities / 100).toFixed(2), '']);
  L_display.forEach(x => {
    const a = x[0], val = x[1], isReclass = x[2];
    rows.push(['Liabilities', a.code, a.name, (val / 100).toFixed(2), isReclass ? '⚠️ Reclassified Overdraft from Assets' : '']);
  });

  // Equity
  rows.push([]);
  rows.push(['EQUITY', '', '', (totalEquity / 100).toFixed(2), '']);
  E_display.forEach(x => {
    const a = x[0], val = x[1];
    rows.push(['Equity', a.code, a.name, (val / 100).toFixed(2), '']);
  });
  rows.push(['Equity', 'RE', 'Retained earnings to date (Net Profit/Loss)', (earn / 100).toFixed(2), 'Synchronized P&L']);

  // Summary
  rows.push([]);
  const isBalanced = totalAssets === totalLiabAndEquity;
  rows.push(['TOTAL ASSETS', '', '', (totalAssets / 100).toFixed(2), isBalanced ? 'In Equilibrium' : '⚠️ OUT OF BALANCE']);
  rows.push(['TOTAL LIABILITIES + EQUITY', '', '', (totalLiabAndEquity / 100).toFixed(2), isBalanced ? 'In Equilibrium' : `Difference: ${((Math.abs(totalAssets - totalLiabAndEquity)) / 100).toFixed(2)}`]);

  const csv = rows.map(r => r.map(f => '"' + String(f ?? '').replace(/"/g, '""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `balance_sheet_${t}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Balance Sheet CSV exported');
}
