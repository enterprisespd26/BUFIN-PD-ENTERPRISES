import { esc, fmt, head, kpi } from '../modules/utils.js';
import { db, PT, isC, isS, out } from '../modules/state.js';

export const partiesState = {
  pt: 'all',
  pq: ''
};

export function renderParties() {
  const f = partiesState.pt || 'all';
  const q = (partiesState.pq || '').toLowerCase();
  const R = p => db.docs.filter(d => d.party === p.id && d.type === 'sale' && !d.cancelled).reduce((s, d) => s + out(d), 0);
  const Y = p => db.docs.filter(d => d.party === p.id && d.type === 'bill' && !d.cancelled).reduce((s, d) => s + out(d), 0);
  const L = db.parties.filter(p =>
    (f === 'all' || (f === 'customer' ? isC(p) : f === 'supplier' ? isS(p) : !isC(p) && !isS(p))) &&
    (!q || (p.name + (p.phone || '') + (p.gstin || '')).toLowerCase().includes(q))
  );

  return head('Parties', `<button class="p" data-a="newparty">Add party</button>`) +
    `<div class="grid">
      ${kpi('Customers', db.parties.filter(isC).length)}
      ${kpi('Suppliers', db.parties.filter(isS).length)}
      ${kpi('Customers owe you', fmt(db.parties.reduce((s, p) => s + R(p), 0)))}
      ${kpi('You owe suppliers', fmt(db.parties.reduce((s, p) => s + Y(p), 0)))}
    </div>
    <div class="filters">
      ${[['all', 'All'], ['customer', 'Customers'], ['supplier', 'Suppliers'], ['other', 'Others']].map(x => `<button class="${f === x[0] ? 'p' : ''}" data-a="ptab" data-i="${x[0]}">${x[1]}</button>`).join('')}
      <input data-k="pq" placeholder="Search name, phone, GSTIN" value="${esc(partiesState.pq || '')}">
    </div>` +
    (L.length
      ? `<div class="wrap"><table><tr><th>Name</th><th>Type</th><th>Phone</th><th>State</th><th class="num">Owes you</th><th class="num">You owe</th></tr>${L.map(p => `<tr class="k" data-a="stmt" data-i="${p.id}"><td>${esc(p.name)}</td><td>${(PT[p.type] || p.type).split(' (')[0]}</td><td>${esc(p.phone || '')}</td><td>${esc(p.state || '')}</td><td class="num">${fmt(R(p))}</td><td class="num">${fmt(Y(p))}</td></tr>`).join('')}</table></div>`
      : '<div class="wrap"><div class="empty">Nothing here yet. Add customers you sell to and suppliers you buy from.</div></div>');
}
