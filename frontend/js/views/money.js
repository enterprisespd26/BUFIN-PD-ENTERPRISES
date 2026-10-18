import { esc, fmt, today, head, kpi } from '../modules/utils.js';
import { db, acc, an, pn } from '../modules/state.js';
import { entTable, accOpts } from '../modules/components.js';

export const moneyState = {
  q: '',
  xm: '',
  xc: ''
};

export function getTxnRowData(e) {
  let partyName = e.meta?.partyName || e.meta?.employee || e.meta?.payee || '';
  if (!partyName) {
    const pLine = e.lines.find(l => l.p);
    if (pLine && pLine.p) partyName = pn(pLine.p);
  }
  if (!partyName && e.meta?.docNo) {
    const d = db.docs.find(x => x.no === e.meta.docNo || x.sno === e.meta.docNo);
    if (d) partyName = d.c?.n || d.sup || pn(d.party) || '';
  }

  let acctName = '';
  let catName = '';
  let method = '';
  if (e.src === 'in') {
    const debCash = e.lines.find(l => l.d && acc(l.a)?.cash);
    acctName = debCash ? an(debCash.a) : (e.meta?.acct ? an(e.meta.acct) : (e.lines[0] ? an(e.lines[0].a) : ''));
    const crCat = e.lines.find(l => l.c && !acc(l.a)?.cash);
    const catCode = crCat ? crCat.a : (e.meta?.cat || (e.lines[1] ? e.lines[1].a : ''));
    catName = catCode === '1100' ? 'Customer Receipt (Accounts Receivable)' : an(catCode);
  } else if (e.src === 'out' || e.src === 'exp') {
    const crCash = e.lines.find(l => l.c && acc(l.a)?.cash);
    acctName = crCash ? an(crCash.a) : (e.meta?.acct ? an(e.meta.acct) : (e.lines[1] ? an(e.lines[1].a) : ''));
    const debCat = e.lines.find(l => l.d && !acc(l.a)?.cash && l.a !== '1300');
    const catCode = debCat ? debCat.a : (e.meta?.cat || (e.lines[0] ? e.lines[0].a : ''));
    if (catCode === '2000') catName = 'Supplier Payment (Accounts Payable)';
    else if (catCode === '5000') catName = 'Purchases / COGS';
    else if (catCode === '5100') catName = 'Rent Expense';
    else if (catCode === '5200') catName = 'Transport Expense';
    else if (catCode === '5300') catName = 'Salaries';
    else if (catCode === '5400') catName = 'Utilities';
    else if (catCode === '5500') catName = 'Interest Expense';
    else if (catCode === '5600') catName = 'Miscellaneous Expense';
    else if (catCode === '3100') catName = "Owner's Drawings";
    else catName = an(catCode);
  } else if (e.src === 'xfer') {
    const fromA = e.lines.find(l => l.c);
    const toA = e.lines.find(l => l.d);
    acctName = fromA ? an(fromA.a) : '';
    catName = toA ? 'To: ' + an(toA.a) : 'Transfer';
    const isFromCash = fromA && (fromA.a === '1000' || (acc(fromA.a)?.name || '').toLowerCase().includes('cash'));
    const isToCash = toA && (toA.a === '1000' || (acc(toA.a)?.name || '').toLowerCase().includes('cash'));
    let xType = 'Bank-to-Bank';
    if (isFromCash && !isToCash) xType = 'Cash Deposit';
    else if (!isFromCash && isToCash) xType = 'Cash Withdrawal';
    else if (isFromCash && isToCash) xType = 'Cash Transfer';
    method = e.meta?.transferType || xType;
    partyName = 'Internal Transfer';
  } else if (e.src === 'sale') {
    acctName = 'Accounts Receivable';
    catName = 'Sales Revenue';
  } else if (e.src === 'bill') {
    acctName = 'Accounts Payable';
    catName = 'Purchases';
  } else if (e.src === 'pay') {
    const cashL = e.lines.find(l => acc(l.a)?.cash);
    acctName = cashL ? an(cashL.a) : (e.lines[0] ? an(e.lines[0].a) : '');
    catName = 'Party Payment / Receipt';
  } else if (e.src === 'loan') {
    const cashL = e.lines.find(l => acc(l.a)?.cash);
    acctName = cashL ? an(cashL.a) : (e.meta?.acct ? an(e.meta.acct) : (e.lines[0] ? an(e.lines[0].a) : ''));
    if (e.meta?.kind === 'disb') {
      catName = e.lines.some(l => l.a === '2100') ? 'Loan Borrowed (Principal)' : 'Loan Lent (Principal)';
    } else if (e.meta?.kind === 'rep') {
      catName = e.lines.some(l => l.a === '2100') ? 'Loan Repayment / EMI' : 'Loan Receipt / EMI';
    } else if (e.meta?.kind === 'topup') {
      catName = 'Loan Top-up';
    } else if (e.meta?.kind === 'fee') {
      catName = 'Loan Fee / Penalty';
    } else {
      catName = 'Loan Transaction';
    }
  } else {
    acctName = e.lines[0] ? an(e.lines[0].a) : '';
    catName = e.lines[1] ? an(e.lines[1].a) : '';
  }

  const refNo = e.meta?.ref || e.meta?.docNo || '';
  const desc = (e.meta && typeof e.meta.desc === 'string') ? (e.meta.desc.trim() || '-') : (e.narr || '-');
  if (!method) {
    method = e.meta?.method || (acctName.toLowerCase().includes('cash') ? 'Cash' : '');
  }
  let amt = e.lines.reduce((s, l) => s + l.d, 0);
  if (e.src === 'loan') {
    const cashL = e.lines.find(l => acc(l.a)?.cash);
    if (cashL) amt = cashL.d || cashL.c;
  }

  const typeMap = {
    in: 'Money In',
    out: 'Money Out',
    sale: 'Sales Invoice',
    bill: 'Purchase Bill',
    exp: 'Expense',
    xfer: 'Transfer',
    pay: 'Payment',
    loan: 'Loan',
    jv: 'Journal',
    open: 'Opening Balance',
    rev: 'Reversal'
  };

  return {
    partyName: partyName || '-',
    acctName: acctName || '-',
    catName: catName || '-',
    refNo: refNo || '-',
    desc: desc || '-',
    method: method || '-',
    amt,
    typeLabel: typeMap[e.src] || e.src
  };
}

