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
  .filters select[style*="min-width"], #glAccSelect { min-width: 0 !important; width: 100% !important; max-width: 100% !important; min-height: 48px !important; box-sizing: border-box !important; }
  #glAccSelect.gl-account-select { min-height: 48px !important; height: 48px !important; padding: 0 40px 0 40px !important; font-size: 14.5px !important; border: 2px solid #3b82f6 !important; border-radius: 11px !important; }

  /* Search + export toolbars (Sales, Bills, Inventory) */
  .pd-btn-row input[type=text] { flex: 1 1 100% !important; min-width: 0 !important; width: 100% !important; max-width: none !important; }
  #pd-tab-inventory .pd-card > .pd-btn-row { flex-direction: column; align-items: stretch !important; }
  #inv_search_q, #inv_filter_sup { flex: 1 1 100%; width: 100% !important; max-width: none !important; }
  #inv_from_date, #inv_to_date { flex: 1 1 calc(50% - 6px); width: auto !important; min-width: 0; }
  #inv_btn_csv { width: 100%; }
  #pd_btn_csv, #u_csv { margin-left: auto !important; }

  /* ---------- Main Container Clearance (Universal pb-24) ---------- */
  main, #root > main, .main-scroll-container {
    margin: 0 !important;
    padding: 12px 14px calc(96px + env(safe-area-inset-bottom, 20px)) !important;
    max-width: 100vw !important;
    box-sizing: border-box !important;
  }

  /* ---------- Cards, grids, forms ---------- */
  .pd-card { padding: 14px !important; border-radius: 14px; max-width: 100vw !important; box-sizing: border-box !important; }
  .pd-grid { grid-template-columns: 1fr !important; gap: 12px !important; }
  .pd-grid > label { width: 100% !important; min-width: 0 !important; }
  .two { grid-template-columns: 1fr !important; }
  .grid > :last-child:nth-child(odd), .grid-6 > :last-child:nth-child(odd) { grid-column: 1 / -1; }
  .grid-5 > :first-child { grid-column: 1 / -1 !important; }
  .grid-5 > :last-child { grid-column: auto !important; }
  .kpi b { font-size: clamp(13px, 3.8vw, 17px) !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; display: block !important; max-width: 100% !important; }

  /* ---------- App Header Bar (Title + Right-Aligned Action Buttons) ---------- */
  .bar {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    justify-content: space-between !important;
    flex-wrap: nowrap !important;
    gap: 8px !important;
    margin-bottom: 12px !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }
  .bar.cb-header-bar,
  .bar:has(.cb-bar-actions),
  .bar:has(.bar-actions > :nth-child(2)) {
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 8px !important;
  }
  .bar.cb-header-bar h2,
  .bar:has(.cb-bar-actions) h2,
  .bar:has(.bar-actions > :nth-child(2)) h2 {
    width: 100% !important;
    flex: none !important;
    font-size: 1.25rem !important;
    line-height: 1.3 !important;
  }
  .bar.cb-header-bar > div,
  .bar.cb-header-bar .bar-actions,
  .bar:has(.cb-bar-actions) > div,
  .bar:has(.cb-bar-actions) .bar-actions,
  .bar:has(.bar-actions > :nth-child(2)) > div,
  .bar:has(.bar-actions > :nth-child(2)) .bar-actions {
    width: 100% !important;
    max-width: 100% !important;
    margin-left: 0 !important;
    display: flex !important;
    flex-direction: row !important;
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
    scrollbar-width: none !important;
    padding-bottom: 4px !important;
    justify-content: flex-start !important;
    gap: 8px !important;
  }
  .bar > button.menu, button.menu {
    display: none !important;
  }
  .bar > h2, .bar h2 {
    flex: 1 1 auto !important;
    min-width: 0 !important;
    width: auto !important;
    margin: 0 !important;
    font-size: clamp(16px, 4.6vw, 20px) !important;
    font-weight: 700 !important;
    color: var(--tx, #0f172a) !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    line-height: 1.3 !important;
  }
  .bar > div,
  .bar .bar-actions {
    display: inline-flex !important;
    flex-direction: row !important;
    align-items: center !important;
    justify-content: flex-end !important;
    flex-wrap: nowrap !important;
    flex: 0 0 auto !important;
    margin-left: auto !important;
    overflow-x: auto !important;
    -webkit-overflow-scrolling: touch !important;
    scrollbar-width: none !important;
    gap: 6px !important;
    width: auto !important;
    max-width: 65% !important;
    padding: 0 !important;
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
    min-height: 34px !important;
    height: 34px !important;
    padding: 0 12px !important;
    font-size: 12.5px !important;
    font-weight: 600 !important;
    border-radius: 8px !important;
    white-space: nowrap !important;
    width: auto !important;
    align-self: center !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    box-sizing: border-box !important;
  }
  .bar > button:not(.menu), .bar > .btn:not(.menu) {
    align-self: center !important;
    margin-left: auto !important;
  }

  /* ---------- Balance Sheet & Financial Statements Mobile Layout ---------- */
  .bs-filter-bar, .tb-filter-bar, .gl-filter-bar, .cb-filter-bar, .plx-filters {
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 8px !important;
    margin-bottom: 12px !important;
    width: 100% !important;
  }
  .bs-filter-bar > *, .tb-filter-bar > *, .gl-filter-bar > *, .cb-filter-bar > *, .plx-filters > * {
    flex: 0 0 auto !important;
    min-height: 0 !important;
    width: 100% !important;
  }

  /* GL, CB, PL: chips row – horizontally scrollable */
  .gl-filter-bar .mc-chips, .cb-filter-bar .mc-chips, .plx-filters .mc-chips {
    display: flex !important;
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    gap: 6px !important;
    width: 100% !important;
    padding-bottom: 2px !important;
    scrollbar-width: none !important;
    -webkit-overflow-scrolling: touch !important;
  }
  .gl-filter-bar .mc-chips > button, .cb-filter-bar .mc-chips > button, .plx-filters .mc-chips > button {
    flex-shrink: 0 !important;
    white-space: nowrap !important;
    min-height: 38px !important;
    padding: 8px 14px !important;
    font-size: 13px !important;
  }

  /* GL, CB, PL: date pair – 2-column grid on mobile */
  .gl-filter-bar .mc-row, .cb-filter-bar .mc-row, .plx-filters .mc-row, .cb-dates {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 8px !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }
  .gl-filter-bar .mc-row label, .cb-filter-bar .mc-row label, .plx-filters .mc-row label, .cb-dates label {
    width: 100% !important;
    min-width: 0 !important;
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    color: var(--t2) !important;
    margin: 0 !important;
    white-space: nowrap !important;
  }
  .gl-filter-bar .mc-row input[type=date], .cb-filter-bar .mc-row input[type=date], .plx-filters .mc-row input[type=date], .cb-dates input[type=date] {
    flex: 1 1 auto !important;
    min-width: 0 !important;
    width: 100% !important;
    min-height: 40px !important;
    padding: 4px 6px !important;
    font-size: 12px !important;
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

  /* CB account selector horizontal scrolling on mobile */
  .cb-acc-filters {
    display: flex !important;
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    gap: 6px !important;
    width: 100% !important;
    padding-bottom: 2px !important;
    scrollbar-width: none !important;
    -webkit-overflow-scrolling: touch !important;
  }
  .cb-acc-filters > button {
    flex-shrink: 0 !important;
    white-space: nowrap !important;
    min-height: 38px !important;
    padding: 8px 14px !important;
    font-size: 13px !important;
  }

  .bs-filter-bar .bs-filter-top, .tb-filter-bar .tb-filter-top {
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 8px !important;
    width: 100% !important;
  }
  .bs-filter-bar .bs-presets, .tb-filter-bar .tb-presets {
    display: flex !important;
    flex-wrap: nowrap !important;
    overflow-x: auto !important;
    gap: 6px !important;
    width: 100% !important;
    padding-bottom: 2px !important;
    scrollbar-width: none !important;
    -webkit-overflow-scrolling: touch !important;
  }
  .tb-filter-bar .tb-presets > button, .bs-filter-bar .bs-presets > button {
    flex-shrink: 0 !important;
    white-space: nowrap !important;
    padding: 8px 14px !important;
    font-size: 13px !important;
    min-height: 38px !important;
  }
  .bs-filter-bar .bs-date-wrap, .tb-filter-bar .tb-date-wrap {
    width: 100% !important;
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    margin-left: 0 !important;
  }
  .bs-filter-bar .bs-date-wrap label, .tb-filter-bar .tb-date-wrap label {
    width: 100% !important;
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    margin: 0 !important;
    font-size: 12.5px !important;
    font-weight: 600 !important;
    color: var(--t2, #64748b) !important;
  }
  .bs-filter-bar .bs-date-wrap label span, .tb-filter-bar .tb-date-wrap label span {
    flex: 0 0 auto !important;
    white-space: nowrap !important;
  }
  .bs-filter-bar .bs-date-wrap input[type=date], .tb-filter-bar .tb-date-wrap input[type=date] {
    flex: 1 1 auto !important;
    width: 100% !important;
    min-width: 0 !important;
    min-height: 40px !important;
    padding: 6px 10px !important;
    font-size: 13.5px !important;
    box-sizing: border-box !important;
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
  .mc-wrap { overflow: visible !important; border: 0 !important; background: transparent !important; box-shadow: none !important; padding: 0 0 calc(100px + env(safe-area-inset-bottom, 24px)) !important; margin: 0 0 6px !important; }

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

  table.mcard td.mc-title { order: -1; display: flex !important; flex-direction: column !important; align-items: stretch !important; justify-content: flex-start !important; text-align: left !important; font-size: 15px; font-weight: 700; color: var(--tx, var(--m-ink));
    padding: 6px 0 10px !important; border-bottom: 1px solid var(--bd, var(--m-line)) !important; margin-bottom: 4px !important; }
  table.mcard td.mc-title::before, table.mcard td.mc-span::before, table.mcard td.mc-actions::before { display: none !important; }
  table.mcard td.mc-title select, table.mcard td.mc-title input { width: 100% !important; min-height: 44px !important; font-size: 15px !important; font-weight: 600 !important; padding: 8px 12px !important; border-radius: 8px !important; border: 1px solid var(--bd, #cbd5e1) !important; box-sizing: border-box !important; background: #fff !important; }

  table.mcard td.mc-span { display: block !important; text-align: left !important; font-weight: 700; padding: 12px 0 !important; border-bottom: 0 !important; }
  table.mcard td.mc-span.empty { text-align: center !important; color: var(--t2, var(--m-mute)); font-weight: 500; padding: 22px 0 !important; }

  table.mcard td.mc-amt, table.mcard td.mc-cell[data-label="Amount"] { font-weight: 700; color: var(--tx, var(--m-ink)); text-align: right !important; width: 100% !important; }
  table.mcard td.mc-cell input, table.mcard td.mc-cell select { flex: 1 1 60% !important; max-width: 65% !important; width: auto !important; min-height: 44px !important; padding: 8px 12px !important; font-size: 14px !important; border-radius: 8px !important; border: 1px solid var(--bd, #cbd5e1) !important; box-sizing: border-box !important; text-align: right !important; text-align-last: right !important; background: #fff !important; }

  table.mcard td.mc-actions { display: flex !important; width: 100% !important; justify-content: flex-end !important; align-items: center !important; padding: 10px 0 4px !important; border-top: 1px solid var(--bd, #e2e8f0) !important; border-bottom: 0 !important; margin-top: 6px !important; box-sizing: border-box !important; }
  table.mcard td.mc-actions:not(.loan-card-actions):not(:has(.loan-action-footer)) button:not(.btn):not(.p):not(.alt), table.mcard td.mc-actions .pd-line-del, table.mcard .pd-item-del, table.mcard .pd-del { min-height: 40px !important; height: 40px !important; min-width: 44px !important; padding: 0 16px !important; font-size: 14px !important; font-weight: 700 !important; border-radius: 8px !important; background: #fef2f2 !important; border: 1px solid #fecaca !important; color: #dc2626 !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; box-sizing: border-box !important; }
  table.mcard td.mc-actions .pd-btn-row { justify-content: flex-end; width: 100%; }

  /* Full-Screen Mobile Modal Dialogs & Fixed Drawer */
  dialog {
    width: 100vw !important;
    max-width: 100vw !important;
    margin: auto 0 0 !important;
    border-radius: 20px 20px 0 0 !important;
    padding: 18px 16px 0 !important;
    max-height: 85vh !important;
    max-height: 85dvh !important;
    position: fixed !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    z-index: 10001 !important;
    box-sizing: border-box !important;
    overflow-y: auto !important;
    -webkit-overflow-scrolling: touch !important;
    border-bottom: none !important;
    box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.25) !important;
  }
  body:has(dialog[open]) #tab {
    display: none !important;
  }
  dialog form {
    display: flex !important;
    flex-direction: column !important;
    min-height: 0 !important;
  }
  dialog form > .row:last-child,
  dialog .modal-actions {
    position: sticky !important;
    bottom: 0 !important;
    background: var(--sf, #ffffff) !important;
    padding: 14px 0 calc(20px + env(safe-area-inset-bottom, 16px)) !important;
    margin-top: 16px !important;
    border-top: 1px solid var(--bd, #e2e8f0) !important;
    z-index: 20 !important;
    display: flex !important;
    gap: 10px !important;
    justify-content: flex-end !important;
  }

  /* Tables that cannot become cards (statements, 2-column lists) stay real tables, just tidy */
  .mc-wrap-plain { overflow-x: auto !important; -webkit-overflow-scrolling: touch; }
  table.mc-plain { display: table !important; width: 100% !important; }
  table.mc-plain thead { display: table-header-group !important; }
  table.mc-plain tbody, table.mc-plain tfoot { display: table-row-group !important; }
  table.mc-plain tr { display: table-row !important; }
  table.mc-plain th, table.mc-plain td { display: table-cell !important; padding: 10px 12px !important; font-size: 13px; vertical-align: top; }

  /* ================= Sales Module Mobile Polish (/#/sales) ================= */
  /* 1. Compact 2x2 Grid for Top Summary Metrics */
  .pd-stats {
    display: grid !important;
    grid-template-columns: repeat(2, 1fr) !important;
    gap: 10px !important;
    margin-bottom: 16px !important;
  }
  .pd-stats div {
    padding: 10px 12px !important;
    border-radius: 10px !important;
    background: var(--sf, #ffffff) !important;
    border: 1px solid var(--bd, #e2e8f0) !important;
    box-sizing: border-box !important;
  }
  .pd-stats span {
    font-size: 12px !important;
    font-weight: 500 !important;
    color: var(--t2, #64748b) !important;
    margin-bottom: 2px !important;
  }
  .pd-stats b {
    font-size: 16px !important;
    font-weight: 700 !important;
    color: var(--tx, #0f172a) !important;
    margin-top: 2px !important;
    white-space: nowrap !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    line-height: 1.3 !important;
  }

  /* 2. Search & Export CSV Toolbar Alignment */
  .pd-search-toolbar {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    gap: 8px !important;
    width: 100% !important;
    margin-bottom: 12px !important;
    flex-wrap: nowrap !important;
  }
  .pd-search-toolbar #pd_search_q,
  .pd-search-toolbar input[type="text"] {
    flex: 1 1 auto !important;
    min-width: 0 !important;
    width: auto !important;
    max-width: none !important;
    height: 44px !important;
    min-height: 44px !important;
    padding: 0 12px !important;
    font-size: 13.5px !important;
    border-radius: 8px !important;
    border: 1px solid var(--bd, #cbd5e1) !important;
    box-sizing: border-box !important;
    margin: 0 !important;
  }
  .pd-search-toolbar #pd_btn_csv,
  .pd-search-toolbar button {
    flex: 0 0 auto !important;
    flex-shrink: 0 !important;
    height: 44px !important;
    min-height: 44px !important;
    padding: 0 12px !important;
    font-size: 12px !important;
    font-weight: 600 !important;
    white-space: nowrap !important;
    border-radius: 8px !important;
    border: 1px solid var(--bd, #cbd5e1) !important;
    box-sizing: border-box !important;
    margin: 0 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
  }

  /* 2b. Purchase Records Toolbar (Mobile: Title & Export CSV on row 1, Search on row 2) */
  .pd-records-toolbar {
    display: grid !important;
    grid-template-columns: 1fr auto !important;
    grid-template-rows: auto auto !important;
    align-items: center !important;
    gap: 10px 8px !important;
    width: 100% !important;
    margin-bottom: 12px !important;
  }
  .pd-records-toolbar .pd-records-title {
    grid-column: 1 !important;
    grid-row: 1 !important;
    margin: 0 !important;
    font-size: 16px !important;
    font-weight: 700 !important;
    color: var(--tx, #0f172a) !important;
    line-height: 1.25 !important;
  }
  .pd-records-toolbar .pd-records-csv,
  .pd-records-toolbar #u_csv {
    grid-column: 2 !important;
    grid-row: 1 !important;
    margin: 0 0 0 auto !important;
    justify-self: end !important;
    height: 38px !important;
    min-height: 38px !important;
    padding: 0 14px !important;
    font-size: 12.5px !important;
    font-weight: 600 !important;
    white-space: nowrap !important;
    border-radius: 8px !important;
    border: 1px solid var(--bd, #cbd5e1) !important;
    box-sizing: border-box !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
  }
  .pd-records-toolbar .pd-records-search,
  .pd-records-toolbar #u_s {
    grid-column: 1 / -1 !important;
    grid-row: 2 !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    height: 44px !important;
    min-height: 44px !important;
    padding: 0 14px !important;
    font-size: 14px !important;
    border-radius: 9px !important;
    border: 1px solid var(--bd, #cbd5e1) !important;
    box-sizing: border-box !important;
    margin: 0 !important;
  }

  /* ========================================================
     LOANS MODULE MOBILE REFINEMENTS
     ======================================================== */
  .pb-28,
  .loan-page {
    padding-bottom: calc(112px + env(safe-area-inset-bottom, 24px)) !important;
    box-sizing: border-box !important;
  }

  .shrink-0 {
    flex-shrink: 0 !important;
  }

  .no-scrollbar {
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;
  }
  .no-scrollbar::-webkit-scrollbar {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
  }

  /* 1. Header Action Bar Alignment */
  .bar.loan-header-bar {
    display: flex !important;
    flex-direction: row !important;
    align-items: center !important;
    justify-content: space-between !important;
    gap: 12px !important;
    width: 100% !important;
    margin-bottom: 14px !important;
    box-sizing: border-box !important;
  }
  .bar.loan-header-bar h2 {
    font-size: clamp(20px, 5.5vw, 24px) !important;
    font-weight: 700 !important;
    margin: 0 !important;
    white-space: nowrap !important;
    color: var(--tx, #0f172a) !important;
  }
  .bar.loan-header-bar .loan-btn-register {
    white-space: nowrap !important;
    flex-shrink: 0 !important;
    height: 40px !important;
    min-height: 40px !important;
    padding: 0 16px !important;
    font-size: 13.5px !important;
    font-weight: 600 !important;
    border-radius: 9px !important;
    background: var(--ac, #2563eb) !important;
    color: #ffffff !important;
    box-shadow: 0 1px 2px rgba(37, 99, 235, 0.2) !important;
  }
  @media (max-width: 360px) {
    .bar.loan-header-bar {
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 8px !important;
    }
    .bar.loan-header-bar .loan-btn-register {
      width: 100% !important;
    }
  }

  /* 2. Horizontally Scrollable Filter Pill Bar */
  .loan-filters-toolbar {
    display: flex !important;
    flex-direction: column !important;
    gap: 10px !important;
    width: 100% !important;
    margin-bottom: 14px !important;
  }
  .loan-filter-pills {
    display: flex !important;
    align-items: center !important;
    gap: 8px !important;
    overflow-x: auto !important;
    overflow-y: hidden !important;
    padding: 4px 2px !important;
    width: 100% !important;
    -webkit-overflow-scrolling: touch !important;
    scrollbar-width: none !important;
    -ms-overflow-style: none !important;
  }
  .loan-filter-pills::-webkit-scrollbar {
    display: none !important;
  }
  .loan-filter-pills .loan-pill-btn {
    flex: 0 0 auto !important;
    flex-shrink: 0 !important;
    white-space: nowrap !important;
    min-height: 38px !important;
    height: 38px !important;
    padding: 0 16px !important;
    font-size: 13.5px !important;
    font-weight: 600 !important;
    border-radius: 9px !important;
    box-sizing: border-box !important;
  }
  .loan-search-input {
    width: 100% !important;
    max-width: 100% !important;
    min-height: 44px !important;
    height: 44px !important;
    padding: 0 14px !important;
    font-size: 14px !important;
    border-radius: 9px !important;
    border: 1px solid var(--bd, #cbd5e1) !important;
    box-sizing: border-box !important;
  }

  /* 3. Card Footer Action Bar (No text overlap, stacked / 2-row layout) */
  table.mcard td.loan-card-actions,
  table.mcard td.mc-actions:has(.loan-action-footer) {
    display: block !important;
    width: 100% !important;
    padding: 12px 0 4px !important;
    border-top: 1px solid var(--bd, #e2e8f0) !important;
    border-bottom: 0 !important;
    margin-top: 8px !important;
    box-sizing: border-box !important;
  }
  .loan-action-footer {
    display: flex !important;
    flex-direction: column !important;
    gap: 8px !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }
  .loan-action-footer .loan-btn-repay,
  table.mcard td.mc-actions .loan-btn-repay {
    width: 100% !important;
    min-height: 42px !important;
    height: 42px !important;
    padding: 0 16px !important;
    font-size: 13.5px !important;
    font-weight: 700 !important;
    color: #ffffff !important;
    background: var(--ac, #2563eb) !important;
    border: 1px solid var(--ac, #2563eb) !important;
    border-radius: 9px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    white-space: nowrap !important;
    box-shadow: 0 1px 2px rgba(37, 99, 235, 0.2) !important;
    margin: 0 !important;
    box-sizing: border-box !important;
  }
  .loan-action-footer .loan-btn-repay:hover,
  table.mcard td.mc-actions .loan-btn-repay:hover {
    background: #1d4ed8 !important;
  }
  .loan-action-row {
    display: flex !important;
    flex-direction: row !important;
    gap: 8px !important;
    width: 100% !important;
    box-sizing: border-box !important;
    overflow-x: auto !important;
    scrollbar-width: none !important;
    -webkit-overflow-scrolling: touch !important;
  }
  .loan-action-row::-webkit-scrollbar {
    display: none !important;
  }
  .loan-action-row button,
  table.mcard td.mc-actions .loan-action-row button {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    min-height: 38px !important;
    height: 38px !important;
    padding: 0 8px !important;
    font-size: 12.5px !important;
    font-weight: 600 !important;
    border-radius: 8px !important;
    white-space: nowrap !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    box-sizing: border-box !important;
    margin: 0 !important;
  }
  .loan-action-row .loan-btn-view,
  table.mcard td.mc-actions .loan-action-row .loan-btn-view,
  .loan-action-row .loan-btn-edit,
  table.mcard td.mc-actions .loan-action-row .loan-btn-edit {
    background: #ffffff !important;
    color: #1e293b !important;
    border: 1px solid var(--bd, #cbd5e1) !important;
  }
  .loan-action-row .loan-btn-view:hover,
  .loan-action-row .loan-btn-edit:hover {
    background: #f8fafc !important;
  }
  .loan-action-row .loan-btn-del,
  table.mcard td.mc-actions .loan-action-row .loan-btn-del {
    background: #fef2f2 !important;
    color: #dc2626 !important;
    border: 1px solid #fecaca !important;
  }
  .loan-action-row .loan-btn-del:hover {
    background: #fee2e2 !important;
  }

  /* 3. Sales Record Card Layout & Action Menu Polish */
  .pd-table-wrap.responsive-cards table.mcard tr,
  .pd-table-wrap.responsive-cards .pd-table tbody tr {
    position: relative !important;
    display: flex !important;
    flex-direction: column !important;
    padding: 14px 14px 10px !important;
    margin-bottom: 12px !important;
    border-radius: 12px !important;
    background: var(--sf, #fff) !important;
    border: 1px solid var(--bd, #e2e8f0) !important;
    box-sizing: border-box !important;
  }
  .pd-table-wrap.responsive-cards table.mcard td.mc-title,
  .pd-table-wrap.responsive-cards .pd-table tbody td:first-child {
    padding-right: 44px !important;
    padding-bottom: 8px !important;
    margin-bottom: 2px !important;
    font-size: 15px !important;
    font-weight: 700 !important;
    color: var(--tx, #0f172a) !important;
    border: none !important;
    border-bottom: 1px solid var(--bd, #e2e8f0) !important;
    display: flex !important;
    justify-content: flex-start !important;
    align-items: center !important;
  }
  .pd-table-wrap.responsive-cards table.mcard td.mc-cell,
  .pd-table-wrap.responsive-cards .pd-table tbody td:not(:first-child):not(:last-child) {
    display: flex !important;
    flex-direction: row !important;
    justify-content: space-between !important;
    align-items: center !important;
    padding: 6px 0 !important;
    border: none !important;
    border-bottom: 1px dashed rgba(226, 232, 240, 0.7) !important;
    font-size: 13.5px !important;
    min-width: 0 !important;
    box-sizing: border-box !important;
  }
  .pd-table-wrap.responsive-cards table.mcard td.mc-cell::before,
  .pd-table-wrap.responsive-cards .pd-table tbody td:not(:first-child):not(:last-child)::before {
    content: attr(data-label) !important;
    flex: 0 0 auto !important;
    text-align: left !important;
    color: #64748b !important;
    font-weight: 500 !important;
    font-size: 11.5px !important;
    text-transform: uppercase !important;
    letter-spacing: 0.35px !important;
  }
  .pd-table-wrap.responsive-cards table.mcard td.mc-cell,
  .pd-table-wrap.responsive-cards table.mcard td.mc-cell *,
  .pd-table-wrap.responsive-cards .pd-table tbody td:not(:first-child):not(:last-child) {
    font-weight: 600 !important;
    color: #0f172a !important;
    text-align: right !important;
  }
  .pd-table-wrap.responsive-cards table.mcard td.mc-actions,
  .pd-table-wrap.responsive-cards .pd-table tbody td:last-child {
    display: contents !important;
    border: none !important;
    padding: 0 !important;
    margin: 0 !important;
    height: 0 !important;
  }
  .pd-table-wrap.responsive-cards .pd-more-btn {
    position: absolute !important;
    top: 12px !important;
    right: 12px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 36px !important;
    height: 36px !important;
    min-width: 36px !important;
    min-height: 36px !important;
    border-radius: 8px !important;
    border: 1px solid transparent !important;
    background: transparent !important;
    color: #64748b !important;
    font-size: 18px !important;
    cursor: pointer !important;
    z-index: 5 !important;
    padding: 0 !important;
    transition: background 0.15s ease, color 0.15s ease !important;
  }
  .pd-table-wrap.responsive-cards .pd-more-btn:hover,
  .pd-table-wrap.responsive-cards .pd-more-btn:active {
    background: #f1f5f9 !important;
    color: #0f172a !important;
  }

  /* 4. Scrap Items Form 2-Column Grid (Tab 1 Lines & Tab 3 Catalog) */
  .pd-scrap-lines-table,
  .pd-scrap-catalog-table {
    display: block !important;
    width: 100% !important;
    border: none !important;
    background: transparent !important;
  }
  .pd-scrap-lines-table thead,
  .pd-scrap-catalog-table thead {
    display: none !important;
  }
  .pd-scrap-lines-table tbody,
  .pd-scrap-catalog-table tbody {
    display: block !important;
    width: 100% !important;
  }
  /* 4. Scrap Items Form 2-Column Grid (Tab 1 Lines & Tab 3 Catalog) */
  .pd-scrap-lines-table,
  .pd-scrap-catalog-table {
    display: block !important;
    width: 100% !important;
    border: none !important;
    background: transparent !important;
  }
  .pd-scrap-lines-table thead,
  .pd-scrap-catalog-table thead {
    display: none !important;
  }
  .pd-scrap-lines-table tbody,
  .pd-scrap-catalog-table tbody {
    display: block !important;
    width: 100% !important;
  }
  .pd-scrap-catalog-wrap,
  #pd-tab-itm .pd-table-wrap,
  .mc-wrap:has(.pd-scrap-catalog-table) {
    padding: 0 !important;
    padding-bottom: 0 !important;
    margin: 8px 0 0 !important;
    border: none !important;
    background: transparent !important;
    box-shadow: none !important;
    overflow: visible !important;
  }
  .pd-scrap-lines-table tbody tr,
  .pd-scrap-catalog-table tbody tr,
  table.mcard.pd-scrap-lines-table tbody tr,
  table.mcard.pd-scrap-catalog-table tbody tr {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 10px 12px !important;
    position: relative !important;
    padding: 14px !important;
    margin-bottom: 12px !important;
    border-radius: 14px !important;
    background: #ffffff !important;
    border: 1px solid var(--bd, #e2e8f0) !important;
    box-sizing: border-box !important;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04) !important;
  }
  .pd-scrap-catalog-table tbody tr:last-child,
  table.mcard.pd-scrap-catalog-table tbody tr:last-child {
    margin-bottom: 0 !important;
  }
  .pd-scrap-lines-table tbody tr td:first-child,
  .pd-scrap-catalog-table tbody tr td:first-child,
  table.mcard.pd-scrap-lines-table td.mc-title,
  table.mcard.pd-scrap-catalog-table td.mc-title {
    grid-column: 1 / -1 !important;
    order: 1 !important;
    padding: 0 50px 0 0 !important;
    margin: 0 0 2px 0 !important;
    border: none !important;
    display: block !important;
    width: 100% !important;
    box-sizing: border-box !important;
  }
  .pd-scrap-lines-table tbody tr td:first-child select,
  .pd-scrap-catalog-table tbody tr td:first-child input,
  table.mcard.pd-scrap-lines-table td.mc-title select,
  table.mcard.pd-scrap-catalog-table td.mc-title input {
    width: 100% !important;
    max-width: 100% !important;
    min-height: 42px !important;
    height: 42px !important;
    font-size: 14.5px !important;
    font-weight: 600 !important;
    color: var(--tx, #0f172a) !important;
    padding: 8px 12px !important;
    border-radius: 9px !important;
    border: 1px solid var(--bd, #cbd5e1) !important;
    box-sizing: border-box !important;
    background: #ffffff !important;
    text-align: left !important;
    transition: border-color 0.15s ease, box-shadow 0.15s ease !important;
  }
  .pd-scrap-lines-table tbody tr td:last-child,
  .pd-scrap-catalog-table tbody tr td:last-child,
  table.mcard.pd-scrap-lines-table td.mc-actions,
  table.mcard.pd-scrap-catalog-table td.mc-actions {
    display: contents !important;
    border: none !important;
    padding: 0 !important;
    margin: 0 !important;
    height: 0 !important;
  }
  .pd-scrap-lines-table .pd-line-del,
  .pd-scrap-catalog-table .pd-item-del {
    position: absolute !important;
    top: 14px !important;
    right: 14px !important;
    width: 42px !important;
    height: 42px !important;
    min-width: 42px !important;
    min-height: 42px !important;
    padding: 0 !important;
    border-radius: 9px !important;
    background: #fef2f2 !important;
    border: 1px solid #fee2e2 !important;
    color: #ef4444 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    z-index: 10 !important;
    cursor: pointer !important;
    margin: 0 !important;
    box-sizing: border-box !important;
    transition: background 0.15s ease, border-color 0.15s ease, transform 0.1s ease !important;
  }
  .pd-scrap-lines-table .pd-line-del:hover,
  .pd-scrap-catalog-table .pd-item-del:hover {
    background: #fee2e2 !important;
    border-color: #fecaca !important;
    color: #dc2626 !important;
  }
  .pd-scrap-lines-table .pd-line-del:active,
  .pd-scrap-catalog-table .pd-item-del:active {
    background: #fecaca !important;
    transform: scale(0.95) !important;
  }
  .pd-scrap-lines-table .pd-line-del svg,
  .pd-scrap-catalog-table .pd-item-del svg {
    width: 16px !important;
    height: 16px !important;
    stroke: currentColor !important;
    pointer-events: none !important;
  }
  .pd-scrap-lines-table tbody tr td:not(:first-child):not(:last-child):not(:nth-child(6)),
  .pd-scrap-catalog-table tbody tr td:not(:first-child):not(:last-child),
  table.mcard.pd-scrap-lines-table td.mc-cell:not(:nth-child(6)),
  table.mcard.pd-scrap-catalog-table td.mc-cell {
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    justify-content: flex-start !important;
    gap: 4px !important;
    padding: 0 !important;
    border: none !important;
    min-width: 0 !important;
    width: 100% !important;
    box-sizing: border-box !important;
    background: transparent !important;
  }
  .pd-scrap-lines-table tbody tr td:not(:first-child):not(:last-child):not(:nth-child(6))::before,
  .pd-scrap-catalog-table tbody tr td:not(:first-child):not(:last-child)::before,
  table.mcard.pd-scrap-lines-table td.mc-cell:not(:nth-child(6))::before,
  table.mcard.pd-scrap-catalog-table td.mc-cell::before {
    content: attr(data-label) !important;
    flex: none !important;
    max-width: 100% !important;
    width: 100% !important;
    text-align: left !important;
    color: #64748b !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.4px !important;
    margin-bottom: 2px !important;
  }
  .pd-scrap-lines-table tbody tr td:not(:first-child):not(:last-child):not(:nth-child(6)) input,
  .pd-scrap-lines-table tbody tr td:not(:first-child):not(:last-child):not(:nth-child(6)) select,
  .pd-scrap-catalog-table tbody tr td:not(:first-child):not(:last-child) input,
  .pd-scrap-catalog-table tbody tr td:not(:first-child):not(:last-child) select,
  table.mcard.pd-scrap-lines-table td.mc-cell:not(:nth-child(6)) input,
  table.mcard.pd-scrap-lines-table td.mc-cell:not(:nth-child(6)) select,
  table.mcard.pd-scrap-catalog-table td.mc-cell input,
  table.mcard.pd-scrap-catalog-table td.mc-cell select {
    flex: none !important;
    max-width: 100% !important;
    width: 100% !important;
    min-height: 42px !important;
    height: 42px !important;
    padding: 8px 12px !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    color: var(--tx, #0f172a) !important;
    border-radius: 9px !important;
    border: 1px solid var(--bd, #cbd5e1) !important;
    box-sizing: border-box !important;
    text-align: left !important;
    text-align-last: left !important;
    background: #ffffff !important;
    transition: border-color 0.15s ease, box-shadow 0.15s ease !important;
  }
  .pd-scrap-lines-table tbody tr td input:focus,
  .pd-scrap-lines-table tbody tr td select:focus,
  .pd-scrap-catalog-table tbody tr td input:focus,
  .pd-scrap-catalog-table tbody tr td select:focus {
    border-color: #3b82f6 !important;
    outline: none !important;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15) !important;
  }
  .pd-scrap-catalog-table tbody tr td:nth-child(2),
  table.mcard.pd-scrap-catalog-table td:nth-child(2) {
    order: 2 !important;
    grid-column: 1 !important;
  }
  .pd-scrap-catalog-table tbody tr td:nth-child(3),
  table.mcard.pd-scrap-catalog-table td:nth-child(3) {
    order: 3 !important;
    grid-column: 2 !important;
  }
  .pd-scrap-catalog-table tbody tr td:nth-child(4),
  table.mcard.pd-scrap-catalog-table td:nth-child(4) {
    order: 4 !important;
    grid-column: 1 !important;
  }
  .pd-scrap-lines-table tbody tr td:nth-child(2),
  table.mcard.pd-scrap-lines-table td:nth-child(2) {
    order: 2 !important;
    grid-column: 1 !important;
  }
  .pd-scrap-lines-table tbody tr td:nth-child(4),
  table.mcard.pd-scrap-lines-table td:nth-child(4) {
    order: 3 !important;
    grid-column: 2 !important;
  }
  .pd-scrap-lines-table tbody tr td:nth-child(3),
  table.mcard.pd-scrap-lines-table td:nth-child(3) {
    order: 4 !important;
    grid-column: 1 !important;
  }
  .pd-scrap-lines-table tbody tr td:nth-child(5),
  table.mcard.pd-scrap-lines-table td:nth-child(5) {
    order: 5 !important;
    grid-column: 2 !important;
  }
  .pd-scrap-lines-table tbody tr td:nth-child(6),
  table.mcard.pd-scrap-lines-table td.mc-cell:nth-child(6) {
    order: 6 !important;
    grid-column: 1 / -1 !important;
    display: flex !important;
    flex-direction: row !important;
    justify-content: space-between !important;
    align-items: center !important;
    background: #f8fafc !important;
    padding: 10px 14px !important;
    margin-top: 4px !important;
    border: 1px dashed #cbd5e1 !important;
    border-radius: 9px !important;
    font-size: 15px !important;
    font-weight: 700 !important;
    color: var(--tx, #0f172a) !important;
    box-sizing: border-box !important;
  }
  .pd-scrap-lines-table tbody tr td:nth-child(6)::before,
  table.mcard.pd-scrap-lines-table td.mc-cell:nth-child(6)::before {
    content: "Line Amount" !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    color: #64748b !important;
    text-transform: uppercase !important;
    letter-spacing: 0.4px !important;
    margin-bottom: 0 !important;
    width: auto !important;
  }

  #pd_add_line, #pd_btn_add_item, #pd_btn_save_items {
    height: 44px !important;
    min-height: 44px !important;
    padding: 0 16px !important;
    font-size: 14px !important;
    font-weight: 600 !important;
    border-radius: 9px !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    box-sizing: border-box !important;
  }

  /* Scrap Items Action Button Placement */
  .pd-scrap-actions-row {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 12px !important;
    width: 100% !important;
    margin-top: 14px !important;
    margin-bottom: 0 !important;
    box-sizing: border-box !important;
  }
  .pd-scrap-actions-row #pd_btn_add_item,
  .pd-scrap-actions-row #pd_btn_save_items {
    width: 100% !important;
    margin: 0 !important;
  }

  /* 5. Safe Area Bottom Scroll Padding */
  .pd-sales-page {
    padding-bottom: calc(112px + env(safe-area-inset-bottom, 24px)) !important;
    box-sizing: border-box !important;
  }
  .pd-sales-page #pd-tab-new,
  .pd-sales-page #pd-tab-rec,
  .pd-sales-page #pd-tab-itm,
  .pd-sales-page #pd-tab-view {
    padding-bottom: 0 !important;
  }

  /* ================= Opening Balances Status Banner Card ================= */
  .ob-status-card {
    border-radius: 14px !important;
    padding: 14px 14px 12px !important;
    margin-bottom: 16px !important;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05) !important;
    box-sizing: border-box !important;
    display: flex !important;
    flex-direction: column !important;
    gap: 12px !important;
  }
  .ob-locked-card {
    background: linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%) !important;
    border: 1px solid #bbf7d0 !important;
    border-left: 4px solid #10b981 !important;
  }
  .ob-edit-card {
    background: linear-gradient(135deg, #ffffff 0%, #eff6ff 100%) !important;
    border: 1px solid #bfdbfe !important;
    border-left: 4px solid #3b82f6 !important;
  }
  .ob-card-main {
    display: flex !important;
    align-items: flex-start !important;
    gap: 10px !important;
    width: 100% !important;
  }
  .ob-card-icon {
    width: 38px !important;
    height: 38px !important;
    min-width: 38px !important;
    min-height: 38px !important;
    border-radius: 10px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    flex-shrink: 0 !important;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05) !important;
  }
  .ob-icon-green {
    background: #dcfce7 !important;
    border: 1px solid #86efac !important;
    color: #15803d !important;
  }
  .ob-icon-blue {
    background: #dbeafe !important;
    border: 1px solid #93c5fd !important;
    color: #1d4ed8 !important;
  }
  .ob-card-body {
    flex: 1 !important;
    min-width: 0 !important;
  }
  .ob-title-wrap {
    display: flex !important;
    align-items: center !important;
    gap: 6px !important;
    flex-wrap: wrap !important;
  }
  .ob-card-title {
    color: #0f172a !important;
    font-size: 14.5px !important;
    font-weight: 700 !important;
    letter-spacing: -0.2px !important;
    line-height: 1.25 !important;
  }
  .ob-pill {
    font-size: 10px !important;
    padding: 2px 7px !important;
    border-radius: 6px !important;
    font-weight: 700 !important;
    letter-spacing: 0.5px !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 4px !important;
    white-space: nowrap !important;
    flex-shrink: 0 !important;
  }
  .ob-pill-green {
    background: #dcfce7 !important;
    color: #15803d !important;
    border: 1px solid #86efac !important;
  }
  .ob-pill-blue {
    background: #dbeafe !important;
    color: #1e40af !important;
    border: 1px solid #93c5fd !important;
  }
  .ob-dot {
    width: 6px !important;
    height: 6px !important;
    border-radius: 50% !important;
    display: inline-block !important;
  }
  .ob-dot-green {
    background: #16a34a !important;
  }
  .ob-dot-blue {
    background: #2563eb !important;
  }
  .ob-meta-row {
    margin-top: 8px !important;
    background: rgba(255, 255, 255, 0.75) !important;
    border: 1px solid rgba(187, 247, 208, 0.8) !important;
    border-radius: 8px !important;
    padding: 8px 10px !important;
    display: flex !important;
    flex-direction: column !important;
    align-items: stretch !important;
    gap: 4px !important;
  }
  .ob-meta-divider {
    display: none !important;
  }
  .ob-meta-item {
    display: flex !important;
    justify-content: space-between !important;
    align-items: center !important;
    width: 100% !important;
    font-size: 12px !important;
  }
  .ob-meta-label {
    color: #64748b !important;
    font-weight: 500 !important;
  }
  .ob-meta-val {
    color: #1e293b !important;
    font-weight: 600 !important;
  }
  .ob-val-emerald {
    color: #059669 !important;
    font-weight: 700 !important;
  }
  .ob-edit-desc {
    color: #475569 !important;
    font-size: 12px !important;
    margin-top: 4px !important;
    line-height: 1.4 !important;
  }
  .ob-actions-row {
    display: grid !important;
    grid-template-columns: 1fr 1fr !important;
    gap: 8px !important;
    width: 100% !important;
    margin-top: 2px !important;
  }
  .ob-btn-edit, .ob-btn-rev, .ob-btn-cancel {
    width: 100% !important;
    min-height: 42px !important;
    height: 42px !important;
    padding: 0 8px !important;
    font-size: 12.5px !important;
    font-weight: 600 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    gap: 6px !important;
    white-space: nowrap !important;
    border-radius: 9px !important;
    box-sizing: border-box !important;
    cursor: pointer !important;
    transition: all 0.15s ease !important;
  }
  .ob-btn-edit {
    background: #ffffff !important;
    color: #1e293b !important;
    border: 1px solid #cbd5e1 !important;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05) !important;
  }
  .ob-btn-edit:hover, .ob-btn-edit:active {
    background: #f8fafc !important;
    border-color: #94a3b8 !important;
  }
  .ob-btn-rev {
    background: #ffffff !important;
    color: #dc2626 !important;
    border: 1px solid #fecaca !important;
    box-shadow: 0 1px 2px rgba(220, 38, 38, 0.05) !important;
  }
  .ob-btn-rev:hover, .ob-btn-rev:active {
    background: #fef2f2 !important;
    border-color: #f87171 !important;
  }
  .ob-btn-cancel {
    background: #ffffff !important;
    color: #475569 !important;
    border: 1px solid #cbd5e1 !important;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05) !important;
  }

  /* General Ledger & Cash Book Opening Balance Summary Row */
  table.mcard tr.tot.gl-opening-row {
    display: flex !important;
    flex-direction: row !important;
    justify-content: space-between !important;
    align-items: center !important;
    background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%) !important;
    border: 1px solid #cbd5e1 !important;
    border-left: 4px solid #3b82f6 !important;
    border-radius: 12px !important;
    padding: 12px 16px !important;
    margin: 6px 0 12px !important;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04) !important;
    box-sizing: border-box !important;
    min-height: 48px !important;
    width: 100% !important;
  }
  table.mcard tr.tot.gl-opening-row td {
    border: none !important;
    padding: 0 !important;
    background: transparent !important;
    font-size: 13.5px !important;
  }
  table.mcard tr.tot.gl-opening-row td:first-child {
    flex: 1 1 auto !important;
    width: auto !important;
    max-width: calc(100% - 100px) !important;
    display: flex !important;
    align-items: center !important;
    text-align: left !important;
  }
  table.mcard tr.tot.gl-opening-row td:first-child .gl-op-label-wrap {
    display: flex !important;
    flex-direction: row !important;
    align-items: baseline !important;
    gap: 6px !important;
    flex-wrap: wrap !important;
  }
  table.mcard tr.tot.gl-opening-row td:first-child .gl-op-title {
    font-weight: 700 !important;
    font-size: 14.5px !important;
    color: #0f172a !important;
    white-space: nowrap !important;
  }
  table.mcard tr.tot.gl-opening-row td:first-child .gl-op-sub {
    font-size: 12px !important;
    color: #64748b !important;
    font-weight: 500 !important;
    white-space: nowrap !important;
  }
  table.mcard tr.tot.gl-opening-row td:last-child {
    flex: 0 0 auto !important;
    width: auto !important;
    min-width: 80px !important;
    text-align: right !important;
    font-weight: 700 !important;
    font-size: 15px !important;
    color: #0f172a !important;
    margin-left: auto !important;
    display: flex !important;
    justify-content: flex-end !important;
    align-items: center !important;
    white-space: nowrap !important;
  }
  table.mcard tr.tot.gl-opening-row td::before {
    display: none !important;
    content: none !important;
  }

  /* Closing Balance Row */
  table.mcard tr.tot.gl-closing-row {
    display: flex !important;
    flex-direction: column !important;
    background: #f8fafc !important;
    border: 1px solid #cbd5e1 !important;
    border-radius: 12px !important;
    padding: 12px 14px !important;
    margin: 12px 0 24px !important;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04) !important;
    gap: 4px !important;
  }
  table.mcard tr.tot.gl-closing-row td:first-child {
    font-size: 14px !important;
    font-weight: 700 !important;
    color: #0f172a !important;
    padding-bottom: 6px !important;
    border-bottom: 1px solid #e2e8f0 !important;
  }
  table.mcard tr.tot.gl-closing-row td:first-child::before {
    display: none !important;
  }

  /* Details Block in Mobile Cards */
  .gl-details-block {
    display: flex !important;
    flex-direction: column !important;
    gap: 2px !important;
    width: 100% !important;
  }
  .gl-party-name {
    font-size: 15px !important;
    font-weight: 700 !important;
    color: #0f172a !important;
    line-height: 1.3 !important;
  }
  .gl-narr-text {
    font-size: 13.5px !important;
    font-weight: 500 !important;
    color: #334155 !important;
    line-height: 1.4 !important;
    margin-top: 2px !important;
  }
  .gl-counter-wrap {
    margin-top: 3px !important;
  }
  .gl-counter-badge {
    font-size: 11px !important;
    color: #475569 !important;
    background: #f8fafc !important;
    border: 1px solid #e2e8f0 !important;
    border-radius: 6px !important;
    padding: 3px 8px !important;
    display: inline-block !important;
    width: fit-content !important;
    max-width: 100% !important;
    line-height: 1.35 !important;
    word-break: break-word !important;
  }
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
