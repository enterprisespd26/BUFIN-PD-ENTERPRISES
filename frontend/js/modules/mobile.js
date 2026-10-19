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
  .filters { display: flex !important; flex-wrap: wrap !important; gap: 8px !important; align-items: stretch !important; width: 100% !important; }
  .filters > div, .filters > .mc-chips, .filters > .mc-row { flex: 1 1 100% !important; width: 100% !important; max-width: 100% !important; }
  .filters > input, .filters > select { flex: 1 1 100% !important; width: 100% !important; max-width: none !important; order: 20; min-height: 44px !important; }
  .filters > button { flex: 0 0 auto !important; min-width: 0; min-height: 38px !important; }
  .filters > div[style*="flex:1"], .filters > div[style*="min-width"] { flex: 1 1 100% !important; min-width: 0 !important; width: 100% !important; order: 20; }
  .filters > div[style*="flex:1"] input, .filters > div[style*="min-width"] input { width: 100% !important; }

  .mc-chips, .filters > div:has(> button) { display: flex !important; flex-wrap: nowrap !important; overflow-x: auto !important; gap: 6px !important; width: 100% !important; padding-bottom: 2px !important; scrollbar-width: none !important; -webkit-overflow-scrolling: touch !important; }
  .mc-chips::-webkit-scrollbar, .filters > div:has(> button)::-webkit-scrollbar { display: none !important; }
  .mc-chips > button, .filters > div:has(> button) > button { flex: 0 0 auto !important; flex-shrink: 0 !important; white-space: nowrap !important; min-height: 38px !important; padding: 6px 14px !important; }

  .mc-row, .filters > div:has(input[type=date]) { display: flex !important; flex-direction: row !important; align-items: center !important; gap: 8px !important; width: 100% !important; flex: 1 1 100% !important; }
  .mc-row > label, .filters > div:has(input[type=date]) > label { flex: 1 1 50% !important; min-width: 0 !important; display: flex !important; align-items: center !important; gap: 6px !important; margin: 0 !important; font-size: 12px !important; }
  .mc-row input[type=date], .filters input[type=date] { width: 100% !important; min-height: 40px !important; box-sizing: border-box !important; }

  /* Uniform search controls */
  input[placeholder^="Search"], input[data-k$="q"], #pd_search_q, #u_s, #inv_search_q, .filters input[type=text], .filters input:not([type]) {
    min-height: 44px !important;
    height: 44px !important;
    padding-left: 16px !important;
    padding-right: 16px !important;
    font-size: 14.5px !important;
    border-radius: 10px !important;
    width: 100% !important;
    max-width: 100% !important;
    box-sizing: border-box !important;
  }
  .filters select[style*="min-width"], #glAccSelect { min-width: 0 !important; width: 100% !important; max-width: 100% !important; min-height: 44px !important; box-sizing: border-box !important; }

  /* Search + export toolbars (Sales, Bills, Inventory) */
  .pd-btn-row input[type=text] { flex: 1 1 100% !important; min-width: 0 !important; width: 100% !important; max-width: none !important; }
  #pd-tab-inventory .pd-card > .pd-btn-row { flex-direction: column; align-items: stretch !important; }
  #inv_search_q, #inv_filter_sup { flex: 1 1 100%; width: 100% !important; max-width: none !important; }
  #inv_from_date, #inv_to_date { flex: 1 1 calc(50% - 6px); width: auto !important; min-width: 0; }
  #inv_btn_csv { width: 100%; }

  /* ---------- Cards, grids, forms ---------- */
  .pd-card { padding: 14px !important; border-radius: 14px; max-width: 100vw !important; box-sizing: border-box !important; }
  .pd-grid { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)) !important; gap: 12px !important; }
  .two { grid-template-columns: 1fr !important; }
  .grid > :last-child:nth-child(odd), .grid-5 > :last-child:nth-child(odd), .grid-6 > :last-child:nth-child(odd) { grid-column: 1 / -1; }
  .grid-5 > :first-child { grid-column: 1 / -1 !important; }
  .kpi b { font-size: clamp(13px, 3.8vw, 17px) !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; display: block !important; max-width: 100% !important; }

  /* ---------- App Header Bar (Title + Action button row) ---------- */
  .bar {
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    justify-content: flex-start !important;
    gap: 8px !important;
    margin-bottom: 12px !important;
    width: 100% !important;
  }
  .bar > button.menu, button.menu {
    display: none !important;
  }
  .bar > h2 {
    width: 100% !important;
    margin: 0 !important;
    font-size: 1.25rem !important; /* 20px */
    font-weight: 700 !important;
    color: var(--tx, #0f172a) !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    line-height: 1.3 !important;
  }
  .bar > div,
  .bar .bar-actions {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
    scrollbar-width: none !important;
    gap: 8px !important;
    width: 100% !important;
    padding: 2px 0 6px 0 !important;
    margin: 0 !important;
  }
  .bar > div::-webkit-scrollbar,
  .bar .bar-actions::-webkit-scrollbar {
    display: none !important;
  }
  .bar > div > button, .bar > div > .btn,
  .bar .bar-actions > button, .bar .bar-actions > .btn,
  .bar > button:not(.menu), .bar > .btn:not(.menu) {
    flex: 0 0 auto !important;
    min-height: 38px !important;
    padding: 6px 14px !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    border-radius: 9px !important;
    white-space: nowrap !important;
    width: auto !important;
  }
  .bar > button:not(.menu), .bar > .btn:not(.menu) {
    align-self: flex-start !important;
  }

  /* ---------- Balance Sheet & Financial Statements Mobile Layout ---------- */
  .bs-filter-bar, .tb-filter-bar, .gl-filter-bar, .cb-filter-bar {
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 8px !important;
    margin-bottom: 12px !important;
    width: 100% !important;
  }
  .bs-filter-bar > *, .tb-filter-bar > *, .gl-filter-bar > *, .cb-filter-bar > * {
    flex: 0 0 auto !important;
    min-height: 0 !important;
    width: 100% !important;
  }

  /* GL & CB: chips row – horizontally scrollable */
  .gl-filter-bar .mc-chips, .cb-filter-bar .mc-chips {
    display: flex !important;
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    gap: 6px !important;
    width: 100% !important;
    padding-bottom: 2px !important;
    scrollbar-width: none !important;
    -webkit-overflow-scrolling: touch !important;
  }
  .gl-filter-bar .mc-chips > button, .cb-filter-bar .mc-chips > button {
    flex-shrink: 0 !important;
    white-space: nowrap !important;
    min-height: 38px !important;
    padding: 8px 14px !important;
    font-size: 13px !important;
  }

  /* GL & CB: date pair – From/To side by side on mobile */
  .gl-filter-bar .mc-row, .cb-filter-bar .mc-row {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    gap: 8px !important;
    width: 100% !important;
    flex-wrap: nowrap !important;
  }
  .gl-filter-bar .mc-row label, .cb-filter-bar .mc-row label {
    flex: 1 1 50% !important;
    min-width: 0 !important;
    display: flex !important;
    align-items: center !important;
    gap: 5px !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    color: var(--t2) !important;
    margin: 0 !important;
    white-space: nowrap !important;
  }
  .gl-filter-bar .mc-row input[type=date], .cb-filter-bar .mc-row input[type=date] {
    flex: 1 1 auto !important;
    min-width: 0 !important;
    width: 100% !important;
    min-height: 40px !important;
    padding: 4px 6px !important;
    font-size: 13px !important;
    box-sizing: border-box !important;
  }

  /* GL & CB: search bar full width */
  .gl-search-wrap, .cb-search-wrap {
    width: 100% !important;
  }
  .gl-search-wrap input, .cb-search-wrap input {
    width: 100% !important;
    min-height: 40px !important;
    font-size: 14px !important;
    box-sizing: border-box !important;
  }

  .bs-filter-bar .bs-filter-top, .tb-filter-bar .tb-filter-top {
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    gap: 8px !important;
    flex-wrap: wrap !important;
    width: 100% !important;
  }
  .bs-filter-bar .bs-presets, .tb-filter-bar .tb-presets {
    display: flex !important;
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    gap: 6px !important;
    flex: 1 1 auto !important;
    padding-bottom: 2px !important;
    scrollbar-width: none !important;
  }
  .tb-filter-bar .tb-presets > button {
    flex-shrink: 0 !important;
    white-space: nowrap !important;
    padding: 8px 12px !important;
    font-size: 13px !important;
    min-height: 38px !important;
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
  .bs-filter-bar .bs-date-wrap input[type=date], .tb-filter-bar .tb-date-wrap input[type=date] {
    width: auto !important;
    min-height: 38px !important;
    padding: 4px 8px !important;
  }
  /* TB search full width on mobile */
  .tb-filter-bar .tb-search-wrap {
    width: 100% !important;
  }
  .tb-filter-bar .tb-search-wrap input {
    width: 100% !important;
    min-height: 40px !important;
    font-size: 14px !important;
    box-sizing: border-box !important;
  }

  .tb-toggle-wrap {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    width: 100% !important;
    gap: 4px !important;
    background: #edf1ff !important;
    padding: 4px !important;
    border-radius: 10px !important;
    box-sizing: border-box !important;
    min-height: 42px !important;
    height: auto !important;
    flex: 0 0 auto !important;
  }
  .tb-toggle-wrap > button {
    flex: 1 1 50% !important;
    text-align: center !important;
    white-space: nowrap !important;
    font-size: 13px !important;
    font-weight: 600 !important;
    padding: 6px 12px !important;
    border-radius: 8px !important;
    border: 0 !important;
    background: transparent !important;
    color: var(--m-mute, #64748b) !important;
    min-height: 34px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    box-shadow: none !important;
    transition: all 0.15s ease !important;
  }
  .tb-toggle-wrap > button.p {
    background: #ffffff !important;
    color: var(--m-blue, #4263eb) !important;
    font-weight: 700 !important;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.14) !important;
  }
  .bs-filter-bar .bs-toggle-wrap {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    width: 100% !important;
    gap: 4px !important;
    background: #edf1ff !important;
    padding: 4px !important;
    border-radius: 10px !important;
    box-sizing: border-box !important;
    min-height: 42px !important;
    height: auto !important;
    flex: 0 0 auto !important;
  }
  .bs-filter-bar .bs-toggle-wrap > button {
    flex: 1 1 50% !important;
    text-align: center !important;
    white-space: normal !important;
    line-height: 1.25 !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    padding: 6px 8px !important;
    border-radius: 8px !important;
    border: 0 !important;
    box-shadow: none !important;
    background: transparent !important;
    color: var(--m-mute, #64748b) !important;
    min-height: 34px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: background 0.15s ease, color 0.15s ease !important;
  }
  .bs-filter-bar .bs-toggle-wrap > button.p {
    background: #fff !important;
    color: var(--m-blue, #4263eb) !important;
    font-weight: 700 !important;
    box-shadow: 0 1px 3px rgba(15,23,42,.14) !important;
  }
  .bs-txt-mob { display: inline !important; }
  .bs-txt-full { display: none !important; }

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

  table.mcard td.mc-cell { display: flex !important; align-items: center !important; justify-content: space-between !important; gap: 12px !important;
    padding: 8px 0 !important; border: 0 !important; border-bottom: 1px dashed var(--bd, var(--m-line)) !important; background: transparent !important;
    font-size: 13.5px; line-height: 1.4; min-width: 0; box-sizing: border-box !important; }
  table.mcard td.mc-cell:last-child { border-bottom: 0 !important; }
  table.mcard td.mc-cell::before { content: attr(data-label); flex: 0 0 35% !important; max-width: 40% !important; text-align: left; color: var(--t2, var(--m-mute));
    font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .35px; }
  table.mcard td.mc-empty { display: none !important; }

  table.mcard td.mc-title { order: -1; display: flex !important; align-items: center !important; justify-content: space-between !important; text-align: left !important; font-size: 15px; font-weight: 700; color: var(--tx, var(--m-ink));
    padding: 6px 0 10px !important; border-bottom: 1px solid var(--bd, var(--m-line)) !important; margin-bottom: 4px !important; }
  table.mcard td.mc-title::before, table.mcard td.mc-span::before, table.mcard td.mc-actions::before { display: none !important; }
  table.mcard td.mc-title select, table.mcard td.mc-title input { width: 100% !important; min-height: 44px !important; font-size: 15px !important; font-weight: 600 !important; padding: 8px 12px !important; border-radius: 8px !important; border: 1px solid var(--bd, #cbd5e1) !important; box-sizing: border-box !important; background: #fff !important; }

  table.mcard td.mc-span { display: block !important; text-align: left !important; font-weight: 700; padding: 12px 0 !important; border-bottom: 0 !important; }
  table.mcard td.mc-span.empty { text-align: center !important; color: var(--t2, var(--m-mute)); font-weight: 500; padding: 22px 0 !important; }

  table.mcard td.mc-amt { font-weight: 700; color: var(--tx, var(--m-ink)); }
  table.mcard td.mc-cell input, table.mcard td.mc-cell select { flex: 1 1 60% !important; max-width: 65% !important; width: auto !important; min-height: 44px !important; padding: 8px 12px !important; font-size: 14px !important; border-radius: 8px !important; border: 1px solid var(--bd, #cbd5e1) !important; box-sizing: border-box !important; text-align: right !important; background: #fff !important; }

  table.mcard td.mc-actions { display: flex !important; justify-content: flex-end !important; align-items: center !important; flex-wrap: wrap; gap: 8px; padding: 10px 0 4px !important; border-top: 1px solid var(--bd, var(--m-line)) !important; border-bottom: 0 !important; margin-top: 4px !important; }
  table.mcard td.mc-actions button, table.mcard .pd-item-del, table.mcard .pd-del { min-height: 44px !important; min-width: 44px !important; padding: 8px 18px !important; font-size: 15px !important; font-weight: 700 !important; border-radius: 8px !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; box-sizing: border-box !important; }
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
  root.querySelectorAll('.filters:not([data-mcf])').forEach(bar => {
    if (bar.classList.contains('bs-filter-bar') || bar.classList.contains('tb-filter-bar')) return;
    const directKids = [...bar.children];
    if (directKids.length && directKids.every(k => k.tagName === 'BUTTON')) {
      bar.classList.add('mc-chips');
      bar.setAttribute('data-mcf', '1');
    }
  });
  root.querySelectorAll('.filters > div:not([data-mcf])').forEach(div => {
    div.setAttribute('data-mcf', '1');
    if (div.classList.contains('bs-toggle-wrap') || div.classList.contains('tb-toggle-wrap')) return;
    const kids = [...div.children];
    if (!kids.length) return;
    if (kids.every(k => k.tagName === 'BUTTON')) div.classList.add('mc-chips');
    else if (kids.some(k => k.tagName === 'LABEL' || (k.tagName === 'INPUT' && k.type === 'date'))) div.classList.add('mc-row');
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
