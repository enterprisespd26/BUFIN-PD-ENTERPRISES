/* =====================================================================
   BUFIN mobile layer  (frontend/js/modules/mobile.js)
   - Injects one mobile stylesheet (phones <= 760px, desktop untouched)
   - Turns every data table into labelled cards (each value gets its column name)
   - Tidies filter bars, tabs, bottom tab bar, forms and tap targets
   - Swaps emoji icons on buttons for crisp SVG icons
   It watches the DOM, so every page and every popup is covered automatically.
   ===================================================================== */

const MOBILE_MAX = 760;

const CSS = String.raw`
:root { --m-blue: #4263eb; --m-blue-soft: #edf1ff; --m-ink: #0f172a; --m-mute: #64748b; --m-line: #e5e9f2; }

.mc-ico { display: inline-flex; vertical-align: -3px; margin-right: 6px; }
.mc-ico svg { width: 1.1em; height: 1.1em; display: block; }

@media (max-width: ${MOBILE_MAX}px) {

  /* ---------- Inputs & tap targets (no iOS zoom, easy to hit) ---------- */
  input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]),
  select, textarea { font-size: 16px !important; }
  input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=file]),
  select { min-height: 44px; }
  button, .btn { min-height: 42px; touch-action: manipulation; }
  button.sm, .btn.sm { min-height: 34px; }
  .num { font-variant-numeric: tabular-nums; }

  /* ---------- Segmented tabs (New invoice | Records | Scrap items) ---------- */
  .pd-nav-tabs { display: flex !important; flex-wrap: nowrap !important; overflow-x: auto; gap: 4px !important; padding: 4px !important;
    margin-bottom: 14px !important; border: 0 !important; background: #eef1f8; border-radius: 12px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
  .pd-nav-tabs::-webkit-scrollbar { display: none; }
  .pd-nav-tabs button { flex: 1 0 auto; white-space: nowrap; padding: 9px 14px !important; border-radius: 9px !important; font-size: 13.5px; font-weight: 600;
    color: var(--m-mute) !important; background: transparent !important; box-shadow: none; }
  .pd-nav-tabs button.on { background: #fff !important; color: var(--m-blue) !important; box-shadow: 0 1px 3px rgba(15,23,42,.14); }

  /* ---------- Filter bars ---------- */
  .filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .filters > input, .filters > select { flex: 1 1 100%; width: 100% !important; max-width: none !important; order: 20; }
  .filters > button { flex: 1 1 auto; min-width: 0; }
  .filters > div[style*="flex:1"] { flex: 1 1 100% !important; min-width: 0 !important; order: 20; }
  .filters > div[style*="flex:1"] input { width: 100% !important; }
  .mc-chips { display: flex !important; flex-wrap: nowrap !important; overflow-x: auto; gap: 6px; width: 100%; padding-bottom: 2px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
  .mc-chips::-webkit-scrollbar { display: none; }
  .mc-chips > button { flex: 0 0 auto; white-space: nowrap; }
  .mc-row { display: flex !important; gap: 8px !important; width: 100%; }
  .mc-row > label { flex: 1 1 0 !important; min-width: 0; }
  .mc-row input[type=date], .filters input[type=date] { width: 100% !important; }

  /* Search + export toolbars (Sales, Bills, Inventory) */
  .pd-btn-row input[type=text] { flex: 1 1 150px; min-width: 0; width: auto !important; max-width: none !important; }
  #pd-tab-inventory .pd-card > .pd-btn-row { flex-direction: column; align-items: stretch !important; }
  #inv_search_q, #inv_filter_sup { flex: 1 1 100%; width: 100% !important; max-width: none !important; }
  #inv_from_date, #inv_to_date { flex: 1 1 calc(50% - 6px); width: auto !important; min-width: 0; }
  #inv_btn_csv { width: 100%; }

  /* ---------- Cards, grids, forms ---------- */
  .pd-card { padding: 14px !important; border-radius: 14px; }
  .pd-grid { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)) !important; gap: 12px !important; }
  .two { grid-template-columns: 1fr !important; }
  .grid > :last-child:nth-child(odd), .grid-5 > :last-child:nth-child(odd), .grid-6 > :last-child:nth-child(odd) { grid-column: 1 / -1; }
  /* ---------- App Header Bar (Menu toggle + Title + Action button) ---------- */
  .bar {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    justify-content: flex-start !important;
    flex-wrap: nowrap !important;
    gap: 10px !important;
    margin-bottom: 12px !important;
  }
  .bar > button.menu, button.menu {
    display: none !important;
  }
  .bar > h2 {
    flex: 1 1 auto !important;
    margin: 0 !important;
    font-size: 19px !important;
    font-weight: 700 !important;
    color: var(--tx, #0f172a);
    min-width: 0;
    line-height: 1.25;
  }
  .bar > div {
    flex: 0 0 auto !important;
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
    margin-left: auto;
  }
  .bar > div > button, .bar > div > .btn,
  .bar > button:not(.menu), .bar > .btn:not(.menu) {
    min-height: 38px !important;
    padding: 6px 14px !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    border-radius: 9px !important;
    white-space: nowrap !important;
    width: auto !important;
  }

  /* ---------- Balance Sheet & Financial Statements Mobile Layout ---------- */
  .bs-filter-bar {
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 8px !important;
    margin-bottom: 12px !important;
  }
  .bs-filter-bar .bs-filter-top {
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    gap: 8px !important;
    flex-wrap: wrap !important;
    width: 100% !important;
  }
  .bs-filter-bar .bs-presets {
    display: flex !important;
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    gap: 6px !important;
    flex: 1 1 auto !important;
    padding-bottom: 2px !important;
    scrollbar-width: none !important;
  }
  .bs-filter-bar .bs-presets > button {
    flex: 1 1 0 !important;
    white-space: nowrap !important;
    padding: 8px 12px !important;
    font-size: 13px !important;
    min-height: 38px !important;
  }
  .bs-filter-bar .bs-date-wrap {
    flex: 0 0 auto !important;
  }
  .bs-filter-bar .bs-date-wrap label {
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
    margin: 0 !important;
    font-size: 12.5px !important;
    font-weight: 600 !important;
    color: var(--t2, #64748b) !important;
  }
  .bs-filter-bar .bs-date-wrap input[type=date] {
    width: auto !important;
    min-height: 38px !important;
    padding: 4px 8px !important;
  }
  .bs-filter-bar .bs-toggle-wrap {
    display: flex !important;
    width: 100% !important;
    gap: 6px !important;
    background: #edf1ff !important;
    padding: 3px !important;
    border-radius: 10px !important;
  }
  .bs-filter-bar .bs-toggle-wrap > button {
    flex: 1 1 50% !important;
    text-align: center !important;
    white-space: nowrap !important;
    font-size: 12.5px !important;
    font-weight: 600 !important;
    padding: 8px 6px !important;
    border-radius: 8px !important;
    border: 0 !important;
    box-shadow: none !important;
    background: transparent !important;
    color: var(--m-mute, #64748b) !important;
    min-height: 36px !important;
  }
  .bs-filter-bar .bs-toggle-wrap > button.p {
    background: #fff !important;
    color: var(--m-blue, #4263eb) !important;
    box-shadow: 0 1px 3px rgba(15,23,42,.12) !important;
  }

  /* Bottom clearance so table is never obscured by #tab */
  #appMain, main, #v {
    padding-bottom: calc(90px + env(safe-area-inset-bottom, 20px)) !important;
  }
  .wrap:last-child {
    margin-bottom: 24px !important;
  }

  /* ---------- Bottom tab bar ---------- */
  #tab .tab-item { color: #7b879c; }
  #tab .tab-item.on { color: var(--m-blue); }
  #tab .tab-item .tab-icon { display: inline-flex; align-items: center; justify-content: center; width: 54px; height: 30px; border-radius: 15px; transition: background .15s; }
  #tab .tab-item.on .tab-icon { background: var(--m-blue-soft); }
  #tab .tab-item .tab-icon svg { width: 22px; height: 22px; }
  #tab .tab-label { font-size: 11px; font-weight: 600; letter-spacing: .1px; }

  /* ---------- PIN screen ---------- */
  #pinScreen [data-n] { min-height: 60px; font-size: 24px; touch-action: manipulation; }

  /* =========================================================
     TABLES  ->  labelled cards  (class added by JS: table.mcard)
     ========================================================= */
  .mc-wrap { overflow: visible !important; border: 0 !important; background: transparent !important; box-shadow: none !important; padding: 0 !important; margin: 0 0 6px !important; }

  table.mcard, table.mcard tbody, table.mcard tfoot { display: block !important; width: 100% !important; border: 0 !important; background: transparent !important; }
  table.mcard thead, table.mcard tr.mc-head { display: none !important; }

  table.mcard tr { display: flex !important; flex-direction: column; background: #fff !important; border: 1px solid var(--bd, var(--m-line)) !important;
    border-radius: 14px; padding: 2px 14px 4px !important; margin: 0 0 10px !important; box-shadow: 0 1px 2px rgba(15,23,42,.05); }
  table.mcard tr.k:active { background: #f5f7ff !important; }
  table.mcard tr.tot { background: #f4f6fb !important; }

  table.mcard td.mc-cell { display: flex !important; align-items: baseline; justify-content: space-between; gap: 14px;
    padding: 9px 0 !important; border: 0 !important; border-bottom: 1px dashed var(--bd, var(--m-line)) !important; background: transparent !important;
    text-align: right !important; font-size: 13.5px; line-height: 1.4; min-width: 0; overflow-wrap: anywhere; }
  table.mcard td.mc-cell:last-child { border-bottom: 0 !important; }
  table.mcard td.mc-cell::before { content: attr(data-label); flex: 0 0 36%; max-width: 40%; text-align: left; color: var(--t2, var(--m-mute));
    font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .35px; }
  table.mcard td.mc-empty { display: none !important; }

  table.mcard td.mc-title { order: -1; display: block !important; text-align: left !important; font-size: 15px; font-weight: 700; color: var(--tx, var(--m-ink));
    padding: 12px 0 10px !important; border-bottom: 1px solid var(--bd, var(--m-line)) !important; }
  table.mcard td.mc-title::before, table.mcard td.mc-span::before, table.mcard td.mc-actions::before { display: none !important; }
  table.mcard td.mc-title select, table.mcard td.mc-title input { width: 100%; }

  table.mcard td.mc-span { display: block !important; text-align: left !important; font-weight: 700; padding: 12px 0 !important; border-bottom: 0 !important; }
  table.mcard td.mc-span.empty { text-align: center !important; color: var(--t2, var(--m-mute)); font-weight: 500; padding: 22px 0 !important; }

  table.mcard td.mc-amt { font-weight: 700; color: var(--tx, var(--m-ink)); }
  table.mcard td.mc-cell input, table.mcard td.mc-cell select { flex: 1 1 55%; max-width: 62%; width: auto; text-align: right; }

  table.mcard td.mc-actions { display: flex !important; justify-content: flex-end; flex-wrap: wrap; gap: 8px; padding: 12px 0 8px !important; border-top: 1px solid var(--bd, var(--m-line)) !important; border-bottom: 0 !important; }
  table.mcard td.mc-actions .pd-btn-row { justify-content: flex-end; }

  /* Tables that cannot become cards (statements, 2-column lists) stay real tables, just tidy */
  .mc-wrap-plain { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
  table.mc-plain { display: table !important; width: 100% !important; }
  table.mc-plain thead { display: table-header-group !important; }
  table.mc-plain tbody, table.mc-plain tfoot { display: table-row-group !important; }
  table.mc-plain tr { display: table-row !important; }
  table.mc-plain th, table.mc-plain td { display: table-cell !important; padding: 10px 12px !important; font-size: 13px; vertical-align: top; }
}
`;

