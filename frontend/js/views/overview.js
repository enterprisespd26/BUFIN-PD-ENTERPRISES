import { esc, fmt, today, head, kpi } from '../modules/utils.js';
import { db, net, sgn, acc, pn, out } from '../modules/state.js';
import { entTable } from '../modules/components.js';

export function renderOverview() {
  const t = today(), m = t.slice(0, 7), cash = net('1000'), bank = net('1010');
  const rec = db.docs.filter(d => d.type === 'sale' && !d.cancelled).reduce((s, d) => s + out(d), 0);
  const pay = db.docs.filter(d => d.type === 'bill' && !d.cancelled).reduce((s, d) => s + out(d), 0);
  const rng = (a, f, to) => a.reduce((s, c) => s + sgn(acc(c.code), net(c.code, f, to)), 0);
  const I = db.accounts.filter(a => a.t === 'I'), X = db.accounts.filter(a => a.t === 'X');
  const inc = rng(I, m + '-01', t), exp = rng(X, m + '-01', t);
  const cin = db.entries.filter(e => e.date.startsWith(m) && e.src === 'in').reduce((s, e) => s + e.lines.reduce((x, l) => x + l.d, 0), 0);
  const cout = db.entries.filter(e => e.date.startsWith(m) && (e.src === 'out' || e.src === 'exp')).reduce((s, e) => s + e.lines.reduce((x, l) => x + l.d, 0), 0);
  const ln = db.loans.filter(l => l.dir === 'taken').reduce((s, l) => s + l.principal - l.repaid, 0);
  const lg = db.loans.filter(l => l.dir === 'given').reduce((s, l) => s + l.principal - l.repaid, 0);
  const od = db.docs.filter(d => !d.cancelled && out(d) > 0 && d.due && d.due < t);
  
  const mons = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(t + 'T00:00:00Z');
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() - i);
    const k = d.toISOString().slice(0, 7), f = k + '-01', e = k + '-31';
    mons.push([k, rng(I, f, e), rng(X, f, e)]);
  }
  const mx = Math.max(1, ...mons.flatMap(x => [x[1], x[2]]));

  return head('Overview') +
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
      ${kpi('Receivables', fmt(rec))}
      ${kpi('Payables', fmt(pay))}
      ${kpi('Loans taken outstanding', fmt(ln))}
      ${kpi('Loans given outstanding', fmt(lg))}
      ${kpi('Overdue documents', od.length)}
    </div>
    <div class="wrap">
      <div class="bars">${mons.map(x => `<div><i style="height:${x[1] / mx * 90}px;background:var(--ac)" title="Income"></i><i style="height:${x[2] / mx * 90}px;background:var(--wn)" title="Expense"></i><br>${x[0].slice(2)}</div>`).join('')}</div>
      <div class="empty" style="padding:4px 0 10px">Income (green) versus expenses (amber), last 6 months. Profit is accrual based, not cash in minus cash out.</div>
    </div>
    <h3>Overdue</h3>
    ${od.length ? `<div class="wrap"><table>${od.map(d => `<tr><td>${d.no}</td><td>${esc(pn(d.party))}</td><td>${d.due}</td><td class="num">${fmt(out(d))}</td></tr>`).join('')}</table></div>` : '<div class="wrap"><div class="empty">Nothing overdue.</div></div>'}
    <h3>Recent transactions</h3>
    ${entTable(db.entries.slice(-8).reverse())}`;
}
