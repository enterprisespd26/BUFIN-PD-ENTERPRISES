import { $, esc, toast } from '../modules/utils.js';
import { db, save, log, INDIAN_STATES, getStateByCode, getStateByName } from '../modules/state.js';
import { modal, closeM } from '../modules/components.js';

export function showFirstRunWizard(onComplete) {
  const b = db.biz || {};
  const defaultPrefix = b.prefix || 'PD/{FY}/';
  const defaultFyStart = b.fyStart || '04-01';

  modal(`
    <div class="first-run-wizard-wrap" style="max-width:540px; margin:0 auto;">
      <div style="text-align:center; margin-bottom:16px;">
        <div style="width:48px; height:48px; border-radius:12px; background:#eff6ff; color:#2563eb; display:inline-flex; align-items:center; justify-content:center; margin-bottom:8px;">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 21h18"></path>
            <path d="M9 8h1"></path>
            <path d="M9 12h1"></path>
            <path d="M9 16h1"></path>
            <path d="M14 8h1"></path>
            <path d="M14 12h1"></path>
            <path d="M14 16h1"></path>
            <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16"></path>
          </svg>
        </div>
        <h2 style="font-size:20px; font-weight:700; color:var(--tx,#0f172a); margin:0 0 4px;">Welcome to BUFIN</h2>
        <p style="font-size:13px; color:var(--t2,#64748b); margin:0;">
          Let's set up your business details before creating invoices and managing accounts.
        </p>
      </div>

      <form id="wizForm" style="display:flex; flex-direction:column; gap:12px;">
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <label style="display:flex; flex-direction:column; gap:4px; font-size:13px; font-weight:600;">
            Business Name *
            <input type="text" id="wiz_name" value="${esc(b.name || '')}" placeholder="e.g. Acme Enterprises" required style="min-height:40px; padding:8px 12px; border:1px solid var(--bd,#cbd5e1); border-radius:8px; font-size:14px;">
          </label>
          <label style="display:flex; flex-direction:column; gap:4px; font-size:13px; font-weight:600;">
            Proprietor / Owner *
            <input type="text" id="wiz_owner" value="${esc(b.owner || '')}" placeholder="Owner name" required style="min-height:40px; padding:8px 12px; border:1px solid var(--bd,#cbd5e1); border-radius:8px; font-size:14px;">
          </label>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <label style="display:flex; flex-direction:column; gap:4px; font-size:13px; font-weight:600;">
            GSTIN (optional)
            <input type="text" id="wiz_gstin" value="${esc(b.gstin || '')}" placeholder="15-digit GSTIN" maxlength="15" style="min-height:40px; padding:8px 12px; border:1px solid var(--bd,#cbd5e1); border-radius:8px; font-size:14px; text-transform:uppercase;">
          </label>
          <label style="display:flex; flex-direction:column; gap:4px; font-size:13px; font-weight:600;">
            Home State *
            <select id="wiz_state" required style="min-height:40px; padding:8px 12px; border:1px solid var(--bd,#cbd5e1); border-radius:8px; font-size:14px; background:#fff;">
              <option value="">Select State</option>
              ${INDIAN_STATES.map(s => `<option value="${esc(s.name)}" data-code="${esc(s.code)}" ${s.name.toLowerCase() === (b.state || '').toLowerCase() ? 'selected' : ''}>${esc(s.name)} (Code ${esc(s.code)})</option>`).join('')}
            </select>
          </label>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <label style="display:flex; flex-direction:column; gap:4px; font-size:13px; font-weight:600;">
            Invoice Prefix *
            <input type="text" id="wiz_prefix" value="${esc(defaultPrefix)}" placeholder="e.g. INV/{FY}/" required style="min-height:40px; padding:8px 12px; border:1px solid var(--bd,#cbd5e1); border-radius:8px; font-size:14px;">
            <small style="font-weight:400; color:var(--t2,#64748b); font-size:11px;">Token {FY} auto-fills financial year e.g. 2627</small>
          </label>
          <label style="display:flex; flex-direction:column; gap:4px; font-size:13px; font-weight:600;">
            Financial Year Start *
            <input type="text" id="wiz_fy_start" value="${esc(defaultFyStart)}" placeholder="MM-DD (e.g. 04-01)" pattern="\\d{2}-\\d{2}" required style="min-height:40px; padding:8px 12px; border:1px solid var(--bd,#cbd5e1); border-radius:8px; font-size:14px;">
            <small style="font-weight:400; color:var(--t2,#64748b); font-size:11px;">Standard: 04-01 (1st April)</small>
          </label>
        </div>

        <div style="margin-top:16px; display:flex; justify-content:flex-end; gap:10px;">
          <button type="submit" class="p" style="min-height:42px; padding:0 24px; font-weight:700; font-size:14px; border-radius:8px;">
            Save &amp; Complete Setup
          </button>
        </div>
      </form>
    </div>
  `);

  const gstinInput = $('#wiz_gstin');
  const stateSelect = $('#wiz_state');

  if (gstinInput && stateSelect) {
    gstinInput.oninput = () => {
      const val = gstinInput.value.trim().toUpperCase();
      if (val.length >= 2 && /^\d{2}/.test(val)) {
        const code = val.slice(0, 2);
        const match = getStateByCode(code);
        if (match) {
          stateSelect.value = match.name;
        }
      }
    };
  }

  const formEl = $('#wizForm');
  if (formEl) {
    formEl.onsubmit = e => {
      e.preventDefault();
      const name = ($('#wiz_name')?.value || '').trim();
      const owner = ($('#wiz_owner')?.value || '').trim();
      const gstin = ($('#wiz_gstin')?.value || '').trim().toUpperCase();
      const state = ($('#wiz_state')?.value || '').trim();
      const prefix = ($('#wiz_prefix')?.value || '').trim();
      const fyStart = ($('#wiz_fy_start')?.value || '').trim() || '04-01';

      if (!name) return toast('Business name is required');
      if (!owner) return toast('Proprietor name is required');
      if (!state) return toast('Home state is required');
      if (!prefix) return toast('Invoice prefix is required');

      if (gstin) {
        if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(gstin)) {
          return toast('Invalid GSTIN format (e.g. 21ABCDE1234F1Z5)');
        }
      }

      db.biz = db.biz || {};
      db.biz.name = name;
      db.biz.owner = owner;
      db.biz.gstin = gstin;
      db.biz.state = state;
      db.biz.prefix = prefix;
      db.biz.fyStart = fyStart;

      log('wizard', 'Business details configured');
      save();
      closeM();
      toast('Business profile configured successfully!');

      if (typeof onComplete === 'function') onComplete();
      else if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('bufin-render'));
    };
  }
}

