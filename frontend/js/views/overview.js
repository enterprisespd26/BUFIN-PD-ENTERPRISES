import { esc, fmt, today, head, kpi } from '../modules/utils.js';
import { db, net, sgn, acc, pn, out, partyBalance, loanOutstanding } from '../modules/state.js';
import { entTable } from '../modules/components.js';

export function getMonthlyCashFlow(m = today().slice(0, 7)) {
  const cashAccs = new Set(db.accounts.filter(a => a.cash).map(a => a.code));
  let cin = 0;
  let cout = 0;

  for (const e of db.entries) {
    if (!e.date || !e.date.startsWith(m)) continue;
    if (e.src === 'open') continue; // opening balances are not period movements

    // Exclude internal contra transfers between cash accounts
    const isInternalXfer = e.src === 'xfer' || (e.lines && e.lines.length >= 2 && e.lines.every(l => cashAccs.has(l.a)));
    if (isInternalXfer) continue;

    const cashLines = (e.lines || []).filter(l => cashAccs.has(l.a));
    if (!cashLines.length) continue;

    const netCash = cashLines.reduce((s, l) => s + (l.d || 0) - (l.c || 0), 0);
    if (netCash === 0) continue;

    if (e.src === 'rev' && e.rev) {
      const orig = db.entries.find(x => x.id === e.rev);
      const origCash = orig ? (orig.lines || []).filter(l => cashAccs.has(l.a)).reduce((s, l) => s + (l.d || 0) - (l.c || 0), 0) : 0;
      if (origCash > 0) {
        cin += netCash; // netCash is negative, offsets receipts
      } else if (origCash < 0) {
        cout -= netCash; // netCash is positive, offsets payments
      } else {
        if (netCash > 0) cin += netCash;
        else cout += Math.abs(netCash);
      }
    } else {
      if (netCash > 0) {
        cin += netCash;
      } else {
        cout += Math.abs(netCash);
      }
    }
  }

  return { cin: Math.max(0, cin), cout: Math.max(0, cout) };
}

