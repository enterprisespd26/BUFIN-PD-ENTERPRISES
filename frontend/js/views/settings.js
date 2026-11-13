import { esc, head } from '../modules/utils.js';
import { db, INDIAN_STATES, getStateByName, getFiscalYear } from '../modules/state.js';
import { fld, sel, opts } from '../modules/components.js';

export function renderSettings() {
  const fy = getFiscalYear();
  const stateCode = db.biz.gstin ? db.biz.gstin.slice(0, 2) : (getStateByName(db.biz.state)?.code || '');

  return head('Settings') +
    `<div class="wrap" style="padding:18px;">
      <div style="display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--bd);padding-bottom:12px;margin-bottom:16px;flex-wrap:wrap;gap:8px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:36px;height:36px;border-radius:9px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
          <div>
            <div style="font-size:15px;font-weight:700;color:#0f172a;">Business Profile &amp; Letterhead</div>
            <div style="font-size:12px;color:#64748b;">Configure your company credentials, GST details, bank accounts, and invoice headers.</div>
          </div>
        </div>
        <span style="font-size:11.5px;font-weight:600;background:#f1f5f9;color:#475569;padding:4px 10px;border-radius:6px;">
          GST Active: ${esc(db.biz.state ? (db.biz.state + (stateCode ? ' (' + stateCode + ')' : '')) : 'Not set')}
        </span>
      </div>

      <form id="bf">
        <div class="two">
          ${fld('name', 'Business name *', 'text', db.biz.name || '')}
          ${fld('owner', 'Proprietor name *', 'text', db.biz.owner || '')}
        </div>
        <div class="two">
          ${fld('gstin', 'GSTIN', 'text', db.biz.gstin || '')}
          <label>Home State (for CGST+SGST vs IGST) *
            <select name="state" required style="width:100%; min-height:40px; padding:8px 12px; border-radius:8px; border:1px solid var(--bd,#cbd5e1); font-size:14px; background:#fff; box-sizing:border-box;">
              <option value="">Select State</option>
              ${INDIAN_STATES.map(s => `<option value="${esc(s.name)}" ${s.name.toLowerCase() === (db.biz.state || '').toLowerCase() ? 'selected' : ''}>${esc(s.name)} (Code ${esc(s.code)})</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="two">
          ${fld('phone', 'Mobile / Phone', 'text', db.biz.phone || '')}
          ${fld('email', 'Email', 'text', db.biz.email || '')}
        </div>
        <div class="two">
          <label>Invoice Prefix *
            <input type="text" name="prefix" value="${esc(db.biz.prefix || 'PD/{FY}/')}" placeholder="e.g. PD/{FY}/" required style="width:100%; min-height:40px; padding:8px 12px; border-radius:8px; border:1px solid var(--bd,#cbd5e1); font-size:14px; box-sizing:border-box;">
            <small style="font-size:11px; color:#64748b;">Token {FY} will be replaced with 4-digit fiscal year (e.g. 2627) and restart sequence</small>
          </label>
          ${fld('upi', 'UPI ID', 'text', db.biz.upi || '')}
        </div>
        <div class="two">
          ${fld('fyStart', 'Financial Year Start (MM-DD)', 'text', db.biz.fyStart || '04-01')}
          ${fld('autoLockMinutes', 'Idle Auto-Lock Timeout (minutes)', 'number', db.biz.autoLockMinutes || '5')}
        </div>

        <div style="font-size:13px;font-weight:700;color:#1e293b;margin:14px 0 10px;padding-top:12px;border-top:1px dashed #e2e8f0;display:flex;align-items:center;gap:6px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
          <span>Invoice Details, Banking &amp; Lockout</span>
        </div>

        <div class="two">
          <label>Address<textarea name="addr" rows="3" style="resize:vertical;">${esc(db.biz.addr || '')}</textarea></label>
          <label>Bank details (shown on printed invoice)<textarea name="bank" rows="4" style="resize:vertical;">${esc(db.biz.bank || '')}</textarea></label>
        </div>

        <div class="two">
          <label>Terms &amp; conditions<textarea name="terms" rows="3" style="resize:vertical;">${esc(db.biz.terms || '')}</textarea></label>
          <div style="display:flex;flex-direction:column;">
            ${fld('lock', 'Lock periods up to (no posting on or before)', 'date', db.biz.lock || '')}
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;font-size:12px;color:#64748b;line-height:1.4;margin-top:2px;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;margin-right:4px;">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
              Transactions on or before this locked date cannot be posted or edited.
            </div>
          </div>
        </div>

        <div style="margin-top:16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <button class="p" style="height:40px;padding:0 22px;font-weight:600;display:inline-flex;align-items:center;gap:8px;cursor:pointer;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
              <polyline points="17 21 17 13 7 13 7 21"></polyline>
              <polyline points="7 3 7 8 15 8"></polyline>
            </svg>
            <span>Save settings</span>
          </button>
          <span style="font-size:12px;color:#64748b;">Changes dynamically update company letterhead, tax invoices, and accounting locks.</span>
        </div>
      </form>
    </div>

    <h3>Financial Year Management</h3>
    <div class="wrap" style="padding:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:15px;font-weight:700;color:#0f172a;">Active Fiscal Year: <b>${esc(fy.label)}</b> (${esc(fy.startDate)} to ${esc(fy.endDate)})</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px;">
            Lock status: ${db.biz.lock ? `<span style="color:#2563eb;font-weight:600;">Locked up to ${esc(db.biz.lock)}</span>` : '<span style="color:#64748b;">No active lock</span>'} · Next Opening: <b>${esc(fy.nextStartDate)} (${esc(fy.nextLabel)})</b>
          </div>
        </div>
        <button type="button" class="p" data-a="closefy" style="display:inline-flex;align-items:center;gap:6px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>Close Financial Year</span>
        </button>
      </div>
    </div>

    <h3>Security &amp; Password Access</h3>
    <div class="wrap" style="padding:16px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <div style="width:36px;height:36px;border-radius:9px;background:#fef2f2;color:#dc2626;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <div>
          <div style="font-size:15px;font-weight:700;color:#0f172a;">Change Application Password / PIN</div>
          <div style="font-size:12px;color:#64748b;">Update your access credentials. Stored securely in database using cryptographic hash.</div>
        </div>
      </div>
      <form id="changePasswordForm">
        <div class="two" style="gap:12px;">
          <label>Current Password / PIN *
            <input type="password" id="curPwInput" required autocomplete="current-password" placeholder="Enter current password or PIN" style="width:100%; min-height:40px; padding:8px 12px; border:1px solid var(--bd,#cbd5e1); border-radius:8px; font-size:14px; box-sizing:border-box;">
          </label>
          <label>New Password / PIN (min 4 chars) *
            <input type="password" id="newPwInput" required minlength="4" autocomplete="new-password" placeholder="Enter new password or PIN" style="width:100%; min-height:40px; padding:8px 12px; border:1px solid var(--bd,#cbd5e1); border-radius:8px; font-size:14px; box-sizing:border-box;">
          </label>
        </div>
        <div class="two" style="gap:12px; margin-top:8px;">
          <label>Confirm New Password / PIN *
            <input type="password" id="confPwInput" required minlength="4" autocomplete="new-password" placeholder="Re-enter new password or PIN" style="width:100%; min-height:40px; padding:8px 12px; border:1px solid var(--bd,#cbd5e1); border-radius:8px; font-size:14px; box-sizing:border-box;">
          </label>
          <div style="display:flex; align-items:flex-end;">
            <button type="submit" class="p" style="height:40px; padding:0 20px; font-weight:600;">Update Password</button>
          </div>
        </div>
        <div id="pwChangeStat" style="margin-top:8px; font-size:12.5px; font-weight:600;"></div>
      </form>
    </div>
    </div>
    <h3>Cloud Storage &amp; Receipts (Cloudinary)</h3>
    <div class="wrap" style="padding:16px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:40px;height:40px;border-radius:10px;background:#f0fdf4;border:1px solid #bbf7d0;color:#16a34a;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path>
            </svg>
          </div>
          <div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
              <span style="font-size:15px;font-weight:700;color:#0f172a;">Cloudinary Storage</span>
              <span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:9999px;">
                <span style="width:6px;height:6px;border-radius:50%;background:#16a34a;"></span>
                CONNECTED
              </span>
            </div>
            <div style="font-size:12px;color:#64748b;margin-top:2px;">
              Cloud Account: <b style="color:#0f172a;">${esc(db.biz.cloudinary_name || 'iqsinmcr')}</b> · Server-Side Managed (.env / Render)
            </div>
          </div>
        </div>
        <button type="button" id="btnTestCloudinary" class="btn sm" style="display:inline-flex;align-items:center;gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
          <span>Test Cloud Status</span>
        </button>
      </div>

      <div style="margin-top:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;font-size:12px;color:#475569;line-height:1.45;display:flex;align-items:flex-start;gap:8px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px;">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <div><b>No client credentials required:</b> Your Cloudinary API keys and secret are configured safely on the backend server. Paper bills, weighbridge slips, and camera scans automatically upload to Cloudinary CDN with secure HTTPS links.</div>
      </div>
      <div id="c_test_result" style="margin-top:8px;font-size:12px;font-weight:600;"></div>

      <details style="margin-top:12px;">
        <summary style="font-size:12px;color:#2563eb;cursor:pointer;font-weight:500;">Advanced: Server Credentials Override</summary>
        <form id="cf" style="margin-top:10px;padding-top:10px;border-top:1px dashed #cbd5e1;">
          <div style="font-size:11.5px;color:var(--t2);margin-bottom:8px;">
            Only change these if you want to switch your backend Cloudinary account. Leave secret blank to keep existing.
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(200px, 1fr));gap:10px;">
            ${fld('cloudName', 'Cloudinary Cloud Name', 'text', db.biz.cloudinary_name || 'iqsinmcr')}
            ${fld('apiKey', 'Cloudinary API Key', 'text', db.biz.cloudinary_key || '573667157386361')}
            <label style="position:relative;margin-bottom:0;">
              Cloudinary API Secret
              <div style="position:relative;display:flex;align-items:center;margin-top:4px;">
                <input id="apiSecretInput" name="apiSecret" type="password" value="${esc(db.biz.cloudinary_secret || '')}" placeholder="Paste API Secret" style="padding-right:38px;box-sizing:border-box;">
                <button type="button" id="toggleApiSecret" title="Show or Hide Secret" aria-label="Show or Hide Secret" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);background:transparent;border:none;padding:4px;cursor:pointer;color:#64748b;display:flex;align-items:center;justify-content:center;border-radius:6px;min-height:unset;min-width:unset;height:30px;width:30px;box-shadow:none;">
                  <svg id="eyeIconOpen" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                  <svg id="eyeIconClosed" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"></path>
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"></path>
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"></path>
                    <line x1="2" y1="2" x2="22" y2="22"></line>
                  </svg>
                </button>
              </div>
            </label>
          </div>
          <div style="margin-top:10px;display:flex;align-items:center;gap:10px;">
            <button type="submit" class="p sm">Update Server Credentials</button>
            <span id="c_stat" style="font-size:12px;font-weight:600;color:var(--t2)"></span>
          </div>
        </form>
      </details>
    </div>

    <h3>Ledger Data &amp; System Backups</h3>
    <div class="wrap" style="padding:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:14.5px;font-weight:700;color:#0f172a;">Data Protection &amp; Snapshots</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px;">
            Export complete ZIP archive with dedicated entity CSVs, master combined spreadsheet, and system JSON.
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <button class="p" data-a="backup" style="display:inline-flex;align-items:center;gap:6px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            <span>Download Backup (.zip)</span>
          </button>
          <button data-a="restore" style="display:inline-flex;align-items:center;gap:6px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span>Restore Backup (.zip / .json)</span>
          </button>
          <button class="d" data-a="wipe" style="display:inline-flex;align-items:center;gap:6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
              <path d="M10 11v6"></path>
              <path d="M14 11v6"></path>
            </svg>
            <span>Erase All Data</span>
          </button>
        </div>
      </div>
    </div>
    <h3>Audit log (latest)</h3>
    <div class="wrap"><table>
      ${db.audit.slice(-15).reverse().map(a => `<tr><td>${esc(a.at ? a.at.slice(0, 19).replace('T', ' ') : '')}</td><td>${esc(a.a)}</td><td>${esc(a.d)}</td></tr>`).join('') || '<tr><td class="empty">No activity yet.</td></tr>'}
    </table></div>`;
}