function renderTxnTable(list, kind, emptyMsg) {
  if (!list.length) return `<div class="wrap"><div class="empty">${emptyMsg || 'No transactions found.'}</div></div>`;

  if (kind === 'in') {
    return `<div class="wrap"><table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Customer / Payer</th>
          <th>Deposit To Account</th>
          <th>Income Category</th>
          <th>Method</th>
          <th>Reference No.</th>
          <th>Description / Notes</th>
          <th class="num">Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(e => {
          const d = getTxnRowData(e);
          return `<tr class="k" data-a="ent" data-i="${e.id}" title="Click to view payment receipt">
            <td>${e.date}</td>
            <td><b>${esc(d.partyName)}</b></td>
            <td>${esc(d.acctName)}</td>
            <td>${esc(d.catName)}</td>
            <td><span class="pd-pill">${esc(d.method)}</span></td>
            <td><code>${esc(d.refNo)}</code></td>
            <td>${esc(d.desc)}</td>
            <td class="num" style="color:#0f5132;font-weight:600">+${fmt(d.amt)}</td>
            <td><span class="b ${e.status === 'posted' ? 'ok' : 'wn'}">${e.status}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
  }

  if (kind === 'out') {
    return `<div class="wrap"><table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Supplier / Payee</th>
          <th>Paid From Account</th>
          <th>Expense / Payment Category</th>
          <th>Method</th>
          <th>Reference No.</th>
          <th>Description / Notes</th>
          <th class="num">Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${list.map(e => {
          const d = getTxnRowData(e);
          return `<tr class="k" data-a="ent" data-i="${e.id}" title="Click to view payment voucher">
            <td>${e.date}</td>
            <td><b>${esc(d.partyName)}</b></td>
            <td>${esc(d.acctName)}</td>
            <td>${esc(d.catName)}</td>
            <td><span class="pd-pill">${esc(d.method)}</span></td>
            <td><code>${esc(d.refNo)}</code></td>
            <td>${esc(d.desc)}</td>
            <td class="num" style="color:#842029;font-weight:600">-${fmt(d.amt)}</td>
            <td><span class="b ${e.status === 'posted' ? 'ok' : 'wn'}">${e.status}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
  }

  // kind === 'all'
  return `<div class="wrap"><table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Voucher</th>
        <th>Type</th>
        <th>Customer / Supplier / Payee</th>
        <th>Account</th>
        <th>Category / Details</th>
        <th>Method</th>
        <th>Reference No.</th>
        <th>Description / Notes</th>
        <th class="num">Amount</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      ${list.map(e => {
        const d = getTxnRowData(e);
        const isIn = e.src === 'in' || e.src === 'sale' || (e.src === 'loan' && e.lines.some(l => l.d && acc(l.a)?.cash));
        const isOut = e.src === 'out' || e.src === 'bill' || e.src === 'exp' || (e.src === 'loan' && e.lines.some(l => l.c && acc(l.a)?.cash));
        const amtColor = isIn ? '#0f5132' : isOut ? '#842029' : '';
        const amtSign = isIn ? '+' : isOut ? '-' : '';
        return `<tr class="k" data-a="ent" data-i="${e.id}" title="Click to view payment receipt / voucher details">
          <td>${e.date}</td>
          <td><code>${esc(e.ref)}</code></td>
          <td><span class="pd-pill ${isIn ? '' : isOut ? 'u' : 'p'}">${esc(d.typeLabel)}</span></td>
          <td><b>${esc(d.partyName)}</b></td>
          <td>${esc(d.acctName)}</td>
          <td>${esc(d.catName)}</td>
          <td>${esc(d.method)}</td>
          <td><code>${esc(d.refNo)}</code></td>
          <td>${esc(d.desc)}</td>
          <td class="num" style="font-weight:600;color:${amtColor}">${amtSign}${fmt(d.amt)}</td>
          <td><span class="b ${e.status === 'posted' ? 'ok' : 'wn'}">${e.status}</span></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;
}