/* ---------------- Icons ---------------- */
const svg = body => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const BTN_ICONS = {
  '📎': svg('<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>'),
  '📁': svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  '📷': svg('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>'),
  '✏': svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  '↩': svg('<polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>'),
  '🔒': svg('<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>'),
  '🗑': svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>')
};
const EMOJI_RX = /(📎|📁|📷|✏️?|↩️?|🔒|🗑️?)/g;
const EMOJI_TEST = /(📎|📁|📷|✏️?|↩️?|🔒|🗑️?)/;

const TAB_ICONS = {
  overview: svg('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>'),
  sales: svg('<path d="M5 3v18l2.5-1.5L10 21l2-1.5 2 1.5 2.5-1.5L19 21V3l-2.5 1.5L14 3l-2 1.5L10 3 7.5 4.5z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/>'),
  coa: svg('<rect x="5" y="2" width="14" height="20" rx="2"/><rect x="8" y="5" width="8" height="4" rx="1"/><line x1="8" y1="13" x2="8.01" y2="13"/><line x1="12" y1="13" x2="12.01" y2="13"/><line x1="16" y1="13" x2="16.01" y2="13"/><line x1="8" y1="17" x2="8.01" y2="17"/><line x1="12" y1="17" x2="12.01" y2="17"/><line x1="16" y1="17" x2="16.01" y2="17"/>'),
  menu: svg('<line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/>')
};

