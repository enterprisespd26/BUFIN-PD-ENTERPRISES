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
    <h3>Cloud Storage & Receipts (Cloudinary)</h3>
    <div class="wrap" style="padding:16px">
      <form id="cf">
        <div style="font-size:12.5px;color:var(--t2);margin-bottom:12px">
          Connect your Cloudinary account to store high-resolution paper purchase bills, invoices, and camera scans in the cloud with secure HTTPS links.
        </div>
        ${fld('cloudName', 'Cloudinary Cloud Name', 'text', db.biz.cloudinary_name || 'iqsinmcr')}
        ${fld('apiKey', 'Cloudinary API Key', 'text', db.biz.cloudinary_key || '573667157386361')}
        ${fld('apiSecret', 'Cloudinary API Secret', 'password', db.biz.cloudinary_secret || '')}
        <div style="margin-top:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <button type="submit" class="p">Save Cloudinary Credentials</button>
          <span id="c_stat" style="font-size:12px;font-weight:600;color:var(--t2)"></span>
        </div>
      </form>
    </div>
    <div class="bar">
      <button data-a="backup">Backup data</button>
      <button data-a="restore">Restore from backup</button>
      <button class="d" data-a="wipe">Erase all data</button>
    </div>
    <h3>Audit log (latest)</h3>
    <div class="wrap"><table>
      ${db.audit.slice(-15).reverse().map(a => `<tr><td>${a.at.slice(0, 19).replace('T', ' ')}</td><td>${esc(a.a)}</td><td>${esc(a.d)}</td></tr>`).join('') || '<tr><td class="empty">No activity yet.</td></tr>'}
    </table></div>`;
}