export function renderTxns() {
  const q = (moneyState.q || '').toLowerCase();
  const all = db.entries.slice().reverse();
  const L = all.filter(e => {
    if (!q) return true;
    const d = getTxnRowData(e);
    return (e.date + ' ' + e.ref + ' ' + d.typeLabel + ' ' + d.partyName + ' ' + d.acctName + ' ' + d.catName + ' ' + d.refNo + ' ' + d.desc + ' ' + d.method).toLowerCase().includes(q);
  });

  return head('All Transactions', `<button data-a="csv">Export CSV</button>`) +
    `<div class="filters"><input data-k="q" placeholder="Search narration, party, reference, type, account..." value="${esc(moneyState.q || '')}"></div>` +
    renderTxnTable(L, 'all', 'No transactions match.');
}

export function renderMoneyIn() {
  const q = (moneyState.q || '').toLowerCase();
  const allIn = db.entries.filter(e => e.src === 'in' || (e.src === 'loan' && e.lines.some(l => l.d && acc(l.a)?.cash)));

  const getInAmt = e => {
    if (e.src === 'loan') {
      const cashL = e.lines.find(l => l.d && acc(l.a)?.cash);
      return cashL ? cashL.d : 0;
    }
    return e.lines.reduce((x, l) => x + l.d, 0);
  };

  const totalAmt = allIn.filter(e => e.status === 'posted').reduce((s, e) => s + getInAmt(e), 0);
  const thisMonthStr = today().slice(0, 7);
  const monthAmt = allIn.filter(e => e.status === 'posted' && (e.date || '').startsWith(thisMonthStr)).reduce((s, e) => s + getInAmt(e), 0);
  const cashAmt = allIn.filter(e => e.status === 'posted' && e.lines.some(l => l.d && (l.a === '1000' || (acc(l.a)?.name || '').toLowerCase().includes('cash')))).reduce((s, e) => s + getInAmt(e), 0);
  const bankAmt = totalAmt - cashAmt;

  const L = allIn.filter(e => {
    if (!q) return true;
    const d = getTxnRowData(e);
    return (e.date + ' ' + e.ref + ' ' + d.partyName + ' ' + d.acctName + ' ' + d.catName + ' ' + d.refNo + ' ' + d.desc + ' ' + d.method).toLowerCase().includes(q);
  }).reverse();

  return head('Money In', `<button class="p" data-a="newin">+ Record money received</button>`) +
    `<div class="grid">
      ${kpi('Total Inflow', fmt(totalAmt))}
      ${kpi('This Month', fmt(monthAmt))}
      ${kpi('Cash Inflow', fmt(cashAmt))}
      ${kpi('Bank Inflow', fmt(bankAmt))}
    </div>
    <div class="filters">
      <input data-k="q" placeholder="Search customer, account, category, reference, description..." value="${esc(moneyState.q || '')}">
    </div>` +
    renderTxnTable(L, 'in', 'Nothing recorded yet. Click "+ Record money received" to record income.');
}