/* ---------------- Table -> labelled cards ---------------- */
const EMPTY = new Set(['', '-', '–', '—']);
const TITLE_RX = [
  /^(item|name|account name|material name|loan name|invoice|document)/i,
  /customer|supplier|payee|payer/i,
  /^(narration|details|particulars)/i,
  /transfer type/i,
  /voucher/i
];
const AMT_RX = /^(amount|total|balance|debit|credit|money in|money out|outstanding|owes you|you owe|principal|remaining|current stock|total investment|total paid)/i;
const SKIP_SEL = '.sheet, .plx-root, #pd_invoice_modal, .att-card, [data-no-mcard]';

function headRowOf(table) {
  const first = table.tHead && table.tHead.rows[0];
  if (first) return first;
  return [...table.rows].find(r => r.cells.length && [...r.cells].every(c => c.tagName === 'TH')) || null;
}

function enhanceTable(table) {
  if (table.dataset.mc) return;
  if (table.closest(SKIP_SEL)) { table.dataset.mc = 'skip'; return; }

  const wrap = table.closest('.wrap, .pd-table-wrap');
  const headRow = headRowOf(table);
  const heads = [];
  if (headRow) {
    [...headRow.cells].forEach(th => {
      const span = th.colSpan || 1;
      for (let i = 0; i < span; i++) heads.push(i === 0 ? th.textContent.replace(/\s+/g, ' ').trim() : '');
    });
  }

  // Statements / 2-column lists / tables without headings stay as tidy real tables
  if (!headRow || heads.length < 3) {
    table.dataset.mc = 'plain';
    table.classList.add('mc-plain');
    if (wrap) wrap.classList.add('mc-wrap-plain');
    return;
  }

  headRow.classList.add('mc-head');

  let title = -1;
  for (const rx of TITLE_RX) {
    const i = heads.findIndex(h => rx.test(h));
    if (i > -1) { title = i; break; }
  }
  if (title < 0) title = 0;

  [...table.rows].forEach(tr => {
    if (tr === headRow) return;
    let col = 0;
    [...tr.cells].forEach(td => {
      const span = td.colSpan || 1;
      const label = heads[col] || '';
      td.classList.add('mc-cell');
      td.dataset.label = label;

      const hasControl = !!td.querySelector('input, select, button, textarea, img, svg, a');
      const text = td.textContent.replace(/\s+/g, ' ').trim();

      if (span > 1 || tr.cells.length === 1) {
        td.classList.add('mc-span');
      } else if (col === title) {
        td.classList.add('mc-title');
      } else if (!label && td.querySelector('button, a')) {
        td.classList.add('mc-actions');
      } else if (/^actions?$/i.test(label)) {
        td.classList.add('mc-actions');
      } else if (!hasControl && EMPTY.has(text)) {
        td.classList.add('mc-empty');
      }
      if (AMT_RX.test(label)) td.classList.add('mc-amt');
      col += span;
    });
  });

  table.classList.add('mcard');
  table.dataset.mc = '1';
  if (wrap) wrap.classList.add('mc-wrap');
}