export function renderOverview() {
  const t = today(), m = t.slice(0, 7), cash = net('1000'), bank = net('1010');
  const rec = net('1100');
  const pay = sgn(acc('2000'), net('2000'));
  const rng = (a, f, to) => a.reduce((s, c) => s + sgn(acc(c.code), net(c.code, f, to)), 0);
  const I = db.accounts.filter(a => a.t === 'I'), X = db.accounts.filter(a => a.t === 'X');
  const inc = rng(I, m + '-01', t), exp = rng(X, m + '-01', t);
  const { cin, cout } = getMonthlyCashFlow(m);
  const ln = db.loans.filter(l => l.dir === 'taken').reduce((s, l) => s + loanOutstanding(l), 0);
  const lg = db.loans.filter(l => l.dir === 'given').reduce((s, l) => s + loanOutstanding(l), 0);
  const od = db.docs.filter(d => !d.cancelled && out(d) > 0 && d.due && d.due < t);

  const ledgerAR = net('1100');
  const partyAR = (db.parties || []).reduce((s, p) => s + partyBalance(p.id, '1100'), 0);
  const diffAR = ledgerAR - partyAR;

  const ledgerAP = sgn(acc('2000'), net('2000'));
  const partyAP = (db.parties || []).reduce((s, p) => s + sgn(acc('2000'), partyBalance(p.id, '2000')), 0);
  const diffAP = ledgerAP - partyAP;
  const hasDiff = diffAR !== 0 || diffAP !== 0;

  const reconCard = `
    <div class="wrap recon-card" style="margin-top:16px;padding:14px 18px;background:var(--mu,#f8fafc);border:1px solid var(--bd,#e2e8f0);border-radius:10px;">
      <div style="font-weight:700;font-size:14px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <span style="display:flex;align-items:center;gap:6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
          Ledger vs Party Sub-Ledger Reconciliation
        </span>
        ${hasDiff 
          ? `<span class="pill" style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;font-size:11px;padding:2px 8px;border-radius:99px;font-weight:700;">⚠️ Discrepancy Detected</span>` 
          : `<span class="pill" style="background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;font-size:11px;padding:2px 8px;border-radius:99px;font-weight:600;">✓ In Equilibrium (Zero Drift)</span>`}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(280px, 1fr));gap:12px;">
        <div style="background:#fff;border:1px solid var(--bd);border-radius:8px;padding:10px 14px;">
          <div style="font-size:12px;color:var(--t2);font-weight:600;">Receivables (1100) per ledger vs per party</div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:4px;">
            <span style="font-size:14px;font-weight:700;">Ledger: ${fmt(ledgerAR)} · Parties: ${fmt(partyAR)}</span>
            ${diffAR !== 0 
              ? `<span class="b rd" style="font-size:11px;padding:2px 6px;">Diff: ${fmt(diffAR)}</span>` 
              : `<span class="b ok" style="font-size:11px;padding:2px 6px;">Diff: ₹0.00</span>`}
          </div>
          ${diffAR !== 0 ? `<div style="margin-top:6px;"><a href="#" data-a="show-unallocated" data-i="1100" style="font-size:12px;color:var(--ac);text-decoration:underline;">View unallocated receivables entries</a></div>` : ''}
        </div>
        <div style="background:#fff;border:1px solid var(--bd);border-radius:8px;padding:10px 14px;">
          <div style="font-size:12px;color:var(--t2);font-weight:600;">Payables (2000) per ledger vs per party</div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:4px;">
            <span style="font-size:14px;font-weight:700;">Ledger: ${fmt(ledgerAP)} · Parties: ${fmt(partyAP)}</span>
            ${diffAP !== 0 
              ? `<span class="b rd" style="font-size:11px;padding:2px 6px;">Diff: ${fmt(diffAP)}</span>` 
              : `<span class="b ok" style="font-size:11px;padding:2px 6px;">Diff: ₹0.00</span>`}
          </div>
          ${diffAP !== 0 ? `<div style="margin-top:6px;"><a href="#" data-a="show-unallocated" data-i="2000" style="font-size:12px;color:var(--ac);text-decoration:underline;">View unallocated payables entries</a></div>` : ''}
        </div>
      </div>
    </div>
  `;
  
  const mons = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(t + 'T00:00:00Z');
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    const k = d.toISOString().slice(0, 7), f = k + '-01', e = k + '-31';
    mons.push([k, rng(I, f, e), rng(X, f, e)]);
  }
  const mx = Math.max(1, ...mons.flatMap(x => [x[1], x[2]]));

  const overviewActions = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <button type="button" class="p" data-a="overview-newsale" style="display:inline-flex;align-items:center;gap:5px;height:36px;padding:0 14px;border-radius:8px;font-weight:600;font-size:13px;">
        <span>+ New invoice</span>
      </button>
      <button type="button" class="btn alt sm" data-a="overview-newbill" style="display:inline-flex;align-items:center;gap:5px;height:36px;padding:0 14px;border-radius:8px;font-weight:600;font-size:13px;background:#fff;border:1px solid var(--bd);">
        <span>+ New bill</span>
      </button>
    </div>
  `;

  return head('Overview', overviewActions) +
    (db.entries.length ? '' : `<div class="warn">Start here: open Opening Balances and enter your cash, bank and other balances as of your start date. Every screen posts to one double-entry ledger.</div>`) +
    `<div class="grid">
      ${kpi('Cash in hand', fmt(cash))}
      ${kpi('Bank balance', fmt(bank))}
      ${kpi('Total liquid funds', fmt(cash + bank))}
      ${kpi('Money received this month', fmt(cin))}
      ${kpi('Money paid this month', fmt(cout))}
      ${kpi('Revenue this month', fmt(inc))}
      ${kpi('Expenses this month', fmt(exp))}
      ${kpi('Net profit this month', fmt(inc - exp))}
      ${kpi('Receivables (trade only)', fmt(rec))}
      ${kpi('Payables (trade only)', fmt(pay))}
      ${kpi('Loans taken outstanding', fmt(ln))}
      ${kpi('Loans given outstanding', fmt(lg))}
      ${kpi('Overdue documents', od.length)}
    </div>
    ${reconCard}
    <div class="wrap">
      <div class="bars">${mons.map(x => `<div><i style="height:${x[1] / mx * 90}px;background:var(--ac)" title="Income"></i><i style="height:${x[2] / mx * 90}px;background:var(--wn)" title="Expense"></i><br>${x[0].slice(2)}</div>`).join('')}</div>
      <div class="empty" style="padding:4px 0 10px">Income (green) versus expenses (amber), last 6 months. Profit is accrual based, not cash in minus cash out.</div>
    </div>
    <h3>Overdue</h3>
    ${od.length ? `<div class="wrap"><table>${od.map(d => `<tr><td>${esc(d.no)}</td><td>${esc(pn(d.party))}</td><td>${esc(d.due)}</td><td class="num">${fmt(out(d))}</td></tr>`).join('')}</table></div>` : '<div class="wrap"><div class="empty">Nothing overdue.</div></div>'}
    <h3>Recent transactions</h3>
    ${entTable(db.entries.slice(-8).reverse())}`;
}
