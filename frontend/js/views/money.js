import { esc, fmt, fmtDate, today, head, kpi } from '../modules/utils.js';
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
    if (e.meta?.catName) catName = e.meta.catName;
    else if (catCode === '1100') catName = 'Customer Receipt (Accounts Receivable)';
    else if (catCode === '3000') catName = 'Capital Introduced';
    else if (catCode === '4300') catName = 'Interest Income';
    else if (catCode === '4200') catName = 'Other Income';
    else catName = an(catCode);
  } else if (e.src === 'out' || e.src === 'exp') {
    const crCash = e.lines.find(l => l.c && acc(l.a)?.cash);
    acctName = crCash ? an(crCash.a) : (e.meta?.acct ? an(e.meta.acct) : (e.lines[1] ? an(e.lines[1].a) : ''));
    const debCat = e.lines.find(l => l.d && !acc(l.a)?.cash && l.a !== '1300');
    const catCode = debCat ? debCat.a : (e.meta?.cat || (e.lines[0] ? e.lines[0].a : ''));
    if (e.meta?.catName) catName = e.meta.catName;
    else if (e.meta?.customCat) catName = e.meta.customCat;
    else if (catCode === '2000') catName = 'Supplier Payment';
    else if (catCode === '2100') catName = 'Loan Repayment / EMI';
    else if (catCode === '5000') catName = 'Purchases / COGS';
    else if (catCode === '5100') catName = 'Rent Expense';
    else if (catCode === '5200') catName = 'Transport Expense';
    else if (catCode === '5300') catName = 'Salaries';
    else if (catCode === '5400') catName = 'Utilities';
    else if (catCode === '5500') catName = 'Interest Expense';
    else if (catCode === '5600') catName = 'Miscellaneous Expense';
    else if (catCode === '5700') catName = 'Licenses & Permits';
    else if (catCode === '5800') catName = 'Legal & GST Charges';
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

  let refNo = e.meta?.ref || e.meta?.docNo || e.meta?.refNo || '';
  if (!refNo && db.docs) {
    const d = db.docs.find(x => x.je === e.id || (x.pays && x.pays.some(p => p.je === e.id)));
    if (d) {
      const pay = d.pays && d.pays.find(p => p.je === e.id);
      refNo = pay?.ref || d.no || d.sno || '';
    }
  }
  if (!refNo && db.loans) {
    const l = db.loans.find(x => x.id === e.meta?.loanId || (x.hist && x.hist.some(h => h.jeRef === e.ref)));
    if (l) {
      const h = l.hist && l.hist.find(h => h.jeRef === e.ref);
      refNo = h?.refNo || l.ref || '';
    }
  }
  if (!refNo) refNo = e.ref || '';

  const desc = (e.meta && typeof e.meta.desc === 'string') ? (e.meta.desc.trim() || '-') : (e.narr || '-');

  if (!method) {
    method = e.meta?.method || '';
  }
  if (!method && db.docs) {
    const d = db.docs.find(x => x.je === e.id || x.no === e.meta?.docNo || (x.pays && x.pays.some(p => p.je === e.id)));
    if (d) {
      const pay = d.pays && d.pays.find(p => p.je === e.id);
      method = pay?.method || d.pm || '';
    }
  }
  if (!method && db.loans) {
    const l = db.loans.find(x => x.id === e.meta?.loanId || x.ref === e.meta?.loanRef || (x.hist && x.hist.some(h => h.jeRef === e.ref)));
    if (l) {
      const h = l.hist && l.hist.find(h => h.jeRef === e.ref);
      method = h?.method || ((acc(l.acct)?.name || '').toLowerCase().includes('cash') ? 'Cash' : 'Bank Transfer');
    }
  }
  if (!method && e.narr) {
    const n = e.narr.toLowerCase();
    if (n.includes('bank transfer') || n.includes('neft') || n.includes('rtgs') || n.includes('imps')) method = 'Bank Transfer';
    else if (n.includes('upi')) method = 'UPI';
    else if (n.includes('cheque')) method = 'Cheque';
    else if (n.includes('cash')) method = 'Cash';
  }
  if (!method) {
    const cashL = e.lines.find(l => acc(l.a)?.cash);
    if (cashL) {
      const aName = (acc(cashL.a)?.name || '').toLowerCase();
      method = aName.includes('cash') ? 'Cash' : 'Bank Transfer';
    } else if (acctName) {
      const aName = acctName.toLowerCase();
      method = aName.includes('cash') ? 'Cash' : aName.includes('bank') ? 'Bank Transfer' : '';
    }
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

export function renderMoneySearchBar(placeholder = 'Search transactions...', key = 'q') {
  const val = moneyState.q || '';
  return `<div class="money-search-wrap">
    <div class="money-search-inner">
      <svg class="money-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
      </svg>
      <input type="text" data-k="${key}" class="money-search-input" placeholder="${esc(placeholder)}" value="${esc(val)}" autocomplete="off" spellcheck="false" aria-label="${esc(placeholder)}">
      ${val ? `
        <button type="button" class="money-search-clear" data-a="clearmoneysearch" aria-label="Clear search" title="Clear search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      ` : ''}
    </div>
  </div>`;
}

function renderTxnTable(list, kind, emptyMsg) {
  if (!list.length) {
    const isFiltered = Boolean(moneyState.q);
    return `<div class="wrap">
      <div class="empty txns-empty-state">
        <div class="txns-empty-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            ${isFiltered ? `
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            ` : `
              <rect x="2" y="5" width="20" height="14" rx="2"></rect>
              <line x1="2" y1="10" x2="22" y2="10"></line>
            `}
          </svg>
        </div>
        <div class="txns-empty-title">${isFiltered ? 'No transactions match' : (emptyMsg || 'No transactions found.')}</div>
        ${isFiltered ? `
          <div class="txns-empty-sub">Try searching with a different keyword, account, or reference.</div>
          <button type="button" class="btn alt sm txns-empty-clear-btn" data-a="clearmoneysearch">Clear search</button>
        ` : ''}
      </div>
    </div>`;
  }

  if (kind === 'in') {
    return `<div class="wrap txns-data-card">
      <div class="txns-card-header">
        <div class="txns-card-header-left">
          <span class="txns-card-title">Income Receipts</span>
          <span class="txns-count-badge">${list.length} ${list.length === 1 ? 'receipt' : 'receipts'}</span>
        </div>
        <div class="txns-card-header-right">
          <span class="txns-hint-text">Click any row to view payment receipt</span>
        </div>
      </div>
      <div class="txns-table-scroll">
        <table class="txns-table">
          <thead>
            <tr>
              <th class="th-date">Date</th>
              <th class="th-party">Customer / Payer</th>
              <th class="th-account">Deposit To Account</th>
              <th class="th-category">Income Category</th>
              <th class="th-method">Method</th>
              <th class="th-ref">Reference No.</th>
              <th class="th-desc">Description / Notes</th>
              <th class="num th-amt">Amount</th>
              <th class="th-status">Status</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(e => {
              const d = getTxnRowData(e);
              return `<tr class="k" data-a="ent" data-i="${e.id}" title="Click to view payment receipt">
                <td class="col-date">${fmtDate(e.date)}</td>
                <td class="col-party"><b>${esc(d.partyName)}</b></td>
                <td class="col-account"><span class="account-tag">${esc(d.acctName)}</span></td>
                <td class="col-category">${esc(d.catName)}</td>
                <td class="col-method"><span class="method-tag">${esc(d.method)}</span></td>
                <td class="col-ref"><span class="ref-badge">${esc(d.refNo)}</span></td>
                <td class="col-desc" title="${esc(d.desc)}">${esc(d.desc)}</td>
                <td class="num col-amt" style="color:#15803D;font-weight:700">+${fmt(d.amt)}</td>
                <td class="col-status"><span class="b ${e.status === 'posted' ? 'ok' : 'wn'}">${e.status}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  if (kind === 'out') {
    return `<div class="wrap txns-data-card">
      <div class="txns-card-header">
        <div class="txns-card-header-left">
          <span class="txns-card-title">Expense &amp; Payment Vouchers</span>
          <span class="txns-count-badge">${list.length} ${list.length === 1 ? 'payment' : 'payments'}</span>
        </div>
        <div class="txns-card-header-right">
          <span class="txns-hint-text">Click any row to view payment voucher</span>
        </div>
      </div>
      <div class="txns-table-scroll">
        <table class="txns-table">
          <thead>
            <tr>
              <th class="th-date">Date</th>
              <th class="th-party">Supplier / Payee</th>
              <th class="th-account">Paid From Account</th>
              <th class="th-category">Expense / Payment Category</th>
              <th class="th-method">Method</th>
              <th class="th-ref">Reference No.</th>
              <th class="th-desc">Description / Notes</th>
              <th class="num th-amt">Amount</th>
              <th class="th-status">Status</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(e => {
              const d = getTxnRowData(e);
              return `<tr class="k" data-a="ent" data-i="${e.id}" title="Click to view payment voucher">
                <td class="col-date">${fmtDate(e.date)}</td>
                <td class="col-party"><b>${esc(d.partyName)}</b></td>
                <td class="col-account"><span class="account-tag">${esc(d.acctName)}</span></td>
                <td class="col-category">${esc(d.catName)}</td>
                <td class="col-method"><span class="method-tag">${esc(d.method)}</span></td>
                <td class="col-ref"><span class="ref-badge">${esc(d.refNo)}</span></td>
                <td class="col-desc" title="${esc(d.desc)}">${esc(d.desc)}</td>
                <td class="num col-amt" style="color:#B91C1C;font-weight:700">-${fmt(d.amt)}</td>
                <td class="col-status"><span class="b ${e.status === 'posted' ? 'ok' : 'wn'}">${e.status}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  // kind === 'all'
  return `<div class="wrap txns-data-card">
    <div class="txns-card-header">
      <div class="txns-card-header-left">
        <span class="txns-card-title">Activity Audit Trail</span>
        <span class="txns-count-badge">${list.length} ${list.length === 1 ? 'voucher' : 'vouchers'}</span>
      </div>
      <div class="txns-card-header-right">
        <span class="txns-hint-text">Click any row to view voucher details</span>
      </div>
    </div>
    <div class="txns-table-scroll">
      <table class="txns-table">
        <thead>
          <tr>
            <th class="th-date">Date</th>
            <th class="th-voucher">Voucher</th>
            <th class="th-type">Type</th>
            <th class="th-party">Customer / Supplier / Payee</th>
            <th class="th-account">Account</th>
            <th class="th-category">Category / Details</th>
            <th class="th-method">Method</th>
            <th class="th-ref">Reference No.</th>
            <th class="th-desc">Description / Notes</th>
            <th class="num th-amt">Amount</th>
            <th class="th-status">Status</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(e => {
            const d = getTxnRowData(e);
            const isIn = e.src === 'in' || e.src === 'sale' || (e.src === 'loan' && e.lines.some(l => l.d && acc(l.a)?.cash));
            const isOut = e.src === 'out' || e.src === 'bill' || e.src === 'exp' || (e.src === 'loan' && e.lines.some(l => l.c && acc(l.a)?.cash));
            const amtColor = isIn ? '#15803D' : isOut ? '#B91C1C' : '#334155';
            const amtSign = isIn ? '+' : isOut ? '-' : '';
            const typeClass = isIn ? 'type-in' : isOut ? 'type-out' : 'type-xfer';
            return `<tr class="k" data-a="ent" data-i="${e.id}" title="Click to view voucher ${esc(e.ref)} details">
              <td class="col-date">${fmtDate(e.date)}</td>
              <td class="col-voucher"><span class="voucher-badge">${esc(e.ref)}</span></td>
              <td class="col-type"><span class="txn-type-pill ${typeClass}">${esc(d.typeLabel)}</span></td>
              <td class="col-party"><b>${esc(d.partyName)}</b></td>
              <td class="col-account"><span class="account-tag">${esc(d.acctName)}</span></td>
              <td class="col-category">${esc(d.catName)}</td>
              <td class="col-method"><span class="method-tag">${esc(d.method)}</span></td>
              <td class="col-ref"><span class="ref-badge">${esc(d.refNo)}</span></td>
              <td class="col-desc" title="${esc(d.desc)}">${esc(d.desc)}</td>
              <td class="num col-amt" style="font-weight:700;color:${amtColor}">${amtSign}${fmt(d.amt)}</td>
              <td class="col-status"><span class="b ${e.status === 'posted' ? 'ok' : 'wn'}">${e.status}</span></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

export function renderTxns() {
  const q = (moneyState.q || '').toLowerCase();
  const all = db.entries.slice().reverse();
  const L = all.filter(e => {
    if (!q) return true;
    const d = getTxnRowData(e);
    return (e.date + ' ' + e.ref + ' ' + d.typeLabel + ' ' + d.partyName + ' ' + d.acctName + ' ' + d.catName + ' ' + d.refNo + ' ' + d.desc + ' ' + d.method).toLowerCase().includes(q);
  });

  // Calculate live summary metrics for top KPI cards
  let totalIn = 0;
  let totalOut = 0;
  let postedCount = 0;

  all.forEach(e => {
    if (e.status !== 'posted') return;
    postedCount++;
    const d = getTxnRowData(e);
    const isIn = e.src === 'in' || e.src === 'sale' || (e.src === 'loan' && e.lines.some(l => l.d && acc(l.a)?.cash));
    const isOut = e.src === 'out' || e.src === 'bill' || e.src === 'exp' || (e.src === 'loan' && e.lines.some(l => l.c && acc(l.a)?.cash));
    if (isIn) totalIn += (d.amt || 0);
    else if (isOut) totalOut += (d.amt || 0);
  });
  const netMovement = totalIn - totalOut;

  return head('All Transactions', `<button data-a="csv">Export CSV</button>`) +
    `<div class="grid">
      ${kpi('Total Transactions', postedCount.toString())}
      ${kpi('Total Inflow', fmt(totalIn))}
      ${kpi('Total Outflow', fmt(totalOut))}
      ${kpi('Net Ledger Balance', fmt(netMovement))}
    </div>` +
    renderMoneySearchBar('Search transactions...', 'q') +
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
    </div>` +
    renderMoneySearchBar('Search income, customer, ref...', 'q') +
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
    </div>` +
    renderMoneySearchBar('Search payments, payee, ref...', 'q') +
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
    </div>` +
    renderMoneySearchBar('Search transfers, accounts, ref...', 'q') +
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
            <td>${fmtDate(e.date)}</td>
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