/* ---------------- Small DOM helpers ---------------- */
function swapButtonEmoji(root) {
  root.querySelectorAll('button:not([data-mce]), a.btn:not([data-mce])').forEach(el => {
    el.setAttribute('data-mce', '1');
    if (!EMOJI_TEST.test(el.textContent)) return;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => {
      const val = n.nodeValue;
      if (!EMOJI_TEST.test(val)) return;
      const frag = document.createDocumentFragment();
      let last = 0;
      val.replace(EMOJI_RX, (m, g, off) => {
        frag.append(val.slice(last, off));
        const key = m.replace(/\uFE0F/g, '');
        const sp = document.createElement('span');
        sp.className = 'mc-ico';
        sp.innerHTML = BTN_ICONS[key] || '';
        frag.append(sp);
        last = off + m.length;
        return m;
      });
      frag.append(val.slice(last));
      n.replaceWith(frag);
    });
  });
}

function enhanceFilters(root) {
  root.querySelectorAll('.filters > div:not([data-mcf])').forEach(div => {
    div.setAttribute('data-mcf', '1');
    const kids = [...div.children];
    if (!kids.length) return;
    if (kids.every(k => k.tagName === 'BUTTON')) div.classList.add('mc-chips');
    else if (kids.some(k => k.tagName === 'LABEL')) div.classList.add('mc-row');
  });
}

