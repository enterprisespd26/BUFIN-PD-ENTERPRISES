import { esc, fmt, head, kpi } from '../modules/utils.js';
import { db, PT, isC, isS, out, partyTypeLabel } from '../modules/state.js';

export const partiesState = {
  pt: 'all',
  pq: ''
};

export function renderParties() {
  const f = partiesState.pt || 'all';
  const q = (partiesState.pq || '').toLowerCase();
  const tradeR = p => db.docs.filter(d => d.party === p.id && d.type === 'sale' && !d.cancelled).reduce((s, d) => s + out(d), 0);
  const tradeY = p => db.docs.filter(d => d.party === p.id && d.type === 'bill' && !d.cancelled).reduce((s, d) => s + out(d), 0);

  const loanR = p => (db.loans || []).filter(l => l.party === p.id && l.dir === 'given').reduce((s, l) => s + Math.max(0, (l.principal || 0) - (l.repaid || 0)), 0);
  const loanY = p => (db.loans || []).filter(l => l.party === p.id && l.dir === 'taken').reduce((s, l) => s + Math.max(0, (l.principal || 0) - (l.repaid || 0)), 0);

  const R = p => tradeR(p) + loanR(p);
  const Y = p => tradeY(p) + loanY(p);

  const matchesFilter = p => {
    if (f === 'customer') return isC(p);
    if (f === 'supplier') return isS(p);
    if (f === 'other' || f === 'lender') return !isC(p) && !isS(p);
    return true;
  };

  const L = db.parties.filter(p =>
    matchesFilter(p) &&
    (!q || (p.name + (p.phone || '') + (p.gstin || '')).toLowerCase().includes(q))
  );

  const emptyMsg = f === 'customer'
    ? 'No commercial trade customers yet. Customers will appear when sales invoices are created.'
    : f === 'supplier'
    ? 'No commercial material suppliers yet. Suppliers will appear when purchase bills are entered.'
    : f === 'other'
    ? 'No lenders or expense payees yet.'
    : 'Nothing here yet. Add customers you sell to and suppliers you buy from.';

  return head('Parties', `<button class="p" data-a="newparty">Add party</button>`) +
    `<div class="grid">
      ${kpi('Customers', db.parties.filter(isC).length)}
      ${kpi('Suppliers', db.parties.filter(isS).length)}
      ${kpi('Customers owe you', fmt(db.parties.filter(isC).reduce((s, p) => s + tradeR(p), 0)))}
      ${kpi('You owe suppliers', fmt(db.parties.filter(isS).reduce((s, p) => s + tradeY(p), 0)))}
    </div>
    <div class="filters parties-filter-bar">
      <div class="parties-segment-track" role="tablist" aria-label="Filter parties by type">
        ${[['all', 'All'], ['customer', 'Customers'], ['supplier', 'Suppliers'], ['other', 'Lenders / Others']].map(x => `
          <button type="button" role="tab" aria-selected="${f === x[0]}" class="parties-seg-btn ${f === x[0] ? 'p active' : ''}" data-a="ptab" data-i="${x[0]}">
            ${x[1]}
          </button>
        `).join('')}
      </div>
      <div class="parties-search-wrap">
        <svg class="parties-search-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <input type="text" data-k="pq" class="parties-search-input" placeholder="Search name, phone, GSTIN..." value="${esc(partiesState.pq || '')}" autocomplete="off" spellcheck="false" aria-label="Search parties">
        ${partiesState.pq ? `
          <button type="button" class="parties-search-clear" data-a="clearpartiessearch" aria-label="Clear search" title="Clear search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        ` : ''}
      </div>
    </div>` +
    (L.length
      ? `<div class="wrap"><table><tr><th>Name</th><th>Type</th><th>Phone</th><th>State</th><th class="num">Owes you</th><th class="num">You owe</th></tr>${L.map(p => `<tr class="k" data-a="stmt" data-i="${p.id}"><td>${esc(p.name)}</td><td>${esc(partyTypeLabel(p))}</td><td>${esc(p.phone || '')}</td><td>${esc(p.state || '')}</td><td class="num">${fmt(R(p))}</td><td class="num">${fmt(Y(p))}</td></tr>`).join('')}</table></div>`
      : `<div class="wrap"><div class="empty">${emptyMsg}</div></div>`);
}