export function renderMoneyOut() {
  const q = (moneyState.q || '').toLowerCase();
  const allOut = db.entries.filter(e => e.src === 'out' || e.src === 'exp' || (e.src === 'loan' && e.lines.some(l => l.c && acc(l.a)?.cash)));

  const getOutAmt = e => {
    const cashL = e.lines.find(l => l.c && acc(l.a)?.cash);
    if (cashL) return cashL.c;
    return e.lines.reduce((x, l) => x + l.d, 0);
  };

  const totalAmt = allOut.filter(e => e.status === 'posted').reduce((s, e) => s + getOutAmt(e), 0);
  const thisMonthStr = today().slice(0, 7);
  const monthAmt = allOut.filter(e => e.status === 'posted' && (e.date || '').startsWith(thisMonthStr)).reduce((s, e) => s + getOutAmt(e), 0);
  const cashAmt = allOut.filter(e => e.status === 'posted' && e.lines.some(l => l.c && (l.a === '1000' || (acc(l.a)?.name || '').toLowerCase().includes('cash')))).reduce((s, e) => s + getOutAmt(e), 0);
  const bankAmt = totalAmt - cashAmt;

  const L = allOut.filter(e => {
    if (!q) return true;
    const d = getTxnRowData(e);
    return (e.date + ' ' + e.ref + ' ' + d.partyName + ' ' + d.acctName + ' ' + d.catName + ' ' + d.refNo + ' ' + d.desc + ' ' + d.method).toLowerCase().includes(q);
  }).reverse();

  return head('Money Out', `<button class="p" data-a="newout">+ Record money paid</button>`) +
    `<div class="grid">
      ${kpi('Total Outflow', fmt(totalAmt))}
      ${kpi('This Month', fmt(monthAmt))}
      ${kpi('Cash Outflow', fmt(cashAmt))}
      ${kpi('Bank Outflow', fmt(bankAmt))}
    </div>
    <div class="filters">
      <input data-k="q" placeholder="Search payee, account, category, reference, description..." value="${esc(moneyState.q || '')}">
    </div>` +
    renderTxnTable(L, 'out', 'Nothing recorded yet. Click "+ Record money paid" to record an outgoing payment.');
}