function enhanceTabBar() {
  document.querySelectorAll('#tab .tab-item:not([data-mci])').forEach(a => {
    a.setAttribute('data-mci', '1');
    const icon = a.querySelector('.tab-icon');
    const key = a.dataset.i;
    if (icon && TAB_ICONS[key]) icon.innerHTML = TAB_ICONS[key];
  });
}

function dropTooltips() {
  if (window.innerWidth > MOBILE_MAX) return;
  document.querySelectorAll('table tr[title]').forEach(tr => tr.removeAttribute('title'));
}

/* ---------------- Public API ---------------- */
export function enhanceMobile(root = document) {
  root.querySelectorAll('table:not([data-mc])').forEach(enhanceTable);
  enhanceFilters(root);
  swapButtonEmoji(root);
  enhanceTabBar();
  dropTooltips();
}

export function injectMobileStyles() {
  if (document.getElementById('bufin-mobile-css')) return;
  const st = document.createElement('style');
  st.id = 'bufin-mobile-css';
  st.textContent = CSS;
  document.head.appendChild(st);

  // Make sure phones use the real device width and respect the notch / home bar
  let meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = 'width=device-width, initial-scale=1';
    document.head.appendChild(meta);
  }
  if (!/viewport-fit/.test(meta.content)) meta.content += ', viewport-fit=cover';
}

let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    try { enhanceMobile(); } catch (e) { console.warn('mobile layer:', e); }
  });
}

export function initMobileLayer() {
  if (typeof document === 'undefined' || window.__bufinMobile) return;
  window.__bufinMobile = true;
  injectMobileStyles();
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
  schedule();
}

initMobileLayer();
