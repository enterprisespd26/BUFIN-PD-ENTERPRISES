import { esc, head } from '../modules/utils.js';
import { db } from '../modules/state.js';
import { fld } from '../modules/components.js';

export function renderSettings() {
  return head('Settings') +
    `<div class="wrap" style="padding:16px">
      <form id="bf">
        ${fld('name', 'Business name', 'text', db.biz.name || 'PD ENTERPRISES')}
        ${fld('owner', 'Proprietor name', 'text', db.biz.owner || 'Pritam Das')}
        ${fld('gstin', 'GSTIN', 'text', db.biz.gstin || '21IFNPD3153M1ZC')}
        ${fld('phone', 'Mobile / Phone', 'text', db.biz.phone || '+91 7684010176')}
        ${fld('email', 'Email', 'text', db.biz.email || 'enterprisespd26@gmail.com')}
        ${fld('state', 'Home State (for CGST+SGST vs IGST)', 'text', db.biz.state || 'Odisha')}
        ${fld('prefix', 'Invoice Prefix', 'text', db.biz.prefix || 'PD/2627/')}
        ${fld('upi', 'UPI ID', 'text', db.biz.upi || '7684010176@upi')}
        <label>Address<textarea name="addr" rows="3">${esc(db.biz.addr || 'Plot No-302, Khata No-111, Khaira, At- Muhanchuan, Po- Panichhatra, Dist- Balasore, Odisha – 756059, India')}</textarea></label>
        <label>Bank details (shown on printed invoice)<textarea name="bank" rows="3">${esc(db.biz.bank || 'State Bank of India - A/C 39876543210, IFSC SBIN0001234')}</textarea></label>
        <label>Terms &amp; conditions<textarea name="terms" rows="3">${esc(db.biz.terms || '1. Payment within 15 days.\n2. Goods once sold will not be taken back.\n3. Weight at our weighbridge is final.\n4. Subject to Balasore jurisdiction.')}</textarea></label>
        ${fld('lock', 'Lock periods up to (no posting on or before)', 'date', db.biz.lock || '')}
        <div style="margin-top:14px"><button class="p">Save settings</button></div>
      </form>
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
          ${fld('cloudName', 'Cloudinary Cloud Name', 'text', db.biz.cloudinary_name || 'iqsinmcr')}
          ${fld('apiKey', 'Cloudinary API Key', 'text', db.biz.cloudinary_key || '573667157386361')}
          ${fld('apiSecret', 'Cloudinary API Secret (leave blank to keep current)', 'password', '')}
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
      ${db.audit.slice(-15).reverse().map(a => `<tr><td>${a.at.slice(0, 19).replace('T', ' ')}</td><td>${esc(a.a)}</td><td>${esc(a.d)}</td></tr>`).join('') || '<tr><td class="empty">No activity yet.</td></tr>'}
    </table></div>`;
}