export function renderTransfers() {
  const q = (moneyState.q || '').toLowerCase();
  const allXfer = db.entries.filter(e => e.src === 'xfer');

  const totalAmt = allXfer.filter(e => e.status === 'posted').reduce((s, e) => s + (e.lines[0]?.d || 0), 0);
  const thisMonthStr = today().slice(0, 7);
  const monthAmt = allXfer.filter(e => e.status === 'posted' && (e.date || '').startsWith(thisMonthStr)).reduce((s, e) => s + (e.lines[0]?.d || 0), 0);

  const getXferTypeInfo = e => {
    const fromL = e.lines.find(l => l.c);
    const toL = e.lines.find(l => l.d);
    const isFromCash = fromL && (fromL.a === '1000' || (acc(fromL.a)?.name || '').toLowerCase().includes('cash'));
    const isToCash = toL && (toL.a === '1000' || (acc(toL.a)?.name || '').toLowerCase().includes('cash'));
    if (isFromCash && !isToCash) {
      return { type: 'deposit', label: 'Cash Deposit', badgeClass: 'ok', desc: 'Cash → Bank' };
    }
    if (!isFromCash && isToCash) {
      return { type: 'withdrawal', label: 'Cash Withdrawal', badgeClass: 'p', desc: 'Bank → Cash' };
    }
    return { type: 'bank2bank', label: 'Bank-to-Bank', badgeClass: 'u', desc: 'Bank → Bank' };
  };

  const depositAmt = allXfer.filter(e => e.status === 'posted' && getXferTypeInfo(e).type === 'deposit').reduce((s, e) => s + (e.lines[0]?.d || 0), 0);
  const withdrawalAmt = allXfer.filter(e => e.status === 'posted' && getXferTypeInfo(e).type === 'withdrawal').reduce((s, e) => s + (e.lines[0]?.d || 0), 0);

  const L = allXfer.filter(e => {
    if (!q) return true;
    const fromL = e.lines.find(l => l.c);
    const toL = e.lines.find(l => l.d);
    const fromName = fromL ? an(fromL.a) : '';
    const toName = toL ? an(toL.a) : '';
    const info = getXferTypeInfo(e);
    const str = `${e.date} ${e.ref} ${info.label} ${fromName} ${toName} ${e.meta?.ref || ''} ${e.narr || ''}`.toLowerCase();
    return str.includes(q);
  }).reverse();

  return head('Transfers', `<button class="p" data-a="newxfer">+ New transfer</button>`) +
    `<div class="grid">
      ${kpi('Total Transfers', fmt(totalAmt))}
      ${kpi('This Month', fmt(monthAmt))}
      ${kpi('Cash Deposits (Cash → Bank)', fmt(depositAmt))}
      ${kpi('Cash Withdrawals (Bank → Cash)', fmt(withdrawalAmt))}
    </div>
    <div class="filters">
      <input data-k="q" placeholder="Search transfer type, accounts, reference, notes..." value="${esc(moneyState.q || '')}">
    </div>` +
    (L.length ? `<div class="wrap"><table>
      <thead>
        <tr>
          <th>Date</th>
          <th>Voucher</th>
          <th>Transfer Type</th>
          <th>From Account (Credit)</th>
          <th>To Account (Debit)</th>
          <th>Reference No.</th>
          <th>Notes / Narration</th>
          <th class="num">Amount</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${L.map(e => {
          const fromL = e.lines.find(l => l.c);
          const toL = e.lines.find(l => l.d);
          const info = getXferTypeInfo(e);
          const amt = e.lines.reduce((s, l) => s + l.d, 0);
          const refNo = e.meta?.ref || '-';
          const desc = e.meta?.desc || e.narr || '-';
          return `<tr class="k" data-a="ent" data-i="${e.id}" title="Click to view transfer voucher">
            <td>${e.date}</td>
            <td><code>${esc(e.ref)}</code></td>
            <td><span class="pd-pill ${info.badgeClass}">${esc(info.label)}</span></td>
            <td>${esc(fromL ? an(fromL.a) : '-')}</td>
            <td><b>${esc(toL ? an(toL.a) : '-')}</b></td>
            <td><code>${esc(refNo)}</code></td>
            <td>${esc(desc)}</td>
            <td class="num" style="font-weight:600;color:var(--p)">${fmt(amt)}</td>
            <td><span class="b ${e.status === 'posted' ? 'ok' : 'wn'}">${e.status}</span></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>` : `<div class="wrap"><div class="empty">No internal transfers recorded yet. Click "+ New transfer" to record cash deposits, withdrawals, or bank-to-bank transfers.</div></div>`);
}

export function renderExpenses() {
  const m = moneyState.xm || today().slice(0, 7);
  const c = moneyState.xc || '';
  const L = db.entries.filter(e => e.src === 'exp' && e.date.startsWith(m) && (!c || e.meta.cat === c)).reverse();
  const by = {};
  let tot = 0;
  L.filter(e => e.status === 'posted').forEach(e => {
    tot += e.meta.base;
    by[e.meta.cat] = (by[e.meta.cat] || 0) + e.meta.base;
  });

  return head('Company Expenses', `<button class="p" data-a="newexp">Add expense</button>`) +
    `<div class="filters">
      <input type="month" id="expMonth" value="${m}" aria-label="Month">
      <select id="expCat">
        <option value="">All categories</option>
        ${accOpts(a => a.t === 'X', c)}
      </select>
    </div>
    <div class="grid">
      ${kpi('Expenses (before GST)', fmt(tot))}
      ${Object.entries(by).map(([k, v]) => kpi(esc(acc(k)?.name || k), fmt(v))).join('')}
    </div>` +
    entTable(L, 'No expenses in this period. Add one to start.');
}
