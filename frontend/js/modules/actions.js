import { $, $$, esc, fmt, P, today, addD, addM, toast, ic, uid, downloadCSV } from './utils.js';
import { db, save, post, reverse, next, log, acc, an, pn, out, paid, dstat, cashAcc, isC, isS, lstat, lacr, SYS, TN, PT, net, checkCashLiquidity } from './state.js';
import { modal, closeM, form, fld, sel, opts, accOpts, partyOpts } from './components.js';

import { getTxnRowData } from '../views/money.js';
import { renderAttachmentControl, bindAttachmentEvents, saveAttachments, getAttachments, showAttachmentViewer } from './attachments.js';

let jvN = 3;

function half(g) { return Math.floor(g / 2); }
function sameSt(a, b) { return String(a).trim().toLowerCase() === String(b).trim().toLowerCase(); }

export function isIntraState(party) {
  if (!party) return true;
  const pGstin = String(party.gstin || party.g || '').trim().toUpperCase();
  const pState = String(party.state || party.s || '').trim().toLowerCase();

  const bizGstin = String(db.biz.gstin || '21IFNPD3153M1ZC').trim().toUpperCase();
  const bizCode = bizGstin.length >= 2 ? bizGstin.slice(0, 2) : '21';
  const bizState = String(db.biz.state || 'Odisha').trim().toLowerCase();

  // 1. If party has a GSTIN, match the 2-digit state code
  if (pGstin.length >= 2 && /^\d{2}/.test(pGstin)) {
    return pGstin.slice(0, 2) === bizCode;
  }

  // 2. If party state is numeric code e.g. "21"
  if (/^\d{2}$/.test(pState)) {
    return pState === bizCode;
  }

  // 3. Match state name against business state or Odisha (code 21)
  if (pState) {
    if (sameSt(pState, bizState)) return true;
    if ((pState === 'odisha' || pState === 'orissa') && (bizState === 'odisha' || bizState === 'orissa' || bizCode === '21')) return true;
    return false;
  }

  return true;
}

export function taxSplit(g, p) {
  if (!g || !p) return {};
  if (!p.state && !p.gstin && !p.s && !p.g && !db.biz.state) return {};
  return isIntraState(p) ? { cg: half(g), sg: g - half(g) } : { ig: g };
}

export function taxRows(d, s) {
  const t = d.tax || {};
  const r = (n, v) => `<tr><td>${n}</td><td class="num">${fmt(v)}</td></tr>`;
  if (t.ig) return r('IGST @ ' + d.rate + '%', t.ig);
  if (t.cg !== undefined) return r('CGST @ ' + d.rate / 2 + '%', t.cg) + r('SGST @ ' + d.rate / 2 + '%', t.sg);
  return r('GST @ ' + (d.rate || 0) + '%' + (s ? ' (set party and business state for the CGST/SGST/IGST split)' : ' (recoverable input GST)'), d.gst);
}

function fmtTxnDate(dStr, atStr) {
  if (!dStr) return '-';
  try {
    const parts = dStr.split('-');
    if (parts.length === 3) {
      const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      const datePart = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      if (atStr) {
        const atDate = new Date(atStr);
        if (!isNaN(atDate.getTime())) {
          const timePart = atDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
          return `${datePart} · ${timePart}`;
        }
      }
      return datePart;
    }
  } catch (_) {}
  return dStr;
}

function findLinkedDoc(e) {
  if (!e) return null;
  if (e.meta?.invoiceId) {
    const doc = db.docs.find(x => x.id === e.meta.invoiceId);
    if (doc) return doc;
  }
  if (e.meta?.billId) {
    const doc = db.docs.find(x => x.id === e.meta.billId);
    if (doc) return doc;
  }
  const refNo = e.meta?.docNo || e.meta?.ref;
  if (refNo) {
    const doc = db.docs.find(x => x.no === refNo || x.sno === refNo || x.id === refNo);
    if (doc) return doc;
  }
  const docByJe = db.docs.find(x => x.je === e.id);
  if (docByJe) return docByJe;
  const docByPay = db.docs.find(x => x.pays && x.pays.some(p => p.je === e.id));
  if (docByPay) return docByPay;
  if (e.narr) {
    for (const doc of db.docs) {
      if (doc.no && e.narr.includes(doc.no)) return doc;
      if (doc.sno && e.narr.includes(doc.sno)) return doc;
    }
  }
  return null;
}

function getItemBreakdown(e, linkedDoc, partyName) {
  let itemDesc = '';
  if (linkedDoc) {
    if (linkedDoc.items && linkedDoc.items.length) {
      itemDesc = linkedDoc.items.map(it => `${it.n || it.name || 'Item'}${it.q ? ' (' + it.q + ' ' + (it.u || 'kg') + ')' : ''}`).join(', ');
    } else if (linkedDoc.mat) {
      itemDesc = `${linkedDoc.mat}${linkedDoc.q ? ' (' + linkedDoc.q + ' ' + (linkedDoc.u || 'kg') + ')' : ''}`;
    } else if (linkedDoc.desc) {
      itemDesc = linkedDoc.desc;
    }
  }
  if (!itemDesc && e.meta?.desc) {
    const parts = e.meta.desc.split(/\s*-\s*(?:Invoice|Bill|Inv|PB|Ref)\s*/i);
    itemDesc = parts[0] || e.meta.desc;
  }
  if (!itemDesc && e.narr) {
    let n = e.narr;
    if (partyName && partyName !== '-' && n.startsWith(partyName)) {
      n = n.slice(partyName.length).replace(/^[\s\-·:]+/, '');
    }
    const parts = n.split(/\s*-\s*(?:Invoice|Bill|Inv|PB|Ref)\s*/i);
    itemDesc = parts[0] || n;
  }
  return itemDesc ? itemDesc.trim() : '';
}

export function showEnt(id) {
  const e = db.entries.find(x => x.id === id);
  if (!e) return;

  const d = getTxnRowData(e);
  const linkedDoc = findLinkedDoc(e);
  const can = e.status === 'posted' && ['in', 'out', 'exp', 'xfer', 'jv', 'open', 'loan'].includes(e.src);

  // 1. Header Title & Type determination
  const isOutflow = e.src === 'out' || e.src === 'bill' || e.src === 'exp' || (e.src === 'loan' && e.lines.some(l => l.c && acc(l.a)?.cash));
  const isInflow = e.src === 'in' || e.src === 'sale' || (e.src === 'loan' && e.lines.some(l => l.d && acc(l.a)?.cash));
  const isTransfer = e.src === 'xfer';

  let title = isOutflow ? 'Payment Voucher' : (isInflow ? 'Payment Receipt' : 'Transaction Voucher');
  if (e.src === 'loan') title = isOutflow ? 'Loan Payment Voucher' : 'Loan Receipt Voucher';
  else if (e.src === 'exp') title = 'Payment Voucher (Expense)';
  else if (e.src === 'xfer') title = 'Transfer Voucher (Contra)';
  else if (e.src === 'jv' || e.src === 'open') title = 'Journal Voucher';

  // 2. Status Badge
  const isPosted = e.status === 'posted';
  const statusBadge = isPosted
    ? `<span style="background:#ecfdf5;color:#047857;border:1px solid #a7f3d0;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;letter-spacing:0.5px;text-transform:uppercase;">COMPLETED / POSTED</span>`
    : `<span style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;letter-spacing:0.5px;text-transform:uppercase;">REVERSED</span>`;

  // 3. Amount & Inflow / Outflow highlight
  let amtBoxBg = 'var(--mu)';
  let amtBoxBorder = 'var(--bd)';
  let amtTextColor = 'var(--tx)';
  let amtLabel = 'TOTAL AMOUNT';
  let amtPrefix = '';

  if (isInflow) {
    amtBoxBg = 'rgba(16, 185, 129, 0.08)';
    amtBoxBorder = 'rgba(16, 185, 129, 0.28)';
    amtTextColor = '#0f5132';
    amtLabel = 'TOTAL AMOUNT RECEIVED';
    amtPrefix = '+';
  } else if (isOutflow) {
    amtBoxBg = 'rgba(239, 68, 68, 0.08)';
    amtBoxBorder = 'rgba(239, 68, 68, 0.28)';
    amtTextColor = '#dc2626';
    amtLabel = 'TOTAL AMOUNT PAID';
    amtPrefix = '-';
  } else if (isTransfer) {
    amtBoxBg = 'rgba(2, 132, 199, 0.08)';
    amtBoxBorder = 'rgba(2, 132, 199, 0.28)';
    amtTextColor = '#0369a1';
    amtLabel = 'TOTAL TRANSFER AMOUNT';
    amtPrefix = '';
  }

  // 4. Voucher / Txn ID display (e.g. PV-0003, RCPT-0003, or TR-0003)
  const voucherPrefix = isOutflow ? 'PV-' : (isInflow ? 'RCPT-' : (isTransfer ? 'TR-' : ''));
  const displayVoucherNo = voucherPrefix && e.ref.startsWith('JV-') ? e.ref.replace('JV-', voucherPrefix) : e.ref;

  // 5. Party / Contact Name
  let partyLabel = 'Party / Contact';
  if (isInflow) partyLabel = 'Received From (Customer / Payer)';
  else if (isOutflow) partyLabel = 'Paid To (Supplier / Payee)';
  else if (isTransfer) partyLabel = 'Transfer Type';

  let partyDisplay = d.partyName !== '-' ? d.partyName : '';
  if (isTransfer) {
    partyDisplay = e.meta?.transferType || d.method || 'Internal Contra Transfer';
  } else if (!partyDisplay && linkedDoc) {
    partyDisplay = linkedDoc.sup || linkedDoc.c?.n || pn(linkedDoc.party) || '';
  }
  if (!partyDisplay) partyDisplay = 'Self / Internal';

  // 6. Paid From / Deposited To Account & Payment Method display
  const accountLabel = isOutflow ? 'Paid From (Account)' : (isInflow ? 'Deposit To (Account)' : (isTransfer ? 'From Account (Credited)' : 'Account / Payment Method'));
  let paymentMethodDisplay = d.method !== '-' ? d.method : '';
  if (isTransfer) {
    const fromL = e.lines.find(l => l.c);
    paymentMethodDisplay = fromL ? an(fromL.a) : 'Cash in Hand';
  } else if (d.acctName !== '-') {
    if (!paymentMethodDisplay || (paymentMethodDisplay.toLowerCase() === 'cash' && d.acctName.toLowerCase().includes('cash'))) {
      paymentMethodDisplay = d.acctName;
    } else if (!d.acctName.toLowerCase().includes(paymentMethodDisplay.toLowerCase())) {
      paymentMethodDisplay = `${d.acctName} (${paymentMethodDisplay})`;
    } else {
      paymentMethodDisplay = d.acctName;
    }
  }
  if (!paymentMethodDisplay) paymentMethodDisplay = 'Cash in Hand';

  // 7. Linked Document Link (Clickable link opening the Purchase Bill or Invoice)
  const docLabelTitle = isOutflow ? 'Linked Bill' : (isInflow ? 'Linked Invoice' : (isTransfer ? 'To Account (Debited)' : 'Linked Document'));
  let linkedDocHtml = '<span style="color:var(--t2)">None</span>';
  if (isTransfer) {
    const toL = e.lines.find(l => l.d);
    linkedDocHtml = `<b style="color:var(--tx);">${esc(toL ? an(toL.a) : 'Bank Account')}</b>`;
  } else if (linkedDoc) {
    const docText = linkedDoc.type === 'bill' ? `Bill ${linkedDoc.sno || linkedDoc.no}` : `Invoice #${linkedDoc.no}`;
    linkedDocHtml = `<a href="javascript:void(0)" id="linkedDocLink" title="Click to view ${linkedDoc.type === 'bill' ? 'bill' : 'invoice'}" style="color:var(--ac);text-decoration:underline;cursor:pointer;display:inline-flex;align-items:center;gap:4px;font-weight:600;">
      ${esc(docText)} ↗
    </a>`;
  } else if (d.refNo && d.refNo !== '-') {
    linkedDocHtml = `<code>${esc(d.refNo)}</code>`;
  }

  // 8. Itemized Description (e.g. "Iron scrap (350 kg) - Bill BILL-001")
  let displayDesc = (e.meta?.desc || '').trim();
  if (!displayDesc && e.narr) {
    let n = e.narr.trim();
    if (partyDisplay && partyDisplay !== '-' && n.startsWith(partyDisplay)) {
      n = n.slice(partyDisplay.length).replace(/^[\s\-·:]+/, '');
    }
    displayDesc = n;
  }
  if (!displayDesc) {
    const itemBreakdown = getItemBreakdown(e, linkedDoc, partyDisplay);
    displayDesc = itemBreakdown || (d.desc !== '-' ? d.desc : 'Payment transaction');
  }

  const formattedDate = fmtTxnDate(e.date, e.at);

  modal(`
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;border-bottom:1px solid var(--bd);padding-bottom:12px;">
      <div>
        <h3 style="margin:0 0 4px;font-size:18px;display:flex;align-items:center;gap:8px;">
          ${esc(title)}
        </h3>
        <div style="font-size:12px;color:var(--t2);">
          <b>${esc(db.biz.name)}</b>${db.biz.gstin ? ' · GSTIN: ' + esc(db.biz.gstin) : ''}
        </div>
      </div>
      <button type="button" id="closeHeaderBtn" class="no-print" style="background:transparent;border:0;padding:4px 8px;font-size:18px;cursor:pointer;color:var(--t2);" title="Close">✕</button>
    </div>

    <!-- Total Amount & Status Hero Card -->
    <div style="background:${amtBoxBg};border:1px solid ${amtBoxBorder};border-radius:10px;padding:14px 18px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="font-size:11px;font-weight:700;color:var(--t2);letter-spacing:0.6px;text-transform:uppercase;">${amtLabel}</div>
        <div style="font-size:28px;font-weight:800;color:${amtTextColor};line-height:1.2;font-variant-numeric:tabular-nums;margin-top:2px;">
          ${amtPrefix}${fmt(d.amt)}
        </div>
      </div>
      <div style="text-align:right;">
        ${statusBadge}
      </div>
    </div>

    <!-- Key Details Section (Grid Layout) -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));gap:12px 16px;background:var(--sf);border:1px solid var(--bd);border-radius:10px;padding:14px 16px;margin-bottom:14px;">
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:0.5px;">Voucher / Txn ID</div>
        <div style="margin-top:3px;font-weight:600;font-size:13.5px;">
          <code>${esc(displayVoucherNo)}</code>${displayVoucherNo !== e.ref ? ` <span style="font-size:11px;color:var(--t2)">(${esc(e.ref)})</span>` : ''}
        </div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:0.5px;">Date</div>
        <div style="margin-top:3px;font-weight:600;font-size:13.5px;">${esc(formattedDate)}</div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:0.5px;">${esc(partyLabel)}</div>
        <div style="margin-top:3px;font-weight:700;font-size:13.5px;color:var(--tx);">${esc(partyDisplay)}</div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:0.5px;">${esc(accountLabel)}</div>
        <div style="margin-top:3px;font-weight:600;font-size:13.5px;color:var(--tx);">${esc(paymentMethodDisplay)}</div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:0.5px;">Category</div>
        <div style="margin-top:3px;font-weight:500;font-size:13.5px;">${esc(d.catName)}</div>
      </div>
      <div>
        <div style="font-size:11px;font-weight:600;color:var(--t2);text-transform:uppercase;letter-spacing:0.5px;">${esc(docLabelTitle)}</div>
        <div style="margin-top:3px;font-weight:600;font-size:13.5px;">${linkedDocHtml}</div>
      </div>
    </div>

    <!-- Itemized Description -->
    <div style="background:var(--mu);border:1px solid var(--bd);border-radius:10px;padding:12px 16px;margin-bottom:14px;">
      <div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">
        Itemized Description
      </div>
      <div style="font-size:14px;font-weight:600;color:var(--tx);">
        ${esc(displayDesc)}
      </div>
    </div>

    <!-- Collapsible Accounting Details ("Accounting / Ledger Details") -->
    <details class="no-print" style="border:1px solid var(--bd);border-radius:10px;background:var(--sf);overflow:hidden;margin-bottom:14px;">
      <summary style="cursor:pointer;padding:10px 16px;font-size:12.5px;font-weight:600;color:var(--t2);background:var(--mu);user-select:none;display:flex;justify-content:space-between;align-items:center;">
        <span>⚡ Accounting / Ledger Details (Double-Entry)</span>
        <span style="font-size:11px;opacity:0.7">Expand ▼</span>
      </summary>
      <div style="padding:12px 16px;">
        <div class="wrap" style="margin-bottom:10px;border:1px solid var(--bd);border-radius:8px;">
          <table style="width:100%;font-size:12.5px;">
            <thead>
              <tr>
                <th>Account</th>
                <th class="num">Debit</th>
                <th class="num">Credit</th>
              </tr>
            </thead>
            <tbody>
              ${e.lines.map(l => `<tr>
                <td>
                  <b>${esc(an(l.a))}</b>
                  ${l.p ? '<br><small style="color:var(--t2)">' + esc(pn(l.p)) + '</small>' : ''}
                </td>
                <td class="num">${l.d ? fmt(l.d) : '-'}</td>
                <td class="num">${l.c ? fmt(l.c) : '-'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div style="font-size:11.5px;color:var(--t2);line-height:1.4;">
          Posted journal entries follow strict double-entry standards and are immutable.
          ${e.src === 'sale' || e.src === 'bill' || e.src === 'pay' || e.src === 'loan' ? ' To cancel linked invoices or bills, use Cancel on their respective page.' : ' Correct by reversing if required.'}
        </div>
      </div>
    </details>

    <!-- Document Attachments & Camera Scans -->
    <div id="ent_att_box" style="margin-bottom:14px;display:none;background:#f8fafc;border:1px solid var(--bd);border-radius:10px;padding:12px 16px;">
      <div style="font-size:11px;font-weight:700;color:var(--t2);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">
        📎 Attached Receipts &amp; Weighbridge Slips
      </div>
      <div id="ent_att_list" style="display:flex;flex-wrap:wrap;gap:8px;"></div>
    </div>

    <!-- Action Buttons -->
    <div class="row no-print" style="display:flex;gap:10px;justify-content:flex-end;align-items:center;flex-wrap:wrap;margin-top:16px;">
      <button type="button" id="printReceiptBtn" style="display:inline-flex;align-items:center;gap:6px;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
        ${isOutflow ? 'Print Voucher / Export PDF' : 'Print Receipt / Export PDF'}
      </button>
      ${linkedDoc ? `
        <button type="button" class="btn" id="viewLinkedDocBtn" style="display:inline-flex;align-items:center;gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          View ${linkedDoc.type === 'bill' ? 'Purchase Bill' : 'Sales Invoice'}
        </button>
      ` : ''}
      ${can ? `
        <button type="button" class="d" data-a="rev" data-i="${e.id}" style="display:inline-flex;align-items:center;gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
          Reverse Entry
        </button>
      ` : ''}
      ${e.src === 'jv' && e.status === 'posted' ? `
        <button type="button" class="btn" data-a="editjv" data-i="${e.id}" style="display:inline-flex;align-items:center;gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          Edit Journal
        </button>
      ` : ''}
      <button type="button" id="closeEntBtn" class="p">Close</button>
    </div>
  `);

  const attTargetId = e.id || (linkedDoc ? linkedDoc.id : null);
  if (attTargetId) {
    getAttachments(attTargetId).then(files => {
      if (files && files.length) {
        const box = $('#ent_att_box');
        const list = $('#ent_att_list');
        if (box && list) {
          box.style.display = 'block';
          list.innerHTML = files.map((f, i) => `
            <button type="button" class="btn alt sm ent-att-btn" data-i="${i}" style="display:inline-flex;align-items:center;gap:6px;">
              <span>${f.type?.includes('image') ? '🖼️' : '📄'}</span>
              <span>${esc(f.name)}</span>
            </button>
          `).join('');
          list.querySelectorAll('.ent-att-btn').forEach(btn => {
            btn.onclick = () => {
              const idx = parseInt(btn.dataset.i, 10);
              showAttachmentViewer(files, idx);
            };
          });
        }
      }
    });
  }

  const printBtn = $('#printReceiptBtn');
  if (printBtn) printBtn.onclick = () => window.print();

  const closeHeaderBtn = $('#closeHeaderBtn');
  if (closeHeaderBtn) closeHeaderBtn.onclick = closeM;

  const closeEntBtn = $('#closeEntBtn');
  if (closeEntBtn) closeEntBtn.onclick = closeM;

  // View linked doc directly in bills/sales page
  const viewLinkedDocBtn = $('#viewLinkedDocBtn');
  if (viewLinkedDocBtn && linkedDoc) {
    viewLinkedDocBtn.onclick = async () => {
      closeM();
      if (linkedDoc.type === 'bill') {
        const { billsState } = await import('../views/bills.js');
        billsState.tab = 'rec';
        billsState.q = linkedDoc.sno || linkedDoc.no || '';
        location.hash = '#/bills';
        window.dispatchEvent(new CustomEvent('bufin-render'));
      } else {
        const { salesState } = await import('../views/sales.js');
        salesState.tab = 'view';
        salesState.viewNo = linkedDoc.no;
        location.hash = '#/sales';
        window.dispatchEvent(new CustomEvent('bufin-render'));
      }
    };
  }

  const linkedDocLink = $('#linkedDocLink');
  if (linkedDocLink && linkedDoc) {
    linkedDocLink.onclick = async (ev) => {
      ev.preventDefault();
      closeM();
      if (linkedDoc.type === 'bill') {
        const { billsState } = await import('../views/bills.js');
        billsState.tab = 'rec';
        billsState.q = linkedDoc.sno || linkedDoc.no || '';
        location.hash = '#/bills';
        window.dispatchEvent(new CustomEvent('bufin-render'));
      } else {
        const { salesState } = await import('../views/sales.js');
        salesState.tab = 'view';
        salesState.viewNo = linkedDoc.no;
        location.hash = '#/sales';
        window.dispatchEvent(new CustomEvent('bufin-render'));
      }
    };
  }
}

export function showDoc(id) {
  const d = db.docs.find(x => x.id === id);
  if (!d) return;
  const p = db.parties.find(x => x.id === d.party) || {};
  const s = d.type === 'sale';
  const st = dstat(d);
  const b = db.biz || {};
  modal(`<h3>${d.no} <span class="b ${st[1]}">${st[0]}</span></h3>
    <div style="font-size:12.5px;line-height:1.5;margin-bottom:12px;padding:10px 12px;background:#f8fafc;border:1px solid var(--bd);border-radius:6px">
      <div style="font-weight:700;font-size:15px;color:var(--tx)">${esc(b.name || 'PD ENTERPRISES')}</div>
      ${b.addr ? `<div style="color:var(--t2)">${esc(b.addr).replace(/\n/g, ', ')}</div>` : ''}
      <div style="color:var(--t2)">${b.phone ? 'Mob: ' + esc(b.phone) : ''}${b.email ? (b.phone ? ' | ' : '') + 'Email: ' + esc(b.email) : ''}</div>
      <div><b>GSTIN:</b> <code>${esc(b.gstin || '')}</code> · <b>State:</b> ${esc(b.state || 'Odisha')} (Code: 21)</div>
    </div>
    <p><b>${s ? 'Bill to' : 'Supplier'}:</b> ${esc(p.name || d.sup || '')} ${p.gstin || d.gstin ? '· <b>GSTIN:</b> ' + esc(p.gstin || d.gstin) : ''}<br>
    <b>Date:</b> ${d.date}${d.due ? ' · <b>Due:</b> ' + d.due : ''}</p>
    <div class="wrap"><table>
      <tr><td>${esc(d.desc)}</td><td class="num">${fmt(d.base)}</td></tr>
      ${taxRows(d, s)}
      <tr class="tot"><td>Total</td><td class="num">${fmt(d.total)}</td></tr>
      <tr><td>Paid</td><td class="num">${fmt(paid(d))}</td></tr>
      <tr class="tot"><td>Outstanding</td><td class="num">${fmt(out(d))}</td></tr>
    </table></div>
    ${d.pays.length ? '<small>Payments: ' + d.pays.map(x => x.date + ' ' + fmt(x.amt) + (x.void ? ' (void)' : '')).join(', ') + '</small>' : ''}
    <div class="row">
      <button onclick="window.print()">Print</button>
      ${!d.cancelled && out(d) > 0 ? `<button class="p" data-a="pay" data-i="${d.id}">${s ? 'Receive payment' : 'Pay bill'}</button>` : ''}
      ${!d.cancelled ? `<button class="d" data-a="cdoc" data-i="${d.id}">Cancel</button>` : ''}
      <button id="closeDocBtn">Close</button>
    </div>`);
  $('#closeDocBtn').onclick = closeM;
}

export function markBillPaid(docOrId, onComplete) {
  const d = typeof docOrId === 'object' ? docOrId : db.docs.find(x => x.id === docOrId || x.sno === docOrId || x.no === docOrId);
  if (!d) return;
  const total = (d.total || 0) / 100;
  const currentPaid = (d.pays || []).reduce((s, p) => s + (p.void ? 0 : p.amt), 0);
  const balPaisa = Math.max(0, (d.total || 0) - currentPaid);
  if (balPaisa <= 0) {
    toast('This purchase bill is already paid in full');
    return;
  }

  const supplierName = d.sup || pn(d.party) || 'Supplier';
  const billNo = d.sno || d.no || 'PB';
  const matDesc = `${d.mat || d.desc || 'Material purchase'}${d.q ? ' (' + d.q + ' ' + (d.u || 'kg') + ')' : ''}`;
  const defaultNotes = `${matDesc} - Bill ${billNo}`;

  form('Mark Purchase Bill Paid',
    `<div style="background:#f8fafc;border:1px solid var(--bd);border-radius:8px;padding:12px;margin-bottom:14px;font-size:13px;line-height:1.6">
      <div><b>Supplier:</b> ${esc(supplierName)}</div>
      <div><b>Bill No:</b> <code>${esc(billNo)}</code> · <b>Bill Date:</b> ${d.date || today()}</div>
      <div><b>Material / Item:</b> ${esc(matDesc)}</div>
      <div style="margin-top:6px;font-size:14px;color:var(--tx)">
        <b>Total Bill:</b> ₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })} · 
        <b style="color:#842029">Balance Due:</b> <span style="font-weight:700;color:#842029">₹${(balPaisa / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
      </div>
    </div>
    <div class="two">
      ${fld('date', 'Payment Date', 'date', today(), 1)}
      ${fld('amt', 'Payment Amount (₹)', 'number', (balPaisa / 100).toFixed(2), 1, `min="0.01" max="${(balPaisa / 100).toFixed(2)}" step="any" id="bill_pay_amt"`)}
      <label>Paid From Account *
        <select name="acct" id="bill_pay_acct" required>
          ${accOpts(a => a.cash)}
        </select>
        <div id="bill_pay_cash_hint" style="font-size:12px;color:var(--t2);margin-top:3px;"></div>
      </label>
      <div id="bill_pay_method_wrap">
        <label>Payment Method
          <select name="method" id="bill_pay_method">
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="UPI">UPI</option>
            <option value="Cheque">Cheque</option>
            <option value="Debit Card">Debit Card</option>
            <option value="Other">Other</option>
          </select>
        </label>
      </div>

      <!-- Live Insufficient Cash Warning -->
      <div id="bill_pay_cash_warn" style="grid-column: 1 / -1; display:none; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:10px 14px; font-size:12.5px; color:#991b1b; line-height:1.4;">
        <b>⚠️ Insufficient Cash in Hand Balance:</b>
        <span id="bill_pay_cash_warn_text">Available cash is less than this payment. Physical cash cannot be negative. Please deposit funds or pay via Bank Account.</span>
      </div>

      ${fld('ref', 'Reference no. (optional)', 'text', '', 0, 'placeholder="e.g. UTR / Cheque / Txn ID"')}
      <label style="grid-column: 1 / -1;">Description / Notes
        <textarea name="desc" id="bill_pay_desc" rows="2" placeholder="Itemized details, material type, quantity, or specific invoice context...">${esc(defaultNotes)}</textarea>
      </label>
    </div>`,
    v => {
      const a = P(v.amt);
      if (!a || a <= 0) throw Error('Amount must be above zero');
      const curBalPaisa = Math.max(0, (d.total || 0) - (d.pays || []).reduce((s, p) => s + (p.void ? 0 : p.amt), 0));
      if (curBalPaisa <= 0) throw Error('This bill is already paid in full');
      const aPaisa = Math.min(Math.round(a * 100), curBalPaisa);

      const isCash = v.acct === '1000' || (acc(v.acct)?.name || '').toLowerCase().includes('cash');
      if (isCash) {
        const check = checkCashLiquidity('1000', aPaisa);
        if (!check.ok) {
          throw Error(check.error);
        }
      }

      const finalMethod = isCash ? 'Cash' : (v.method || 'Bank Transfer');
      const userDesc = (v.desc || '').trim();
      const narr = userDesc ? `${supplierName} - ${userDesc}` : `${supplierName} - Payment for Bill ${billNo}`;

      const pJe = post({
        date: v.date,
        src: 'out',
        narr,
        meta: {
          method: finalMethod,
          ref: (v.ref || billNo).trim(),
          docNo: billNo,
          billId: d.id,
          party: d.party,
          partyName: supplierName,
          acct: v.acct,
          cat: '2000',
          desc: userDesc
        },
        lines: [
          { a: '2000', d: aPaisa, c: 0, p: d.party },
          { a: v.acct, d: 0, c: aPaisa, p: d.party }
        ]
      });

      if (!d.pays) d.pays = [];
      d.pays.push({ je: pJe.id, amt: aPaisa, date: v.date, method: finalMethod, acct: v.acct });
      d.paid = total - (Math.max(0, curBalPaisa - aPaisa) / 100);
      save();
      toast('Marked ' + billNo + ' as paid (' + finalMethod + ')');
      if (onComplete) onComplete();
    },
    'Confirm Payment',
    () => {
      const acctEl = $('#bill_pay_acct');
      const methWrap = $('#bill_pay_method_wrap');
      const methSel = $('#bill_pay_method');
      const amtEl = $('#bill_pay_amt');
      const hintEl = $('#bill_pay_cash_hint');
      const warnEl = $('#bill_pay_cash_warn');
      const warnTextEl = $('#bill_pay_cash_warn_text');
      const bankMethods = ['Bank Transfer', 'UPI', 'Cheque', 'Debit Card', 'Other'];

      function syncAcct() {
        if (!acctEl || !methWrap || !methSel) return;
        const code = acctEl.value;
        const isCash = code === '1000' || (acc(code)?.name || '').toLowerCase().includes('cash');
        if (hintEl) {
          if (isCash) {
            const curCash = net('1000');
            hintEl.innerHTML = `Available Cash in Hand: <b style="color:${curCash <= 0 ? '#dc2626' : '#166534'}">${fmt(curCash)}</b>`;
          } else {
            hintEl.innerHTML = `Available Bank Balance: <b>${fmt(net('1010'))}</b>`;
          }
        }
        if (isCash) {
          methWrap.style.display = 'none';
          methSel.innerHTML = '<option value="Cash" selected>Cash</option>';
        } else {
          methWrap.style.display = '';
          const cur = methSel.value && methSel.value !== 'Cash' ? methSel.value : 'Bank Transfer';
          methSel.innerHTML = bankMethods.map(m => `<option value="${m}"${m === cur ? ' selected' : ''}>${m}</option>`).join('');
        }
        checkWarn();
      }

      function checkWarn() {
        if (!warnEl || !acctEl) return;
        const isCash = acctEl.value === '1000' || (acc(acctEl.value)?.name || '').toLowerCase().includes('cash');
        if (!isCash) {
          warnEl.style.display = 'none';
          return;
        }
        const curCash = net('1000');
        const entered = P(amtEl?.value || 0);
        if (entered > curCash) {
          warnEl.style.display = 'block';
          if (warnTextEl) {
            warnTextEl.textContent = `Available cash is ${fmt(Math.max(0, curCash))}, but payment is ${fmt(entered)}. Physical cash cannot be negative. Please deposit funds or select Bank Account.`;
          }
        } else {
          warnEl.style.display = 'none';
        }
      }

      if (acctEl) acctEl.onchange = syncAcct;
      if (amtEl) amtEl.oninput = checkWarn;
      syncAcct();
    }
  );
}

export function markSalePaid(docOrId, onComplete) {
  const d = typeof docOrId === 'object' ? docOrId : db.docs.find(x => x.id === docOrId || x.no === docOrId);
  if (!d) return;
  const currentPaid = (d.pays && d.pays.length)
    ? d.pays.reduce((s, p) => s + (p.void ? 0 : p.amt), 0)
    : Math.round((parseFloat(d.paid) || 0) * 100);
  const totalPaisa = d.total || Math.round((parseFloat(d.base || 0) + parseFloat(d.gst || 0)));
  const total = totalPaisa / 100;
  const balPaisa = Math.max(0, totalPaisa - currentPaid);
  if (balPaisa <= 0) {
    toast('This sales invoice is already paid in full');
    return;
  }

  const customerName = d.c?.n || pn(d.party) || 'Customer';
  const invNo = d.no || 'INV';
  const itemsText = d.lines && d.lines.length
    ? d.lines.map(l => l.n + (l.q ? ' (' + l.q + ' ' + (l.u || 'kg') + ')' : '')).join(', ')
    : (d.desc || 'Scrap sale');
  const vehicleText = d.veh || '—';
  const detailsStr = `${itemsText}${d.veh ? ' · Veh: ' + d.veh : ''}`;
  const defaultNotes = `${detailsStr} - Invoice ${invNo}`;

  const rawDate = d.date || today();
  let formattedDate = rawDate;
  try {
    const parts = rawDate.split('-');
    if (parts.length === 3) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const mIdx = parseInt(parts[1], 10) - 1;
      const mName = months[mIdx] || parts[1];
      formattedDate = `${parseInt(parts[2], 10)} ${mName} ${parts[0]}`;
    }
  } catch (e) { }

  const isPartial = currentPaid > 0 && balPaisa > 0;
  const statusLabel = isPartial ? 'Part paid' : 'Unpaid';
  const statusClass = isPartial ? 'sale-pay-status-part' : 'sale-pay-status-unpaid';

  form('Mark Sales Invoice Paid',
    `<div class="sale-pay-summary-card">
      <div class="sale-pay-header-row">
        <div class="sale-pay-cust-name">${esc(customerName)}</div>
        <span class="sale-pay-status-badge ${statusClass}">${statusLabel}</span>
      </div>
      <div class="sale-pay-details-grid">
        <div class="sale-pay-detail-item">
          <span class="sale-pay-label">Invoice Ref</span>
          <span class="sale-pay-val sale-pay-ref font-mono">${esc(invNo)}</span>
        </div>
        <div class="sale-pay-detail-item">
          <span class="sale-pay-label">Date</span>
          <span class="sale-pay-val sale-pay-date">${esc(formattedDate)}</span>
        </div>
        <div class="sale-pay-detail-item">
          <span class="sale-pay-label">Items</span>
          <span class="sale-pay-val sale-pay-items" title="${esc(itemsText)}">${esc(itemsText)}</span>
        </div>
        <div class="sale-pay-detail-item">
          <span class="sale-pay-label">Vehicle</span>
          <span class="sale-pay-val sale-pay-veh font-mono">${esc(vehicleText)}</span>
        </div>
      </div>
      <div class="sale-pay-footer-box">
        <div class="sale-pay-total-wrap">
          <span class="sale-pay-total-label">Total Invoice Amount</span>
          <span class="sale-pay-total-val">₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        </div>
        <div class="sale-pay-bal-wrap">
          <span class="sale-pay-bal-label">Balance Due</span>
          <span class="sale-pay-bal-val">₹${(balPaisa / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
        </div>
      </div>
    </div>
    <div class="two">
      ${fld('date', 'Receipt Date', 'date', today(), 1)}
      ${fld('amt', 'Amount Received (₹)', 'number', (balPaisa / 100).toFixed(2), 1, `min="0.01" max="${(balPaisa / 100).toFixed(2)}" step="any"`)}
      <label>Deposit To Account *
        <select name="acct" id="sale_pay_acct" required>
          ${accOpts(a => a.cash)}
        </select>
      </label>
      <div id="sale_pay_method_wrap">
        <label>Payment Method
          <select name="method" id="sale_pay_method">
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="UPI">UPI</option>
            <option value="Cheque">Cheque</option>
            <option value="Debit Card">Debit Card</option>
            <option value="Other">Other</option>
          </select>
        </label>
      </div>
      ${fld('ref', 'Reference no. (optional)', 'text', '', 0, 'placeholder="e.g. UTR / Cheque / Txn ID"')}
      <label style="grid-column: 1 / -1;">Description / Notes
        <textarea name="desc" id="sale_pay_desc" rows="2" placeholder="Itemized details, material type, quantity, or specific invoice context...">${esc(defaultNotes)}</textarea>
      </label>
    </div>`,
    v => {
      const a = P(v.amt);
      if (!a || a <= 0) throw Error('Amount must be above zero');
      const curPaid = (d.pays && d.pays.length)
        ? d.pays.reduce((s, p) => s + (p.void ? 0 : p.amt), 0)
        : Math.round((parseFloat(d.paid) || 0) * 100);
      const curBalPaisa = Math.max(0, totalPaisa - curPaid);
      if (curBalPaisa <= 0) throw Error('This invoice is already paid in full');
      const aPaisa = Math.min(Math.round(a * 100), curBalPaisa);

      const isCash = v.acct === '1000' || (acc(v.acct)?.name || '').toLowerCase().includes('cash');
      const finalMethod = isCash ? 'Cash' : (v.method || 'Bank Transfer');
      const userDesc = (v.desc || '').trim();
      const narr = userDesc ? `${customerName} - ${userDesc}` : `${customerName} - Receipt for Invoice ${invNo}`;

      const pJe = post({
        date: v.date,
        src: 'in',
        narr,
        meta: {
          method: finalMethod,
          ref: (v.ref || invNo).trim(),
          docNo: invNo,
          invoiceId: d.id,
          party: d.party,
          partyName: customerName,
          acct: v.acct,
          cat: '1100',
          desc: userDesc
        },
        lines: [
          { a: v.acct, d: aPaisa, c: 0, p: d.party },
          { a: '1100', d: 0, c: aPaisa, p: d.party }
        ]
      });

      if (!d.pays) d.pays = [];
      d.pays.push({ je: pJe.id, amt: aPaisa, date: v.date, method: finalMethod, acct: v.acct });
      d.paid = (totalPaisa - Math.max(0, curBalPaisa - aPaisa)) / 100;
      save();
      toast('Marked ' + invNo + ' as paid (' + finalMethod + ')');
      if (onComplete) onComplete();
    },
    'Confirm Payment Received',
    () => {
      const acctEl = $('#sale_pay_acct');
      const methWrap = $('#sale_pay_method_wrap');
      const methSel = $('#sale_pay_method');
      const bankMethods = ['Bank Transfer', 'UPI', 'Cheque', 'Debit Card', 'Other'];

      function syncAcct() {
        if (!acctEl || !methWrap || !methSel) return;
        const code = acctEl.value;
        const isCash = code === '1000' || (acc(code)?.name || '').toLowerCase().includes('cash');
        if (isCash) {
          methWrap.style.display = 'none';
          methSel.innerHTML = '<option value="Cash" selected>Cash</option>';
        } else {
          methWrap.style.display = '';
          const cur = methSel.value && methSel.value !== 'Cash' ? methSel.value : 'Bank Transfer';
          methSel.innerHTML = bankMethods.map(m => `<option value="${m}"${m === cur ? ' selected' : ''}>${m}</option>`).join('');
        }
      }

      if (acctEl) acctEl.onchange = syncAcct;
      syncAcct();
    }
  );
}

export function payForm(id, onComplete) {
  const d = typeof id === 'object' ? id : db.docs.find(x => x.id === id || x.no === id || x.sno === id);
  if (!d) return;
  if (d.type === 'sale') {
    markSalePaid(d, onComplete);
  } else {
    markBillPaid(d, onComplete);
  }
}

export function partyPay(i, ty) {
  const s = ty === 'sale';
  const p = db.parties.find(x => x.id === i);
  if (!p) return;
  const L = db.docs.filter(d => d.party === i && d.type === ty && !d.cancelled && out(d) > 0).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const T = L.reduce((x, d) => x + out(d), 0);
  form(s ? 'Receive payment from ' + p.name : 'Pay ' + p.name,
    `<div class="two">
      ${fld('date', 'Date', 'date', today(), 1)}
      ${fld('amt', 'Amount (₹)', 'text', (T / 100).toFixed(2), 1)}
      ${sel('acct', 'Account', accOpts(a => a.cash))}
      ${fld('ref', 'Reference')}
    </div>
    <small>Applied to the oldest open ${s ? 'invoices' : 'bills'} first. Open: ${fmt(T)} across ${L.length} document(s).</small>`,
    v => {
      let r = P(v.amt);
      if (!r || r > T) throw Error('Amount must be above zero and within the open ' + fmt(T));
      if (db.biz.lock && v.date <= db.biz.lock) throw Error('Period is locked up to ' + db.biz.lock);
      for (const d of L) {
        if (r <= 0) break;
        const a = Math.min(r, out(d));
        const e = post({
          date: v.date,
          src: 'pay',
          narr: (s ? 'Receipt for ' : 'Payment for ') + d.no,
          meta: { ref: v.ref },
          lines: s ? [{ a: v.acct, d: a, c: 0, p: i }, { a: '1100', d: 0, c: a, p: i }] : [{ a: '2000', d: a, c: 0, p: i }, { a: v.acct, d: 0, c: a, p: i }]
        });
        d.pays.push({ je: e.id, amt: a, date: v.date });
        r -= a;
      }
    }
  );
}

export function docForm2(ty, preParty) {
  const s = ty === 'sale';
  const ok = db.parties.some(s ? isC : isS);

  const calc = () => {
    const f = $('#f');
    if (!f || !f.amt) return;
    const v = Object.fromEntries(new FormData(f));
    let b = 0;
    try { b = P(v.amt || '0'); } catch (e) {}
    const g = Math.round(b * (parseFloat(v.gst || 0) || 0) / 100);
    const p = db.parties.find(x => x.id === v.party);
    const t = taxSplit(g, p);
    if (p && p.terms && v.date && f.due && !f.due.dataset.u) f.due.value = addD(v.date, +p.terms);
    const sp = !g ? 'no GST' : t.ig ? 'IGST ' + fmt(t.ig) : t.cg !== undefined ? 'CGST ' + fmt(t.cg) + ' + SGST ' + fmt(t.sg) : 'GST ' + fmt(g) + ' (set states for the split)';
    const pv = $('#pv');
    if (pv) pv.innerHTML = 'Taxable ' + fmt(b) + ' · ' + sp + ' · <b>Total ' + fmt(b + g) + '</b>';
  };

  form(s ? 'New sales invoice' : 'New purchase bill',
    `${ok ? '' : '<div class="warn">No ' + (s ? 'customers' : 'suppliers') + ' yet. Add one under Parties first.</div>'}
    <div class="two">
      ${fld('date', 'Date', 'date', today(), 1, 'id="docDate"')}
      ${fld('due', 'Due date (auto from party terms)', 'date', '', 0, 'id="docDue"')}
      ${sel('party', s ? 'Customer (we sell to)' : 'Supplier (we buy from)', partyOpts(s ? isC : isS, preParty), 'id="docParty"')}
      ${fld('sno', s ? 'Reference' : 'Supplier invoice no.')}
      ${sel('acct', s ? 'Revenue account' : 'Debit account (expense, inventory, asset)', accOpts(a => s ? a.t === 'I' : ['X', 'A'].includes(a.t) && !a.cash && !['1100', '1300', '1400'].includes(a.code), s ? '4000' : '5000'))}
      ${fld('amt', 'Taxable amount (₹)', 'text', '', 1, 'id="docAmt"')}
      ${fld('gst', 'GST rate %', 'number', '0', 0, 'id="docGst"')}
      ${fld('desc', 'Description / items')}
    </div>
    <div class="warn" id="pv"></div>`,
    v => {
      const p = db.parties.find(x => x.id === v.party);
      if (!p || !(s ? isC(p) : isS(p))) throw Error('Choose a ' + (s ? 'customer' : 'supplier') + '. Add one under Parties if needed.');
      const base = P(v.amt);
      const rate = parseFloat(v.gst || 0) || 0;
      const g = Math.round(base * rate / 100);
      const tot = base + g;
      if (!base) throw Error('Amount must be above zero');
      if (!s && v.sno && db.docs.some(d => d.type === 'bill' && d.party === v.party && d.sno === v.sno && !d.cancelled)) {
        throw Error('Duplicate: this supplier invoice number already exists');
      }
      const no = next(ty, s ? 'INV-' : 'BILL-');
      const due = v.due || (p.terms ? addD(v.date, +p.terms) : '');
      const L = s
        ? [{ a: '1100', d: tot, c: 0, p: v.party }, { a: v.acct, d: 0, c: base, p: v.party }].concat(g ? [{ a: '2200', d: 0, c: g }] : [])
        : [{ a: v.acct, d: base, c: 0, p: v.party }].concat(g ? [{ a: '1300', d: g, c: 0 }] : [], [{ a: '2000', d: 0, c: tot, p: v.party }]);
      const e = post({ date: v.date, src: ty, narr: no + ' ' + (v.desc || ''), lines: L });
      db.docs.push({ id: uid(), type: ty, no, date: v.date, due, party: v.party, sno: v.sno, desc: v.desc, base, gst: g, rate, tax: taxSplit(g, p), total: tot, je: e.id, pays: [] });
    },
    'Save',
    () => {
      $('#docDate')?.addEventListener('input', calc);
      $('#docParty')?.addEventListener('change', calc);
      $('#docAmt')?.addEventListener('input', calc);
      $('#docGst')?.addEventListener('input', calc);
      $('#docDue')?.addEventListener('input', e => e.target.dataset.u = '1');
      calc();
    }
  );
}

export function partyForm(id, preType, onSaved) {
  const p = db.parties.find(x => x.id === id) || {};
  const currentType = p.type || preType || 'customer';
  form(id ? 'Edit party' : 'Add party',
    `<div class="two">
      ${fld('name', 'Name', 'text', p.name, 1)}
      ${sel('type', 'Type', opts(Object.entries(PT), currentType))}
      ${fld('phone', 'Phone', 'text', p.phone)}
      ${fld('email', 'Email', 'text', p.email)}
      ${fld('gstin', 'GSTIN', 'text', p.gstin)}
      ${fld('state', 'State', 'text', p.state || db.biz.state || 'Odisha')}
      ${fld('terms', 'Credit terms (days)', 'number', p.terms || '0')}
      ${fld('addr', 'Address', 'text', p.addr)}
    </div>
    ${fld('notes', 'Notes', 'text', p.notes)}
    <small>Customers appear on invoices and Money In. Suppliers appear on bills, expenses and Money Out. Other includes lenders, employees and miscellaneous parties.</small>`,
    v => {
      if (v.gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/i.test(v.gstin)) throw Error('GSTIN format looks invalid');
      if (db.parties.some(x => x.id !== id && x.name.trim().toLowerCase() === v.name.trim().toLowerCase())) throw Error('A party with this name already exists');
      let target;
      if (id) {
        Object.assign(p, v);
        target = p;
      } else {
        target = { id: uid(), ...v };
        db.parties.push(target);
      }
      log('party', v.name);
      if (onSaved) onSaved(target);
    }
  );
}

export function stmt2(i) {
  const p = db.parties.find(x => x.id === i);
  if (!p) return;
  const codes = [isC(p) ? '1100' : '', isS(p) ? '2000' : ''].filter(Boolean);
  const ents = db.entries.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.at || '').localeCompare(b.at || ''));
  let rec = 0, pay = 0;

  const blocks = codes.map(c => {
    let run = 0;
    const rows = ents.flatMap(e => e.lines.filter(l => l.a === c && l.p === i).map(l => {
      run += (c === '1100' ? (l.d - l.c) : (l.c - l.d));
      return `<tr><td>${e.date}</td><td>${esc(e.narr)}</td><td class="num">${l.d ? fmt(l.d) : ''}</td><td class="num">${l.c ? fmt(l.c) : ''}</td><td class="num">${fmt(run)}</td></tr>`;
    }));
    c === '1100' ? rec = run : pay = run;
    return `<h4>${c === '1100' ? 'Receivable: they owe us ' + fmt(run) : 'Payable: we owe them ' + fmt(run)}</h4>
      <div class="wrap"><table><tr><th>Date</th><th>Details</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr>${rows.join('') || '<tr><td colspan="5" class="empty">No transactions yet.</td></tr>'}</table></div>`;
  }).join('');

  const ln = db.loans.filter(l => l.party === i).map(l => `<li>${l.ref}: ${fmt(l.principal - l.repaid)} outstanding</li>`).join('');

  modal(`<h3>${esc(p.name)}</h3>
    <p><small>${PT[p.type] || p.type}${p.phone ? ' · ' + esc(p.phone) : ''}${p.gstin ? ' · GSTIN ' + esc(p.gstin) : ''}${p.state ? ' · ' + esc(p.state) : ''}${p.terms ? ' · ' + p.terms + ' day terms' : ''}</small></p>
    ${blocks}
    ${ln ? '<h4>Loans</h4><ul>' + ln + '</ul>' : ''}
    <div class="row" style="flex-wrap:wrap">
      <button onclick="window.print()">Print</button>
      <button data-a="editparty" data-i="${i}">Edit</button>
      ${isC(p) ? `<button data-a="psale" data-i="${i}">New invoice</button>${rec > 0 ? `<button class="p" data-a="recv" data-i="${i}">Receive payment</button>` : ''}` : ''}
      ${isS(p) ? `<button data-a="pbill" data-i="${i}">New bill</button>${pay > 0 ? `<button class="p" data-a="payp" data-i="${i}">Pay supplier</button>` : ''}` : ''}
      <button id="closeStmtBtn">Close</button>
    </div>`);
  $('#closeStmtBtn').onclick = closeM;
}

export function moneyInForm() {
  let inAttachments = [];
  const parties = db.parties.filter(p => isC(p) || p.type === 'other');
  const catList = db.accounts.filter(a => a.t === 'I' || a.code === '3000' || a.code === '1100');
  const order = ['1100', '4000', '4100', '4200', '4300', '3000'];
  catList.sort((x, y) => {
    const ix = order.indexOf(x.code);
    const iy = order.indexOf(y.code);
    return (ix === -1 ? 99 : ix) - (iy === -1 ? 99 : iy);
  });
  const catOptions = catList.map(a => {
    let name = a.name;
    if (a.code === '1100') name = 'Customer Receipt (Accounts Receivable)';
    return `<option value="${a.code}"${a.code === '4000' ? ' selected' : ''}>${esc(name)}</option>`;
  }).join('');

  const bankMethods = [
    'Bank Transfer / NEFT / RTGS',
    'UPI',
    'Cheque',
    'Debit / Credit Card',
    'Other'
  ];

  form('Money In (Record Received)',
    `<div class="two">
      ${fld('date', 'Date *', 'date', today(), 1)}
      ${fld('amt', 'Amount (₹) *', 'number', '', 1, 'min="0.01" step="any" placeholder="0.00"')}
      <label>Deposit To Account *
        <select name="acct" id="txn_acct" required>
          ${accOpts(a => a.cash)}
        </select>
      </label>
      <label>Income Category *
        <select name="cat" id="txn_cat" required>
          ${catOptions}
        </select>
      </label>
      <div style="grid-column: 1 / -1; display: flex; flex-direction: column; gap: 6px;">
        <label>Customer / Payer
          <select name="party" id="txn_party">
            <option value="">-- None / Walk-in --</option>
            ${parties.map(p => `<option value="${p.id}">${esc(p.name)}${p.phone ? ' (' + esc(p.phone) + ')' : ''}</option>`).join('')}
            <option value="__CUSTOM__">➕ Enter custom customer name...</option>
          </select>
        </label>
        <div id="txn_custom_wrap" style="display:none">
          <label>Custom Customer Name *
            <input type="text" name="custom_party" id="txn_custom_party" placeholder="Type customer name...">
          </label>
        </div>
      </div>
      <div id="txn_method_wrap">
        <label>Payment Method
          <select name="method" id="txn_method">
            ${bankMethods.map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </label>
      </div>
      ${fld('ref', 'Reference no. (optional)', 'text', '', 0, 'placeholder="e.g. UTR / Cheque / Txn ID"')}
      <label style="grid-column: 1 / -1;">Description / Notes
        <textarea name="desc" id="txn_desc" rows="2" placeholder="Itemized details or specific receipt context..."></textarea>
      </label>
      <div style="grid-column: 1 / -1;">
        ${renderAttachmentControl({ idPrefix: 'in_att', files: inAttachments, label: 'Payment Receipt / Challan Attachment' })}
      </div>
    </div>`,
    v => {
      const a = P(v.amt);
      if (!a || a <= 0) throw Error('Amount must be above zero');
      if (!v.date) throw Error('Date is required');
      if (!v.acct) throw Error('Please select an account');
      if (!v.cat) throw Error('Please select an income category');

      let partyId = '';
      let partyName = '';
      if (v.party === '__CUSTOM__') {
        const customName = (v.custom_party || '').trim();
        if (!customName) throw Error('Please enter the custom customer name');
        const existingP = db.parties.find(p => p.name.trim().toLowerCase() === customName.toLowerCase());
        if (existingP) {
          partyId = existingP.id;
          partyName = existingP.name;
        } else {
          const newParty = {
            id: uid(),
            name: customName,
            type: 'customer',
            phone: '',
            gstin: '',
            state: db.biz.state || 'Odisha',
            terms: '0'
          };
          db.parties.push(newParty);
          partyId = newParty.id;
          partyName = newParty.name;
        }
      } else if (v.party) {
        partyId = v.party;
        partyName = pn(v.party);
      }

      const isCash = v.acct === '1000' || (acc(v.acct)?.name || '').toLowerCase().includes('cash');
      const finalMethod = isCash ? 'Cash' : (v.method || 'Bank Transfer');
      const partyDisp = partyName || '';
      const userDesc = (v.desc || '').trim();
      const catDisplayName = v.cat === '1100' ? 'Customer Receipt' : an(v.cat);
      const narr = userDesc
        ? (partyDisp ? `${partyDisp} - ${userDesc}` : userDesc)
        : (partyDisp ? `${partyDisp} - ${catDisplayName}` : catDisplayName);

      const ent = post({
        date: v.date,
        src: 'in',
        narr: narr,
        meta: {
          method: finalMethod,
          ref: (v.ref || '').trim(),
          acct: v.acct,
          cat: v.cat,
          party: partyId || '',
          partyName: partyDisp,
          desc: userDesc
        },
        lines: [
          { a: v.acct, d: a, c: 0, p: partyId },
          { a: v.cat, d: 0, c: a, p: partyId }
        ]
      });
      if (inAttachments.length && ent && ent.id) {
        saveAttachments(ent.id, inAttachments);
      }
    },
    'Save Transaction',
    () => {
      bindAttachmentEvents({
        idPrefix: 'in_att',
        getFiles: () => inAttachments,
        setFiles: f => { inAttachments = f; }
      });

      const acctEl = $('#txn_acct');
      const methWrap = $('#txn_method_wrap');
      const methSel = $('#txn_method');
      const partySel = $('#txn_party');
      const customWrap = $('#txn_custom_wrap');
      const customInput = $('#txn_custom_party');
      const catEl = $('#txn_cat');

      function syncAcctMethod() {
        if (!acctEl || !methWrap || !methSel) return;
        const code = acctEl.value;
        const isCash = code === '1000' || (acc(code)?.name || '').toLowerCase().includes('cash');
        if (isCash) {
          methWrap.style.display = 'none';
          methSel.innerHTML = '<option value="Cash" selected>Cash</option>';
        } else {
          methWrap.style.display = '';
          const cur = methSel.value && methSel.value !== 'Cash' ? methSel.value : 'Bank Transfer / NEFT / RTGS';
          methSel.innerHTML = bankMethods.map(m => `<option value="${m}"${m === cur ? ' selected' : ''}>${m}</option>`).join('');
        }
      }

      if (acctEl) acctEl.onchange = syncAcctMethod;
      syncAcctMethod();

      if (partySel) {
        partySel.onchange = () => {
          if (customWrap) {
            if (partySel.value === '__CUSTOM__') {
              customWrap.style.display = '';
              if (customInput) customInput.focus();
            } else {
              customWrap.style.display = 'none';
              if (customInput) customInput.value = '';
            }
          }
          if (partySel.value && partySel.value !== '__CUSTOM__' && catEl && catEl.value === '4000') {
            catEl.value = '1100';
          } else if (!partySel.value && catEl && catEl.value === '1100') {
            catEl.value = '4000';
          }
        };
      }
    }
  );
}

export function moneyOutForm() {
  let outAttachments = [];
  const suppliers = db.parties.filter(p => isS(p) || p.type === 'both' || p.type === 'other');
  const borrowedLoans = (db.loans || []).filter(l => l.dir === 'taken');
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const curD = new Date();
  const curMonthText = `${monthNames[curD.getMonth()]} ${curD.getFullYear()}`;

  const bankMethods = [
    'Bank Transfer / NEFT / RTGS',
    'UPI',
    'Cheque',
    'Debit / Credit Card',
    'Other'
  ];

  form('Money Out (Record Payment)',
    `<div class="two">
      ${fld('date', 'Date *', 'date', today(), 1)}
      
      <div style="display:flex; flex-direction:column; gap:4px;">
        <label>Paid From Account *
          <select name="acct" id="txn_acct" required>
            ${accOpts(a => a.cash)}
          </select>
        </label>
        <div id="txn_cash_bal_hint" style="font-size:12px; color:var(--t2); padding-left:2px; display:none;"></div>
      </div>

      <label style="grid-column: 1 / -1;">Expense / Payment Category *
        <select name="cat" id="txn_cat" required>
          <option value="2000" selected>Supplier Payment (Accounts Payable)</option>
          <option value="5000">Purchases / Cost of Goods Sold</option>
          <option value="5100">Rent Expense (Operational)</option>
          <option value="5200">Transport Expense (Operational)</option>
          <option value="5400">Utilities (Operational)</option>
          <option value="5300">Salaries</option>
          <option value="5500">Interest Expense</option>
          <option value="5600">Miscellaneous Expense</option>
          <option value="3100">Drawings (Owner's Personal Withdrawal)</option>
        </select>
      </label>

      <!-- Insufficient Cash Warning Banner -->
      <div id="cash_insufficient_warn" style="grid-column: 1 / -1; display:none; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:10px 14px; font-size:12.5px; color:#991b1b;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:16px;">⚠️</span>
          <b id="cash_warn_text">Insufficient cash in hand balance. Please deposit funds or pay via Bank Account.</b>
        </div>
      </div>

      <!-- Section 1: Supplier Payment (cat === 2000) -->
      <div id="sec_supplier" style="grid-column: 1 / -1; display: flex; flex-direction: column; gap: 8px;">
        <label>Supplier / Payee (Mandatory) *
          <select name="supplier_id" id="txn_supplier_id">
            <option value="">-- Select Active Supplier --</option>
            ${suppliers.map(p => `<option value="${p.id}">${esc(p.name)}${p.phone ? ' (' + esc(p.phone) + ')' : ''}</option>`).join('')}
            <option value="__CUSTOM__">➕ Enter custom supplier name...</option>
          </select>
        </label>
        <div id="txn_custom_supplier_wrap" style="display:none">
          <label>Custom Supplier Name *
            <input type="text" name="custom_supplier" id="txn_custom_supplier" placeholder="Type supplier name...">
          </label>
        </div>
        <label>Pending Purchase Bill Reference
          <select name="bill_ref" id="txn_bill_ref">
            <option value="">-- Select a supplier above to load pending bills --</option>
          </select>
        </label>
        <div id="bill_due_hint" style="font-size:12px;color:var(--t2);margin-top:-2px;display:none;"></div>
      </div>

      <!-- Section 2: COGS Purchases (cat === 5000) -->
      <div id="sec_cogs" style="grid-column: 1 / -1; display: none; flex-direction: column; gap: 8px;">
        <div class="two">
          <label>Supplier / Payee (Optional / Walk-in)
            <select name="cogs_party" id="txn_cogs_party">
              <option value="">-- None / Walk-in --</option>
              ${suppliers.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
              <option value="__CUSTOM__">➕ Enter custom name...</option>
            </select>
          </label>
          <div id="txn_custom_cogs_wrap" style="display:none">
            <label>Custom Payee Name
              <input type="text" name="custom_cogs_party" id="txn_custom_cogs_party" placeholder="Type payee name...">
            </label>
          </div>
          <label>Item / Material Description
            <input type="text" name="item_desc" id="txn_item_desc" list="cogs_item_list" placeholder="e.g. Iron scrap, Steel scrap...">
            <datalist id="cogs_item_list">
              ${db.items.map(it => `<option value="${esc(it.n)}">`).join('')}
            </datalist>
          </label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <label>Quantity / Weight
              <input type="number" step="any" min="0" name="qty" id="txn_qty" placeholder="e.g. 100">
            </label>
            <label>Unit
              <select name="unit" id="txn_unit">
                <option value="kg" selected>kg</option>
                <option value="quintal">quintal</option>
                <option value="ton">ton</option>
                <option value="pcs">pcs</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <!-- Section 3: Operational Expenses (cat === 5100, 5200, 5400) -->
      <div id="sec_operational" style="grid-column: 1 / -1; display: none; flex-direction: column; gap: 8px;">
        <div class="two">
          <label>Amount before GST (₹) *
            <input type="number" step="any" min="0.01" name="base_amt" id="txn_base_amt" placeholder="0.00">
          </label>
          <label>GST % / Input Credit Selector *
            <select name="gst_rate" id="txn_gst_rate">
              <option value="0">0% (Exempt / Nil)</option>
              <option value="5">5%</option>
              <option value="12">12%</option>
              <option value="18" selected>18%</option>
              <option value="28">28%</option>
            </select>
          </label>
          <label style="grid-column: 1 / -1;">Payee / Service Provider Name (Optional)
            <input type="text" name="op_payee" id="txn_op_payee" placeholder="e.g. Landlord, Transport Agency, Power Utility...">
          </label>
        </div>
        <div id="op_calc_summary" style="background:#f1f5f9;border:1px solid var(--bd);border-radius:6px;padding:8px 12px;font-size:13px;display:flex;justify-content:space-between;align-items:center;">
          <span>Base: <b id="op_disp_base">₹0.00</b> + Input GST: <b id="op_disp_gst">₹0.00</b></span>
          <span style="font-size:14px;color:#842029;font-weight:700;">Total Paid: <span id="op_disp_tot">₹0.00</span></span>
        </div>
      </div>

      <!-- Section 4: Salaries (cat === 5300) -->
      <div id="sec_salaries" style="grid-column: 1 / -1; display: none; flex-direction: column; gap: 8px;">
        <div class="two">
          <label>Employee Name / Payee *
            <input type="text" name="emp_name" id="txn_emp_name" placeholder="e.g. Ramesh Kumar">
          </label>
          <label>Salary Month / Period *
            <input type="text" name="salary_period" id="txn_salary_period" placeholder="e.g. October 2026" value="${curMonthText}">
          </label>
        </div>
      </div>

      <!-- Section 5: Interest Expense (cat === 5500) -->
      <div id="sec_interest" style="grid-column: 1 / -1; display: none; flex-direction: column; gap: 8px;">
        <label>Loan Account Reference / Lender Dropdown *
          <select name="loan_id" id="txn_loan_id">
            <option value="">-- Select Borrowed Loan / Lender --</option>
            ${borrowedLoans.map(l => `<option value="${l.id}">${esc(l.ref || l.name)} (${esc(l.name)}) · Lender: ${esc(l.partyName || pn(l.party))}</option>`).join('')}
            ${suppliers.map(p => `<option value="party_${p.id}">Lender: ${esc(p.name)}</option>`).join('')}
            <option value="__CUSTOM__">➕ Other Lender...</option>
          </select>
        </label>
        <div id="txn_custom_loan_wrap" style="display:none">
          <label>Custom Lender Name
            <input type="text" name="custom_lender" id="txn_custom_lender" placeholder="Type lender name...">
          </label>
        </div>
      </div>

      <!-- Section 6: Miscellaneous Expense (cat === 5600) -->
      <div id="sec_misc" style="grid-column: 1 / -1; display: none; flex-direction: column; gap: 8px;">
        <label>Payee Name (Optional)
          <input type="text" name="misc_payee" id="txn_misc_payee" placeholder="e.g. Local shop, incidental service...">
        </label>
      </div>

      <!-- Standard Amount field (used by categories 2000, 5000, 5300, 5500, 5600, 3100) -->
      <div id="std_amt_wrap" style="grid-column: 1 / -1;">
        <label id="std_amt_label">Total Amount Paid (₹) *
          <input type="number" step="any" min="0.01" name="amt" id="txn_amt" placeholder="0.00">
        </label>
      </div>

      <!-- Payment Method Wrap -->
      <div id="txn_method_wrap">
        <label>Payment Method
          <select name="method" id="txn_method">
            ${bankMethods.map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </label>
      </div>

      <!-- Reference No. -->
      <div id="txn_ref_wrap">
        <label id="txn_ref_label">Reference No. (UTR / Cheque No. / Txn ID)
          <input type="text" name="ref" id="txn_ref" placeholder="e.g. UTR / Cheque / Txn ID">
        </label>
      </div>

      <!-- Description / Notes -->
      <label style="grid-column: 1 / -1;" id="txn_desc_label">Description / Notes
        <textarea name="desc" id="txn_desc" rows="2" placeholder="Itemized details, material type, quantity, or specific context..."></textarea>
      </label>

      <!-- Document Attachment / Camera Scan -->
      <div style="grid-column: 1 / -1;">
        ${renderAttachmentControl({ idPrefix: 'out_att', files: outAttachments, label: 'Payment Receipt / Voucher Attachment' })}
      </div>
    </div>`,
    v => {
      if (!v.date) throw Error('Date is required');
      if (!v.acct) throw Error('Please select an account');
      if (!v.cat) throw Error('Please select an expense category');

      const isCash = v.acct === '1000' || (acc(v.acct)?.name || '').toLowerCase().includes('cash');
      const finalMethod = isCash ? 'Cash' : (v.method || 'Bank Transfer / NEFT / RTGS');
      const userRef = (v.ref || '').trim();
      const userDesc = (v.desc || '').trim();
      const cat = v.cat;
      let postedEnt = null;

      // Validate Cash in Hand liquidity before posting outflow
      if (isCash) {
        let outflowPaisa = 0;
        if (['5100', '5200', '5400'].includes(cat)) {
          const bP = P(v.base_amt || '0');
          const gR = parseFloat(v.gst_rate || 0);
          outflowPaisa = bP + Math.round(bP * gR / 100);
        } else {
          outflowPaisa = P(v.amt || '0');
        }
        if (outflowPaisa > 0) {
          const check = checkCashLiquidity('1000', outflowPaisa);
          if (!check.ok) {
            throw Error(check.error || 'Insufficient cash in hand balance. Please deposit funds or pay via Bank Account.');
          }
        }
      }

      if (cat === '2000') {
        // 1. Supplier Payment (Accounts Payable)
        let supplierId = '';
        let supplierName = '';
        if (v.supplier_id === '__CUSTOM__') {
          const customName = (v.custom_supplier || '').trim();
          if (!customName) throw Error('Please enter the custom supplier name');
          const existing = db.parties.find(p => p.name.trim().toLowerCase() === customName.toLowerCase());
          if (existing) {
            supplierId = existing.id;
            supplierName = existing.name;
          } else {
            const newP = { id: uid(), name: customName, type: 'supplier', phone: '', gstin: '', state: db.biz.state || 'Odisha', terms: '0' };
            db.parties.push(newP);
            supplierId = newP.id;
            supplierName = newP.name;
          }
        } else if (v.supplier_id) {
          supplierId = v.supplier_id;
          supplierName = pn(supplierId);
        } else {
          throw Error('Supplier / Payee is mandatory for Supplier Payment');
        }

        const amtPaisa = P(v.amt);
        if (!amtPaisa || amtPaisa <= 0) throw Error('Amount paid must be above zero');

        const selectedBill = v.bill_ref ? db.docs.find(d => d.id === v.bill_ref) : null;
        const billNo = selectedBill ? (selectedBill.sno || selectedBill.no) : '';

        const narr = userDesc
          ? `${supplierName} - ${userDesc}`
          : (billNo ? `${supplierName} - Payment for Bill ${billNo}` : `${supplierName} - Supplier Payment`);

        const pJe = postedEnt = post({
          date: v.date,
          src: 'out',
          narr: narr,
          meta: {
            method: finalMethod,
            ref: userRef || billNo,
            docNo: billNo,
            billId: selectedBill ? selectedBill.id : '',
            acct: v.acct,
            cat: '2000',
            party: supplierId,
            partyName: supplierName,
            desc: userDesc
          },
          lines: [
            { a: '2000', d: amtPaisa, c: 0, p: supplierId },
            { a: v.acct, d: 0, c: amtPaisa, p: supplierId }
          ]
        });

        if (selectedBill) {
          if (!selectedBill.pays) selectedBill.pays = [];
          const curBal = Math.max(0, out(selectedBill));
          const appliedAmt = Math.min(amtPaisa, curBal);
          selectedBill.pays.push({
            je: pJe.id,
            amt: appliedAmt,
            date: v.date,
            method: finalMethod,
            acct: v.acct
          });
          selectedBill.paid = ((selectedBill.total || 0) - Math.max(0, curBal - appliedAmt)) / 100;
        }
      } else if (cat === '5000') {
        // 2. Purchases / Cost of Goods Sold
        const amtPaisa = P(v.amt);
        if (!amtPaisa || amtPaisa <= 0) throw Error('Amount must be above zero');

        let partyId = '';
        let partyName = '';
        if (v.cogs_party === '__CUSTOM__') {
          const customName = (v.custom_cogs_party || '').trim();
          if (customName) {
            const existing = db.parties.find(p => p.name.trim().toLowerCase() === customName.toLowerCase());
            if (existing) {
              partyId = existing.id;
              partyName = existing.name;
            } else {
              const newP = { id: uid(), name: customName, type: 'supplier', phone: '', gstin: '', state: db.biz.state || 'Odisha', terms: '0' };
              db.parties.push(newP);
              partyId = newP.id;
              partyName = newP.name;
            }
          }
        } else if (v.cogs_party) {
          partyId = v.cogs_party;
          partyName = pn(v.cogs_party);
        }

        const itemStr = (v.item_desc || '').trim();
        const qtyVal = parseFloat(v.qty || 0);
        const unitVal = v.unit || 'kg';
        const qtyDetail = qtyVal > 0 ? `${qtyVal} ${unitVal}` : '';
        const itemSummary = itemStr ? (qtyDetail ? `${itemStr} (${qtyDetail})` : itemStr) : '';

        const narr = userDesc
          ? (partyName ? `${partyName} - ${userDesc}` : userDesc)
          : (itemSummary ? (partyName ? `${partyName} - ${itemSummary}` : `Purchase: ${itemSummary}`) : (partyName ? `${partyName} - Direct Purchases / COGS` : 'Direct Purchases / COGS'));

        postedEnt = post({
          date: v.date,
          src: 'out',
          narr: narr,
          meta: {
            method: finalMethod,
            ref: userRef,
            acct: v.acct,
            cat: '5000',
            party: partyId,
            partyName: partyName,
            item: itemStr,
            qty: qtyVal,
            unit: unitVal,
            desc: userDesc
          },
          lines: [
            { a: '5000', d: amtPaisa, c: 0, p: partyId },
            { a: v.acct, d: 0, c: amtPaisa, p: partyId }
          ]
        });
      } else if (['5100', '5200', '5400'].includes(cat)) {
        // 3. Operational Expenses (Rent, Transport, Utilities)
        const basePaisa = P(v.base_amt);
        if (!basePaisa || basePaisa <= 0) throw Error('Amount before GST must be above zero');

        const gstRate = parseFloat(v.gst_rate || 0);
        const gstPaisa = Math.round(basePaisa * gstRate / 100);
        const totalPaisa = basePaisa + gstPaisa;
        const payeeName = (v.op_payee || '').trim();
        const catName = an(cat);

        const narr = userDesc
          ? (payeeName ? `${payeeName} - ${userDesc}` : userDesc)
          : (payeeName ? `${payeeName} - ${catName}` : catName);

        const lines = [
          { a: cat, d: basePaisa, c: 0 }
        ];
        if (gstPaisa > 0) {
          lines.push({ a: '1300', d: gstPaisa, c: 0 }); // Input GST Credit
        }
        lines.push({ a: v.acct, d: 0, c: totalPaisa });

        postedEnt = post({
          date: v.date,
          src: 'out',
          narr: narr,
          meta: {
            method: finalMethod,
            ref: userRef,
            acct: v.acct,
            cat: cat,
            base: basePaisa,
            gst: gstPaisa,
            gstRate: gstRate,
            payee: payeeName,
            partyName: payeeName,
            desc: userDesc
          },
          lines: lines
        });
      } else if (cat === '5300') {
        // 4. Salaries
        const empName = (v.emp_name || '').trim();
        if (!empName) throw Error('Employee Name is required for Salaries');
        const period = (v.salary_period || '').trim() || curMonthText;
        const amtPaisa = P(v.amt);
        if (!amtPaisa || amtPaisa <= 0) throw Error('Salary amount must be above zero');

        const narr = userDesc
          ? `${empName} - ${userDesc}`
          : `Salary payment to ${empName} (${period})`;

        postedEnt = post({
          date: v.date,
          src: 'out',
          narr: narr,
          meta: {
            method: finalMethod,
            ref: userRef,
            acct: v.acct,
            cat: '5300',
            employee: empName,
            partyName: empName,
            period: period,
            desc: userDesc
          },
          lines: [
            { a: '5300', d: amtPaisa, c: 0 },
            { a: v.acct, d: 0, c: amtPaisa }
          ]
        });
      } else if (cat === '5500') {
        // 5. Interest Expense
        const amtPaisa = P(v.amt);
        if (!amtPaisa || amtPaisa <= 0) throw Error('Interest amount must be above zero');

        let lenderName = '';
        let loanRef = '';
        let loanId = '';
        if (v.loan_id === '__CUSTOM__') {
          lenderName = (v.custom_lender || '').trim() || 'Lender';
        } else if (v.loan_id && v.loan_id.startsWith('party_')) {
          const pId = v.loan_id.replace('party_', '');
          lenderName = pn(pId);
        } else if (v.loan_id) {
          const ln = (db.loans || []).find(l => l.id === v.loan_id);
          if (ln) {
            loanId = ln.id;
            loanRef = ln.ref;
            lenderName = ln.partyName || pn(ln.party) || ln.name;
          }
        }

        const narr = userDesc
          ? (lenderName ? `${lenderName} - ${userDesc}` : userDesc)
          : (lenderName ? `Interest payment to ${lenderName}` : 'Interest Expense');

        postedEnt = post({
          date: v.date,
          src: 'out',
          narr: narr,
          meta: {
            method: finalMethod,
            ref: userRef || loanRef,
            acct: v.acct,
            cat: '5500',
            loanId: loanId,
            payee: lenderName,
            partyName: lenderName,
            desc: userDesc
          },
          lines: [
            { a: '5500', d: amtPaisa, c: 0 },
            { a: v.acct, d: 0, c: amtPaisa }
          ]
        });
      } else if (cat === '5600') {
        // 6. Miscellaneous Expense
        const amtPaisa = P(v.amt);
        if (!amtPaisa || amtPaisa <= 0) throw Error('Amount must be above zero');
        const payee = (v.misc_payee || '').trim();
        const narr = userDesc
          ? (payee ? `${payee} - ${userDesc}` : userDesc)
          : (payee ? `${payee} - Miscellaneous Expense` : 'Miscellaneous Expense');

        postedEnt = post({
          date: v.date,
          src: 'out',
          narr: narr,
          meta: {
            method: finalMethod,
            ref: userRef,
            acct: v.acct,
            cat: '5600',
            payee: payee,
            partyName: payee,
            desc: userDesc
          },
          lines: [
            { a: '5600', d: amtPaisa, c: 0 },
            { a: v.acct, d: 0, c: amtPaisa }
          ]
        });
      } else if (cat === '3100') {
        // 7. Drawings
        const amtPaisa = P(v.amt);
        if (!amtPaisa || amtPaisa <= 0) throw Error('Withdrawal amount must be above zero');
        const narr = userDesc ? `Owner's Drawings - ${userDesc}` : `Owner's Drawings (${finalMethod})`;

        postedEnt = post({
          date: v.date,
          src: 'out',
          narr: narr,
          meta: {
            method: finalMethod,
            ref: userRef,
            acct: v.acct,
            cat: '3100',
            partyName: db.biz.owner || "Owner's Drawings",
            desc: userDesc || "Owner's personal drawings"
          },
          lines: [
            { a: '3100', d: amtPaisa, c: 0 },
            { a: v.acct, d: 0, c: amtPaisa }
          ]
        });
      }

      if (outAttachments.length && postedEnt && postedEnt.id) {
        saveAttachments(postedEnt.id, outAttachments);
      }
    },
    'Save Transaction',
    () => {
      bindAttachmentEvents({
        idPrefix: 'out_att',
        getFiles: () => outAttachments,
        setFiles: f => { outAttachments = f; }
      });

      const acctEl = $('#txn_acct');
      const catEl = $('#txn_cat');
      const methWrap = $('#txn_method_wrap');
      const methSel = $('#txn_method');

      // Sections
      const secSupplier = $('#sec_supplier');
      const secCogs = $('#sec_cogs');
      const secOperational = $('#sec_operational');
      const secSalaries = $('#sec_salaries');
      const secInterest = $('#sec_interest');
      const secMisc = $('#sec_misc');
      const stdAmtWrap = $('#std_amt_wrap');
      const stdAmtLabel = $('#std_amt_label');
      const amtInput = $('#txn_amt');
      const refLabel = $('#txn_ref_label');
      const descLabel = $('#txn_desc_label');
      const refInput = $('#txn_ref');
      const descInput = $('#txn_desc');

      // Supplier fields
      const supplierSel = $('#txn_supplier_id');
      const customSupWrap = $('#txn_custom_supplier_wrap');
      const customSupInput = $('#txn_custom_supplier');
      const billRefSel = $('#txn_bill_ref');
      const billDueHint = $('#bill_due_hint');

      // COGS fields
      const cogsPartySel = $('#txn_cogs_party');
      const customCogsWrap = $('#txn_custom_cogs_wrap');
      const customCogsInput = $('#txn_custom_cogs_party');

      // Operational fields
      const baseAmtInput = $('#txn_base_amt');
      const gstRateSel = $('#txn_gst_rate');
      const dispBase = $('#op_disp_base');
      const dispGst = $('#op_disp_gst');
      const dispTot = $('#op_disp_tot');

      // Interest fields
      const loanSel = $('#txn_loan_id');
      const customLoanWrap = $('#txn_custom_loan_wrap');
      const customLoanInput = $('#txn_custom_lender');

      const cashHintEl = $('#txn_cash_bal_hint');
      const cashWarnEl = $('#cash_insufficient_warn');
      const cashWarnText = $('#cash_warn_text');

      function checkLiquidityWarn() {
        if (!acctEl) return;
        const code = acctEl.value;
        const isCash = code === '1000' || (acc(code)?.name || '').toLowerCase().includes('cash');
        const bal = net(code);
        const sb = $('#sb') || document.querySelector('#f button[type="submit"]') || document.querySelector('#f button.p');

        if (cashHintEl) {
          cashHintEl.style.display = 'block';
          cashHintEl.innerHTML = `Available ${isCash ? 'Cash in Hand' : (acc(code)?.name || 'Account')}: <b style="color:${bal <= 0 ? '#dc2626' : '#0f5132'}">${fmt(bal)}</b>`;
        }

        let needed = 0;
        const curCat = catEl ? catEl.value : '';
        if (['5100', '5200', '5400'].includes(curCat)) {
          let b = 0;
          try { b = P(baseAmtInput?.value || '0'); } catch (e) {}
          const r = parseFloat(gstRateSel?.value || 0);
          needed = b + Math.round(b * r / 100);
        } else {
          try { needed = P(amtInput?.value || '0'); } catch (e) {}
        }

        if (needed > 0 && needed > bal) {
          if (cashWarnEl) cashWarnEl.style.display = 'block';
          if (cashWarnText) {
            cashWarnText.textContent = isCash
              ? 'Insufficient balance in Cash in Hand. Please deposit funds or transfer from bank first.'
              : `Insufficient balance in ${acc(code)?.name || 'Bank Account'} (Available: ${fmt(Math.max(0, bal))}, Required: ${fmt(needed)}).`;
          }
          if (sb) {
            sb.disabled = true;
            sb.style.opacity = '0.55';
            sb.style.cursor = 'not-allowed';
            sb.title = isCash ? 'Insufficient balance in Cash in Hand' : 'Insufficient balance in account';
          }
        } else {
          if (cashWarnEl) cashWarnEl.style.display = 'none';
          if (sb) {
            sb.disabled = false;
            sb.style.opacity = '1';
            sb.style.cursor = 'pointer';
            sb.title = '';
          }
        }
      }

      function syncAcctMethod() {
        if (!acctEl || !methWrap || !methSel) return;
        const code = acctEl.value;
        const isCash = code === '1000' || (acc(code)?.name || '').toLowerCase().includes('cash');
        if (isCash) {
          methWrap.style.display = 'none';
          methSel.innerHTML = '<option value="Cash" selected>Cash</option>';
        } else {
          methWrap.style.display = '';
          const cur = methSel.value && methSel.value !== 'Cash' ? methSel.value : 'Bank Transfer / NEFT / RTGS';
          methSel.innerHTML = bankMethods.map(m => `<option value="${m}"${m === cur ? ' selected' : ''}>${m}</option>`).join('');
        }
        checkLiquidityWarn();
      }

      function updateBillOptions() {
        if (!supplierSel || !billRefSel) return;
        const supId = supplierSel.value;
        if (!supId || supId === '__CUSTOM__') {
          billRefSel.innerHTML = '<option value="">-- ' + (supId === '__CUSTOM__' ? 'Custom supplier (On-Account Advance)' : 'Select a supplier above to load pending bills') + ' --</option>';
          if (billDueHint) billDueHint.style.display = 'none';
          return;
        }

        const openBills = db.docs.filter(d => d.type === 'bill' && !d.cancelled && d.party === supId && out(d) > 0);
        if (openBills.length > 0) {
          billRefSel.innerHTML = '<option value="">-- Select Pending Bill to Settle (Optional) --</option>' +
            openBills.map(b => {
              const due = (out(b) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
              const billNo = b.sno || b.no;
              const mat = b.mat || (b.lines && b.lines[0]?.n) || 'Goods';
              return `<option value="${b.id}" data-due="${(out(b) / 100).toFixed(2)}" data-no="${esc(billNo)}" data-mat="${esc(mat)}">Bill #${esc(billNo)} (${b.date}) — Due: ₹${due} [${esc(mat)}]</option>`;
            }).join('');
        } else {
          billRefSel.innerHTML = '<option value="">-- No pending unpaid bills (On-Account Payment) --</option>';
          if (billDueHint) billDueHint.style.display = 'none';
        }
      }

      function calcOperationalGst() {
        if (!baseAmtInput || !gstRateSel || !dispBase || !dispGst || !dispTot) return;
        let b = 0;
        try { b = P(baseAmtInput.value || '0'); } catch (e) {}
        const r = parseFloat(gstRateSel.value || 0);
        const g = Math.round(b * r / 100);
        const tot = b + g;
        dispBase.textContent = fmt(b);
        dispGst.textContent = fmt(g);
        dispTot.textContent = fmt(tot);
        checkLiquidityWarn();
      }

      function switchCategory() {
        const cat = catEl.value;

        // Hide all dynamic sections first
        if (secSupplier) secSupplier.style.display = 'none';
        if (secCogs) secCogs.style.display = 'none';
        if (secOperational) secOperational.style.display = 'none';
        if (secSalaries) secSalaries.style.display = 'none';
        if (secInterest) secInterest.style.display = 'none';
        if (secMisc) secMisc.style.display = 'none';
        if (stdAmtWrap) stdAmtWrap.style.display = '';

        if (cat === '2000') {
          // 1. Supplier Payment
          if (secSupplier) secSupplier.style.display = 'flex';
          if (stdAmtLabel && stdAmtLabel.childNodes[0]) stdAmtLabel.childNodes[0].textContent = 'Total Amount Paid (₹) * ';
          if (refLabel && refLabel.childNodes[0]) refLabel.childNodes[0].textContent = 'Reference No. (UTR / Cheque No. / Txn ID) ';
          if (descLabel && descLabel.childNodes[0]) descLabel.childNodes[0].textContent = 'Description / Notes ';
          updateBillOptions();
        } else if (cat === '5000') {
          // 2. Purchases / COGS
          if (secCogs) secCogs.style.display = 'flex';
          if (stdAmtLabel && stdAmtLabel.childNodes[0]) stdAmtLabel.childNodes[0].textContent = 'Total Amount (₹) * ';
          if (refLabel && refLabel.childNodes[0]) refLabel.childNodes[0].textContent = 'Reference No. (Bill / Invoice No.) ';
          if (descLabel && descLabel.childNodes[0]) descLabel.childNodes[0].textContent = 'Description / Notes ';
        } else if (['5100', '5200', '5400'].includes(cat)) {
          // 3. Operational Expenses
          if (secOperational) secOperational.style.display = 'flex';
          if (stdAmtWrap) stdAmtWrap.style.display = 'none';
          if (refLabel && refLabel.childNodes[0]) refLabel.childNodes[0].textContent = 'Bill / Service Reference No. ';
          if (descLabel && descLabel.childNodes[0]) descLabel.childNodes[0].textContent = 'Description / Notes ';
          calcOperationalGst();
        } else if (cat === '5300') {
          // 4. Salaries
          if (secSalaries) secSalaries.style.display = 'flex';
          if (stdAmtLabel && stdAmtLabel.childNodes[0]) stdAmtLabel.childNodes[0].textContent = 'Total Salary Amount (₹) * ';
          if (refLabel && refLabel.childNodes[0]) refLabel.childNodes[0].textContent = 'Reference No. (Bank Transfer / Cheque No.) ';
          if (descLabel && descLabel.childNodes[0]) descLabel.childNodes[0].textContent = 'Description / Notes ';
        } else if (cat === '5500') {
          // 5. Interest Expense
          if (secInterest) secInterest.style.display = 'flex';
          if (stdAmtLabel && stdAmtLabel.childNodes[0]) stdAmtLabel.childNodes[0].textContent = 'Interest Amount (₹) * ';
          if (refLabel && refLabel.childNodes[0]) refLabel.childNodes[0].textContent = 'Reference No. (Txn ID / UTR) ';
          if (descLabel && descLabel.childNodes[0]) descLabel.childNodes[0].textContent = 'Description / Notes ';
        } else if (cat === '5600') {
          // 6. Miscellaneous Expense
          if (secMisc) secMisc.style.display = 'flex';
          if (stdAmtLabel && stdAmtLabel.childNodes[0]) stdAmtLabel.childNodes[0].textContent = 'Amount (₹) * ';
          if (refLabel && refLabel.childNodes[0]) refLabel.childNodes[0].textContent = 'Reference No. ';
          if (descLabel && descLabel.childNodes[0]) descLabel.childNodes[0].textContent = 'Description / Notes ';
        } else if (cat === '3100') {
          // 7. Drawings
          if (stdAmtLabel && stdAmtLabel.childNodes[0]) stdAmtLabel.childNodes[0].textContent = 'Amount Withdrawn (₹) * ';
          if (refLabel && refLabel.childNodes[0]) refLabel.childNodes[0].textContent = 'Reference No. / Voucher No. ';
          if (descLabel && descLabel.childNodes[0]) descLabel.childNodes[0].textContent = 'Description / Reason ';
        }
        checkLiquidityWarn();
      }

      if (acctEl) acctEl.onchange = syncAcctMethod;
      syncAcctMethod();

      if (catEl) catEl.onchange = switchCategory;
      switchCategory();

      if (supplierSel) {
        supplierSel.onchange = () => {
          if (supplierSel.value === '__CUSTOM__') {
            if (customSupWrap) customSupWrap.style.display = '';
            if (customSupInput) customSupInput.focus();
          } else {
            if (customSupWrap) customSupWrap.style.display = 'none';
            if (customSupInput) customSupInput.value = '';
          }
          updateBillOptions();
        };
      }

      if (billRefSel) {
        billRefSel.onchange = () => {
          const opt = billRefSel.options[billRefSel.selectedIndex];
          if (opt && opt.dataset.due) {
            if (amtInput) amtInput.value = opt.dataset.due;
            if (refInput && !refInput.value) refInput.value = opt.dataset.no || '';
            if (descInput) descInput.value = `Payment for Bill ${opt.dataset.no || ''}${opt.dataset.mat ? ' (' + opt.dataset.mat + ')' : ''}`;
            if (billDueHint) {
              billDueHint.style.display = '';
              billDueHint.innerHTML = `<span style="color:#0f5132;font-weight:600;">Selected Bill Due: ₹${parseFloat(opt.dataset.due).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>`;
            }
          } else {
            if (billDueHint) billDueHint.style.display = 'none';
          }
          checkLiquidityWarn();
        };
      }

      if (cogsPartySel) {
        cogsPartySel.onchange = () => {
          if (cogsPartySel.value === '__CUSTOM__') {
            if (customCogsWrap) customCogsWrap.style.display = '';
            if (customCogsInput) customCogsInput.focus();
          } else {
            if (customCogsWrap) customCogsWrap.style.display = 'none';
            if (customCogsInput) customCogsInput.value = '';
          }
        };
      }

      if (loanSel) {
        loanSel.onchange = () => {
          if (loanSel.value === '__CUSTOM__') {
            if (customLoanWrap) customLoanWrap.style.display = '';
            if (customLoanInput) customLoanInput.focus();
          } else {
            if (customLoanWrap) customLoanWrap.style.display = 'none';
            if (customLoanInput) customLoanInput.value = '';
          }
        };
      }

      if (amtInput) {
        amtInput.oninput = checkLiquidityWarn;
      }
      if (baseAmtInput) {
        baseAmtInput.oninput = calcOperationalGst;
      }
      if (gstRateSel) {
        gstRateSel.onchange = calcOperationalGst;
      }
    }
  );
}

export function txnForm(kind) {
  if (kind === 'out') {
    return moneyOutForm();
  }
  return moneyInForm();
}

export function newExpForm() {
  return moneyOutForm();
}

export function newTransferForm() {
  const cashAccounts = db.accounts.filter(a => a.cash);
  const defaultFrom = '1000'; // Cash in Hand
  const defaultTo = cashAccounts.find(a => a.code !== defaultFrom)?.code || '1010'; // Bank Account

  const svgIcons = {
    bank: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-building-bank"><path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M4 10v11"/><path d="M20 10v11"/><path d="M8 14v4"/><path d="M12 14v4"/><path d="M16 14v4"/></svg>`,
    wallet: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wallet"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>`,
    transfer: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right-left"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>`,
    warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-circle"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
  };

  form('Transfer Money (Contra Voucher)',
    `<div class="xfer-form">
      <div class="xfer-form-grid">
        <!-- Date Field -->
        <div class="xfer-field">
          <label class="xfer-label" for="xfer_date">
            Date <span class="xfer-req">*</span>
          </label>
          <div class="xfer-input-wrap">
            <span class="xfer-input-prefix-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </span>
            <input type="date" name="date" id="xfer_date" class="xfer-input with-prefix-icon" value="${today()}" required>
          </div>
        </div>

        <!-- Transfer Amount Field -->
        <div class="xfer-field">
          <label class="xfer-label" for="xfer_amt">
            Transfer Amount (₹) <span class="xfer-req">*</span>
          </label>
          <div class="xfer-input-wrap">
            <span class="xfer-input-prefix-currency" aria-hidden="true">₹</span>
            <input type="number" name="amt" id="xfer_amt" class="xfer-input with-prefix-currency" min="0.01" step="any" placeholder="0.00" required>
          </div>
        </div>

        <!-- From Account Dropdown -->
        <div class="xfer-field">
          <label class="xfer-label" for="xfer_from">
            From Account (Source / Credit) <span class="xfer-req">*</span>
          </label>
          <div class="xfer-select-wrap">
            <select name="from" id="xfer_from" class="xfer-select" required>
              ${cashAccounts.map(a => `<option value="${a.code}"${a.code === defaultFrom ? ' selected' : ''}>${esc(a.name)} (${a.code})</option>`).join('')}
            </select>
            <span class="xfer-select-chevron" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </span>
          </div>
          <div id="xfer_from_bal" class="xfer-balance-hint">
            Available Balance: <b>₹0.00</b>
          </div>
        </div>

        <!-- To Account Dropdown -->
        <div class="xfer-field">
          <label class="xfer-label" for="xfer_to">
            To Account (Destination / Debit) <span class="xfer-req">*</span>
          </label>
          <div class="xfer-select-wrap">
            <select name="to" id="xfer_to" class="xfer-select" required>
              ${cashAccounts.map(a => `<option value="${a.code}"${a.code === defaultTo ? ' selected' : ''}>${esc(a.name)} (${a.code})</option>`).join('')}
            </select>
            <span class="xfer-select-chevron" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </span>
          </div>
          <div id="xfer_to_bal" class="xfer-balance-hint">
            Current Balance: <b>₹0.00</b>
          </div>
        </div>

        <!-- Auto-Detected Transfer Scenario Card -->
        <div id="xfer_type_banner" class="xfer-scenario-banner xfer-scenario-deposit">
          <div class="xfer-scenario-left">
            <div id="xfer_type_icon" class="xfer-scenario-icon xfer-scenario-deposit">
              ${svgIcons.bank}
            </div>
            <div class="xfer-scenario-text">
              <b id="xfer_type_title" class="xfer-scenario-title">Scenario A: Cash Deposit (Cash → Bank)</b>
              <div id="xfer_type_desc" class="xfer-scenario-desc">Depositing cash from counter/drawer into bank account</div>
            </div>
          </div>
          <span id="xfer_type_tag" class="xfer-scenario-pill xfer-scenario-deposit">Deposit</span>
        </div>

        <!-- Live Balance Warning if Amount > Available Balance -->
        <div id="xfer_bal_warning" class="xfer-bal-warning" style="display:none;">
          <div class="xfer-warning-header">
            <span class="xfer-warning-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </span>
            <b id="xfer_warning_text">Amount exceeds available balance.</b>
          </div>
          <label class="xfer-overdraft-label">
            <input type="checkbox" name="allow_overdraft" id="xfer_allow_overdraft" value="1" class="xfer-checkbox">
            <span>Allow negative balance / overdraft transfer</span>
          </label>
        </div>

        <!-- Reference No Field -->
        <div class="xfer-field full-width">
          <label class="xfer-label" for="xfer_ref">
            Reference No. (UTR / Cheque / Txn ID)
          </label>
          <div class="xfer-input-wrap">
            <span class="xfer-input-prefix-icon" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="4" x2="20" y1="9" y2="9"/>
                <line x1="4" x2="20" y1="15" y2="15"/>
                <line x1="10" x2="8" y1="3" y2="21"/>
                <line x1="16" x2="14" y1="3" y2="21"/>
              </svg>
            </span>
            <input type="text" name="ref" id="xfer_ref" class="xfer-input with-prefix-icon" placeholder="e.g. UTR / Cheque / ATM ID">
          </div>
        </div>

        <!-- Notes / Narration Field -->
        <div class="xfer-field full-width">
          <label class="xfer-label" for="xfer_desc">
            <span class="xfer-label-inner">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="xfer-label-icon">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" x2="8" y1="13" y2="13"/>
                <line x1="16" x2="8" y1="17" y2="17"/>
                <line x1="10" x2="8" y1="9" y2="9"/>
              </svg>
              Notes / Narration
            </span>
          </label>
          <textarea name="desc" id="xfer_desc" class="xfer-textarea" rows="2" placeholder="Optional notes (e.g. Counter cash deposit to SBI, ATM withdrawal for petty cash)..."></textarea>
        </div>
      </div>
    </div>`,
    v => {
      const a = P(v.amt);
      if (!a || a <= 0) throw Error('Transfer amount must be above zero');
      if (!v.date) throw Error('Date is required');
      if (!v.from || !v.to) throw Error('Please select both From and To accounts');

      // Rule 1: Prevent self-transfer
      if (v.from === v.to) {
        throw Error(`Cannot transfer to the same account (${an(v.from)}). "From" and "To" accounts must be different.`);
      }

      // Scenario detection
      const fromAcc = acc(v.from);
      const toAcc = acc(v.to);
      const isFromCash = v.from === '1000' || (fromAcc?.name || '').toLowerCase().includes('cash');
      const isToCash = v.to === '1000' || (toAcc?.name || '').toLowerCase().includes('cash');

      // Rule 2: Balance check
      const fromBal = net(v.from);
      if (isFromCash && a > fromBal) {
        throw Error(`Insufficient cash in hand balance. Available: ${fmt(Math.max(0, fromBal))}. Please deposit funds or pay via Bank Account.`);
      }
      if (a > fromBal && !v.allow_overdraft) {
        throw Error(`Insufficient funds: ${an(v.from)} has only ${fmt(fromBal)} available. Check "Allow negative balance / overdraft transfer" if this is an overdraft.`);
      }

      let transferType = 'Bank-to-Bank Transfer';
      if (isFromCash && !isToCash) {
        transferType = 'Cash Deposit (Cash to Bank)';
      } else if (!isFromCash && isToCash) {
        transferType = 'Cash Withdrawal (Bank to Cash)';
      } else if (isFromCash && isToCash) {
        transferType = 'Cash-to-Cash Transfer';
      }

      const userNotes = (v.desc || '').trim();
      const narr = userNotes || `${transferType} - ${fromAcc?.name || v.from} to ${toAcc?.name || v.to}`;

      post({
        date: v.date,
        src: 'xfer',
        narr: narr,
        meta: {
          ref: (v.ref || '').trim(),
          from: v.from,
          to: v.to,
          transferType: transferType,
          desc: userNotes
        },
        lines: [
          { a: v.to, d: a, c: 0 },   // Debit: Destination Account (Increases balance)
          { a: v.from, d: 0, c: a }  // Credit: Source Account (Decreases balance)
        ]
      });
    },
    'Confirm Transfer',
    () => {
      const dlg = $('#dlg');
      if (dlg) {
        dlg.classList.add('xfer-dialog');
        const cleanup = () => {
          dlg.classList.remove('xfer-dialog');
          dlg.removeEventListener('close', cleanup);
        };
        dlg.addEventListener('close', cleanup, { once: true });
      }

      const fromSel = $('#xfer_from');
      const toSel = $('#xfer_to');
      const amtInput = $('#xfer_amt');
      const fromBalEl = $('#xfer_from_bal');
      const toBalEl = $('#xfer_to_bal');
      const typeBanner = $('#xfer_type_banner');
      const typeTitle = $('#xfer_type_title');
      const typeDesc = $('#xfer_type_desc');
      const typeIcon = $('#xfer_type_icon');
      const typeTag = $('#xfer_type_tag');
      const balWarning = $('#xfer_bal_warning');
      const warningText = $('#xfer_warning_text');

      function setScenario(theme, iconSvg, title, desc, tagText) {
        if (typeBanner) {
          typeBanner.className = `xfer-scenario-banner xfer-scenario-${theme}`;
        }
        if (typeIcon) {
          typeIcon.className = `xfer-scenario-icon xfer-scenario-${theme}`;
          typeIcon.innerHTML = iconSvg;
        }
        if (typeTitle) {
          typeTitle.textContent = title;
        }
        if (typeDesc) {
          typeDesc.textContent = desc;
        }
        if (typeTag) {
          typeTag.className = `xfer-scenario-pill xfer-scenario-${theme}`;
          typeTag.textContent = tagText;
        }
      }

      function updateTransferState() {
        if (!fromSel || !toSel) return;
        const fromCode = fromSel.value;
        const toCode = toSel.value;

        // Update balances
        const fromBal = net(fromCode);
        const toBal = net(toCode);
        if (fromBalEl) {
          const isNeg = fromBal < 0;
          fromBalEl.innerHTML = `Available Balance: <b style="color:${isNeg ? '#dc2626' : '#059669'}">${fmt(fromBal)}</b>`;
        }
        if (toBalEl) {
          const isNeg = toBal < 0;
          toBalEl.innerHTML = `Current Balance: <b style="color:${isNeg ? '#dc2626' : '#059669'}">${fmt(toBal)}</b>`;
        }

        // Self-transfer check
        if (fromCode === toCode) {
          setScenario(
            'invalid',
            svgIcons.warning,
            'Invalid: Same Account Selected',
            'Please choose two different accounts for From and To.',
            'Invalid'
          );
          if (balWarning) balWarning.style.display = 'none';
          const sb = $('#sb') || document.querySelector('#f button[type="submit"]') || document.querySelector('#f button.p');
          if (sb) {
            sb.disabled = true;
            sb.title = 'Cannot transfer to the same account';
          }
          return;
        }

        // Scenarios
        const fromAcc = acc(fromCode);
        const toAcc = acc(toCode);
        const isFromCash = fromCode === '1000' || (fromAcc?.name || '').toLowerCase().includes('cash');
        const isToCash = toCode === '1000' || (toAcc?.name || '').toLowerCase().includes('cash');

        if (isFromCash && !isToCash) {
          // Scenario A: Cash Deposit (Cash to Bank)
          setScenario(
            'deposit',
            svgIcons.bank,
            'Scenario A: Cash Deposit (Cash → Bank)',
            'Depositing cash from counter/drawer into bank account',
            'Deposit'
          );
        } else if (!isFromCash && isToCash) {
          // Scenario B: Cash Withdrawal (Bank to Cash)
          setScenario(
            'withdrawal',
            svgIcons.wallet,
            'Scenario B: Cash Withdrawal (Bank → Cash)',
            'Withdrawing cash from ATM/bank for office petty cash',
            'Withdrawal'
          );
        } else {
          // Scenario C: Bank-to-Bank Transfer
          setScenario(
            'transfer',
            svgIcons.transfer,
            'Scenario C: Bank-to-Bank Transfer',
            'Moving funds internally between company bank accounts',
            'Bank Transfer'
          );
        }

        // Balance check warning & button disabling
        let enterAmt = 0;
        try { enterAmt = P(amtInput?.value || '0'); } catch (e) {}
        const overdraftLabel = $('#xfer_allow_overdraft')?.parentElement;
        const allowOverdraft = $('#xfer_allow_overdraft')?.checked;
        const sb = $('#sb') || document.querySelector('#f button[type="submit"]') || document.querySelector('#f button.p');

        if (enterAmt > 0 && enterAmt > fromBal) {
          if (balWarning) balWarning.style.display = 'block';
          if (isFromCash) {
            if (warningText) {
              warningText.textContent = 'Insufficient balance in Cash in Hand. Please deposit funds or transfer from bank first.';
            }
            if (overdraftLabel) overdraftLabel.style.display = 'none';
            if (sb) {
              sb.disabled = true;
              sb.title = 'Insufficient balance in Cash in Hand';
            }
          } else {
            if (warningText) {
              warningText.textContent = `Transfer amount (${fmt(enterAmt)}) exceeds ${fromAcc?.name || 'source account'} balance (${fmt(fromBal)}).`;
            }
            if (overdraftLabel) overdraftLabel.style.display = 'flex';
            if (!allowOverdraft) {
              if (sb) {
                sb.disabled = true;
                sb.title = 'Transfer amount exceeds available bank balance';
              }
            } else {
              if (sb) {
                sb.disabled = false;
                sb.title = '';
              }
            }
          }
        } else {
          if (balWarning) balWarning.style.display = 'none';
          if (sb) {
            const isValid = enterAmt > 0 && fromCode !== toCode;
            sb.disabled = !isValid;
            sb.title = isValid ? '' : (enterAmt <= 0 ? 'Enter transfer amount' : 'Invalid accounts');
          }
        }
      }

      if (fromSel) {
        fromSel.onchange = updateTransferState;
        fromSel.oninput = updateTransferState;
      }
      if (toSel) {
        toSel.onchange = updateTransferState;
        toSel.oninput = updateTransferState;
      }
      if (amtInput) {
        amtInput.oninput = updateTransferState;
        amtInput.onchange = updateTransferState;
      }
      const odEl = $('#xfer_allow_overdraft');
      if (odEl) odEl.onchange = updateTransferState;
      updateTransferState();
    }
  );
}

export function showLoan2(id) {
  window.location.hash = '#/loans/' + id;
}

export function loanForm2() {
  const partyOptions = db.parties.map(p => `<option value="${p.id}">${esc(p.name)} (${p.type || 'Party'})</option>`).join('');

  form('Register loan',
    `<div class="two">
      <label>Direction *
        <select name="dir" id="ln_dir">
          <option value="taken">Borrowed (We owe)</option>
          <option value="given">Lent (Given to others)</option>
        </select>
      </label>
      <label>Lender / Borrower (Party) *
        <select name="party" id="ln_party" required>
          <option value="">-- Choose Party or Enter Custom --</option>
          ${partyOptions}
          <option value="__CUSTOM__">➕ + Enter custom party name...</option>
        </select>
      </label>
    </div>
    <div id="ln_custom_wrap" style="display:none;margin-top:8px;">
      <label>Custom Party Name *
        <input type="text" name="customParty" id="ln_custom_party" placeholder="e.g. HDFC Bank or Ramesh Sharma">
      </label>
    </div>
    <div class="two" style="margin-top:10px;">
      <label>Loan Name / Reference
        <input type="text" name="name" id="ln_name" placeholder="e.g. HDFC Equipment Loan, Personal Loan to Ramesh">
      </label>
      <label>Start Date *
        <input type="date" name="date" value="${today()}" required>
      </label>
      <label>Principal Amount (₹) *
        <input type="number" step="any" min="0.01" name="amt" required placeholder="0.00">
      </label>
      <label>Disbursement Account *
        <select name="acct">${accOpts(a => a.cash)}</select>
      </label>
      <label>Interest Rate (% p.a.)
        <input type="number" step="any" min="0" name="rate" value="0" placeholder="0">
      </label>
      <label>Installment / EMI Amount (₹)
        <input type="number" step="any" min="0" name="emi" placeholder="Optional scheduled payment">
      </label>
      <label>First Due Date
        <input type="date" name="due">
      </label>
    </div>
    <label style="margin-top:10px;">Notes / Agreement Ref
      <textarea name="notes" rows="2" placeholder="Agreement / Reference ID or loan terms"></textarea>
    </label>`,
    v => {
      let partyId = v.party;
      let partyName = '';

      if (partyId === '__CUSTOM__') {
        const cName = (v.customParty || '').trim();
        if (!cName) throw Error('Please enter the custom lender/borrower name');
        let existing = db.parties.find(p => p.name.trim().toLowerCase() === cName.toLowerCase());
        if (!existing) {
          existing = {
            id: uid(),
            name: cName,
            type: v.dir === 'taken' ? 'supplier' : 'customer',
            terms: '0'
          };
          db.parties.push(existing);
        }
        partyId = existing.id;
        partyName = existing.name;
      } else {
        if (!partyId) throw Error('Please select or enter a lender/borrower');
        const p = db.parties.find(x => x.id === partyId);
        partyName = p ? p.name : '';
      }

      const a = P(v.amt);
      if (!a || a <= 0) throw Error('Principal amount must be greater than zero');
      if (!v.date) throw Error('Start date is required');

      const t = v.dir === 'taken';
      const isCash = v.acct === '1000' || (acc(v.acct)?.name || '').toLowerCase().includes('cash');
      if (!t && isCash) {
        const check = checkCashLiquidity('1000', a);
        if (!check.ok) {
          throw Error(check.error || 'Insufficient cash in hand balance. Please deposit funds or pay via Bank Account.');
        }
      }

      const ref = next('loan', 'LN-');
      const id = uid();
      const loanName = (v.name || '').trim() || `${partyName} ${t ? 'Borrowing' : 'Loan'} (${ref})`;

      post({
        date: v.date,
        src: 'loan',
        narr: `${loanName} - Principal ${t ? 'borrowed from' : 'lent to'} ${partyName}`,
        meta: {
          loan: id,
          kind: 'disb',
          pr: a,
          int: 0,
          acct: v.acct,
          party: partyId,
          partyName,
          ref,
          docNo: ref,
          loanName,
          method: (acc(v.acct)?.name || '').toLowerCase().includes('cash') ? 'Cash' : 'Bank Transfer',
          desc: `${loanName} - Initial principal disbursement (${fmt(a)})`
        },
        lines: t
          ? [{ a: v.acct, d: a, c: 0, p: partyId }, { a: '2100', d: 0, c: a, p: partyId }]
          : [{ a: '1400', d: a, c: 0, p: partyId }, { a: v.acct, d: 0, c: a, p: partyId }]
      });

      db.loans.push({
        id,
        ref,
        name: loanName,
        dir: v.dir,
        party: partyId,
        partyName,
        principal: a,
        repaid: 0,
        rate: parseFloat(v.rate || 0),
        date: v.date,
        due: v.due || '',
        emi: v.emi ? P(v.emi) : 0,
        acct: v.acct,
        notes: (v.notes || '').trim(),
        last: v.date,
        hist: []
      });
      log('register loan', ref);
      toast('Loan registered successfully');
    },
    'Register Loan',
    () => {
      const pSel = $('#ln_party');
      const cWrap = $('#ln_custom_wrap');
      const cInput = $('#ln_custom_party');
      const nameInput = $('#ln_name');
      const dirSel = $('#ln_dir');

      if (pSel && cWrap) {
        pSel.onchange = () => {
          if (pSel.value === '__CUSTOM__') {
            cWrap.style.display = 'block';
            if (cInput) cInput.focus();
          } else {
            cWrap.style.display = 'none';
            if (pSel.value && nameInput && !nameInput.value) {
              const p = db.parties.find(x => x.id === pSel.value);
              if (p) nameInput.value = `${p.name} ${dirSel?.value === 'taken' ? 'Loan' : 'Advance'}`;
            }
          }
        };
      }
    }
  );
}

export function repayForm2(id, pre) {
  const l = db.loans.find(x => x.id === id);
  if (!l) return;
  const t = l.dir === 'taken';
  const outstanding = Math.max(0, l.principal - l.repaid);
  const accrued = lacr(l);
  const partyName = l.partyName || pn(l.party) || 'Party';

  // default initial allocation
  const defaultInt = pre?.int !== undefined ? pre.int : accrued;
  const defaultPr = pre?.pr !== undefined ? pre.pr : (l.emi ? Math.max(0, Math.min(outstanding, l.emi - defaultInt)) : (outstanding > 0 ? Math.min(outstanding, 100000) : 0));
  const defaultTotal = defaultPr + defaultInt;

  form(`Record ${t ? 'Repayment' : 'Receipt'}: ${l.name || l.ref}`,
    `<div style="background:var(--mu);padding:10px 14px;border-radius:6px;margin-bottom:14px;font-size:13px;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
      <div><b>${esc(partyName)}</b> · ${t ? 'Borrowed (We owe)' : 'Lent (Given to others)'}</div>
      <div>Outstanding Principal: <b style="color:${t ? 'var(--rd)' : 'var(--ok)'}">${fmt(outstanding)}</b> ${accrued > 0 ? `· Accrued Int: <b>${fmt(accrued)}</b>` : ''}</div>
    </div>
    <div class="two">
      <label>Payment Date *
        <input type="date" name="date" id="rep_date" value="${today()}" required>
      </label>
      <label>Total Amount Paid (₹) *
        <input type="number" step="any" min="0.01" name="totalAmt" id="rep_total" value="${defaultTotal ? (defaultTotal / 100).toFixed(2) : ''}" required placeholder="0.00">
      </label>
    </div>
    <div style="border:1px solid var(--bd);border-radius:6px;padding:12px;margin:10px 0;background:rgba(0,0,0,0.02);">
      <div style="font-weight:600;font-size:13px;margin-bottom:8px;color:var(--tx);">Split Allocation (Principal + Interest)</div>
      <div class="two">
        <label>Principal Repayment (₹) *
          <input type="number" step="any" min="0" name="pr" id="rep_pr" value="${defaultPr ? (defaultPr / 100).toFixed(2) : '0.00'}" placeholder="0.00">
          <small style="color:var(--t2);">Reduces loan balance (max ${fmt(outstanding)})</small>
        </label>
        <label>Interest ${t ? 'Expense' : 'Income'} (₹)
          <input type="number" step="any" min="0" name="int" id="rep_int" value="${defaultInt ? (defaultInt / 100).toFixed(2) : '0.00'}" placeholder="0.00">
          <small style="color:var(--t2);">Goes to ${t ? '5500 Interest Expense' : '4300 Interest Income'}</small>
        </label>
      </div>
    </div>
    <div class="two">
      <label>Payment Account *
        <select name="acct">${accOpts(a => a.cash)}</select>
      </label>
      <label>Payment Method
        <select name="method">
          <option value="Bank Transfer">Bank Transfer</option>
          <option value="Cash">Cash</option>
          <option value="UPI">UPI</option>
          <option value="Cheque">Cheque</option>
          <option value="Debit Card">Debit Card</option>
          <option value="Other">Other</option>
        </select>
      </label>
      <label>Receipt / Reference No.
        <input type="text" name="refNo" placeholder="e.g. UTR-987654 or Cheque #123">
      </label>
      <label>Notes
        <input type="text" name="notes" placeholder="e.g. EMI installment for month">
      </label>
    </div>`,
    v => {
      const pr = P(v.pr || '0');
      const it = P(v.int || '0');
      if (pr + it <= 0) throw Error('Please enter a valid payment amount (principal or interest)');
      if (pr > outstanding) throw Error(`Principal repayment (${fmt(pr)}) cannot exceed outstanding balance (${fmt(outstanding)})`);

      const totalPaid = pr + it;
      const method = v.method || ((acc(v.acct)?.name || '').toLowerCase().includes('cash') ? 'Cash' : 'Bank Transfer');
      const isCash = v.acct === '1000' || method === 'Cash' || (acc(v.acct)?.name || '').toLowerCase().includes('cash');

      if (t && isCash && totalPaid > 0) {
        const check = checkCashLiquidity('1000', totalPaid);
        if (!check.ok) {
          throw Error(check.error || 'Insufficient cash in hand balance. Please deposit funds or pay via Bank Account.');
        }
      }

      const lines = [];
      if (t) {
        if (pr > 0) lines.push({ a: '2100', d: pr, c: 0, p: l.party });
        if (it > 0) lines.push({ a: '5500', d: it, c: 0, p: l.party });
        lines.push({ a: v.acct, d: 0, c: totalPaid, p: l.party });
      } else {
        lines.push({ a: v.acct, d: totalPaid, c: 0, p: l.party });
        if (pr > 0) lines.push({ a: '1400', d: 0, c: pr, p: l.party });
        if (it > 0) lines.push({ a: '4300', d: 0, c: it, p: l.party });
      }

      post({
        date: v.date,
        src: 'loan',
        narr: `${l.name || l.ref} - ${t ? 'Repayment to' : 'Receipt from'} ${partyName}${v.refNo ? ' (' + v.refNo + ')' : ''}`,
        meta: {
          loan: id,
          kind: 'rep',
          pr,
          int: it,
          acct: v.acct,
          party: l.party,
          partyName,
          ref: v.refNo || l.ref,
          docNo: v.refNo || l.ref,
          loanName: l.name || l.ref,
          method,
          desc: `${l.name || l.ref} - ${t ? 'EMI Repayment' : 'Receipt'} (Principal: ${fmt(pr)}, Interest: ${fmt(it)})`
        },
        lines
      });

      l.repaid += pr;
      l.last = v.date;
      if (pr > 0 && l.due) l.due = addM(l.due);
      if (l.principal - l.repaid <= 0) l.due = '';
      log('repay loan', l.ref);
      toast('Payment recorded successfully');
    },
    'Save Payment',
    () => {
      const totalEl = $('#rep_total');
      const prEl = $('#rep_pr');
      const intEl = $('#rep_int');

      if (totalEl && prEl && intEl) {
        totalEl.oninput = () => {
          const tot = parseFloat(totalEl.value) || 0;
          const curInt = parseFloat(intEl.value) || 0;
          if (curInt > 0 && tot >= curInt) {
            prEl.value = (tot - curInt).toFixed(2);
          } else {
            const intAlloc = Math.min(tot, accrued / 100);
            intEl.value = intAlloc.toFixed(2);
            prEl.value = Math.max(0, tot - intAlloc).toFixed(2);
          }
        };

        const onPartChange = () => {
          const prVal = parseFloat(prEl.value) || 0;
          const intVal = parseFloat(intEl.value) || 0;
          totalEl.value = (prVal + intVal).toFixed(2);
        };
        prEl.oninput = onPartChange;
        intEl.oninput = onPartChange;
      }
    }
  );
}

export function editLoanModal(id) {
  const l = db.loans.find(x => x.id === id);
  if (!l) return;
  const partyOptions = db.parties.map(p => `<option value="${p.id}" ${p.id === l.party ? 'selected' : ''}>${esc(p.name)} (${p.type || 'Party'})</option>`).join('');

  form(`Edit Loan: ${l.name || l.ref}`,
    `<div class="two">
      <label>Loan Name / Reference
        <input type="text" name="name" value="${esc(l.name || l.ref)}">
      </label>
      <label>Party (Lender / Borrower)
        <select name="party">${partyOptions}</select>
      </label>
      <label>Interest Rate (% p.a.)
        <input type="number" step="any" min="0" name="rate" value="${l.rate}">
      </label>
      <label>Scheduled Installment / EMI (₹)
        <input type="number" step="any" min="0" name="emi" value="${l.emi ? (l.emi / 100).toFixed(2) : ''}">
      </label>
      <label>Next Due Date
        <input type="date" name="due" value="${esc(l.due || '')}">
      </label>
    </div>
    <label style="margin-top:10px;">Notes / Agreement Ref
      <textarea name="notes" rows="2">${esc(l.notes || '')}</textarea>
    </label>`,
    v => {
      l.name = (v.name || '').trim() || l.name;
      if (v.party) {
        l.party = v.party;
        const p = db.parties.find(x => x.id === v.party);
        if (p) l.partyName = p.name;
      }
      l.rate = parseFloat(v.rate || 0);
      l.emi = v.emi ? P(v.emi) : 0;
      l.due = v.due || '';
      l.notes = (v.notes || '').trim();
      log('edit loan', l.ref);
      toast('Loan updated');
    }
  );
}

export function deleteLoanAction(id) {
  const l = db.loans.find(x => x.id === id);
  if (!l) return;

  if (!confirm(`Are you sure you want to delete loan "${l.name || l.ref}"?\n\nThis will permanently delete the loan and reverse all its associated journal entries.`)) {
    return;
  }

  // Reverse all journal entries associated with this loan
  const entries = db.entries.filter(e => e.meta && e.meta.loan === id);
  entries.forEach(e => {
    if (e.status === 'posted') {
      try { reverse(e.id); } catch (err) { console.warn('Could not reverse entry:', err); }
    }
  });

  // Remove loan
  db.loans = db.loans.filter(x => x.id !== id);
  save();
  toast(`Loan ${l.name || l.ref} deleted`);
  window.location.hash = '#/loans';
  window.dispatchEvent(new CustomEvent('bufin-render'));
}

export function exportLoanCsv(id) {
  const l = db.loans.find(x => x.id === id);
  if (!l) return;

  const entries = db.entries.filter(e => e.meta && e.meta.loan === id).sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.at || '').localeCompare(b.at || ''));
  const K2 = { disb: 'Disbursement', topup: 'Top-up Principal', fee: 'Fee / Penalty', rep: 'EMI / Repayment' };
  let run = 0;

  const h = 'Date,Txn Type,Receipt / Ref No,Account,Principal Paid,Interest,Total Paid,Remaining Balance\n';
  const rows = entries.map(e => {
    const m = e.meta || {};
    const pr = m.pr || 0;
    const it = m.int || 0;
    if (m.kind === 'disb' || m.kind === 'topup') {
      run += pr;
    } else if (m.kind === 'rep') {
      run -= pr;
    }
    const cashL = e.lines.find(line => acc(line.a)?.cash);
    const acctName = cashL ? an(cashL.a) : (m.acct ? an(m.acct) : '');
    const refNo = m.ref || m.docNo || e.ref;
    const total = (m.kind === 'rep') ? (pr + it) : (pr || it);

    return [
      e.date,
      K2[m.kind] || m.kind || 'Transaction',
      refNo,
      acctName,
      (pr / 100).toFixed(2),
      (it / 100).toFixed(2),
      (total / 100).toFixed(2),
      (Math.max(0, run) / 100).toFixed(2)
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  }).join('\n');

  downloadCSV(h + rows, `loan_statement_${l.ref}`);
  toast('Loan statement CSV exported');
}

const jvAccOpts = sel => opts(
  db.accounts.map(a => [a.code, `${a.code} · ${a.name} (${TN[a.t] || a.t})`]),
  sel
);

const jvRow = (n, aVal = '', dVal = '', cVal = '') => `<div class="two jv-row" data-n="${n}" style="grid-template-columns:2fr 1fr 1fr;gap:8px;margin-bottom:8px;align-items:center;">
  <select name="a${n}" aria-label="Account" style="width:100%;">
    <option value="">Account (Asset / Liab / Equity / Inc / Exp)</option>
    ${jvAccOpts(aVal)}
  </select>
  <input name="d${n}" placeholder="Debit (₹)" value="${esc(dVal)}" inputmode="decimal" style="text-align:right;">
  <input name="c${n}" placeholder="Credit (₹)" value="${esc(cVal)}" inputmode="decimal" style="text-align:right;">
</div>`;

function jvCalc() {
  const f = $('#f');
  if (!f) return;
  let D = 0, C = 0;
  for (const el of f.elements) {
    const m = /^([dc])\d+$/.exec(el.name || '');
    if (m && el.value) {
      try {
        const x = P(el.value);
        m[1] === 'd' ? D += x : C += x;
      } catch (e) {}
    }
  }
  const jt = $('#jt');
  const sb = $('#sb') || f.querySelector('button[type="submit"]') || f.querySelector('button.p');
  const isBalanced = D > 0 && D === C;

  if (sb) {
    sb.disabled = !isBalanced;
    if (!isBalanced) {
      sb.style.opacity = '0.55';
      sb.style.cursor = 'not-allowed';
      sb.title = 'Total debits must strictly equal total credits to post';
    } else {
      sb.style.opacity = '1';
      sb.style.cursor = 'pointer';
      sb.title = '';
    }
  }

  if (jt) {
    if (isBalanced) {
      jt.className = 'pill-ok';
      jt.style.background = '#ecfdf5';
      jt.style.color = '#047857';
      jt.style.border = '1px solid #a7f3d0';
      jt.style.padding = '8px 12px';
      jt.style.borderRadius = '6px';
      jt.style.fontWeight = '600';
      jt.innerHTML = `✓ Balanced: Total Debit ${fmt(D)} == Total Credit ${fmt(C)}`;
    } else if (D === 0 && C === 0) {
      jt.className = 'warn';
      jt.style.background = 'var(--mu)';
      jt.style.color = 'var(--t2)';
      jt.style.border = '1px solid var(--bd)';
      jt.style.padding = '8px 12px';
      jt.style.borderRadius = '6px';
      jt.style.fontWeight = '500';
      jt.innerHTML = `Debit ₹0.00 · Credit ₹0.00 · Enter debit and credit amounts`;
    } else {
      const diff = Math.abs(D - C);
      jt.className = 'warn';
      jt.style.background = '#fef2f2';
      jt.style.color = '#b91c1c';
      jt.style.border = '1px solid #fecaca';
      jt.style.padding = '8px 12px';
      jt.style.borderRadius = '6px';
      jt.style.fontWeight = '600';
      jt.innerHTML = `⚠️ Out of Balance: Debit ${fmt(D)} · Credit ${fmt(C)} · Difference: <b>${fmt(diff)}</b> (Debit must equal Credit to post)`;
    }
  }
}

export function jvForm2(existingEntry = null) {
  const isEdit = !!(existingEntry && existingEntry.id);
  const existingLines = (existingEntry && existingEntry.lines) ? existingEntry.lines : [];
  const minRows = Math.max(4, existingLines.length);
  jvN = minRows - 1;

  const rowsHtml = Array.from({ length: minRows }).map((_, idx) => {
    const l = existingLines[idx];
    const aVal = l ? l.a : '';
    const dVal = l && l.d ? (l.d / 100).toFixed(2) : '';
    const cVal = l && l.c ? (l.c / 100).toFixed(2) : '';
    return jvRow(idx, aVal, dVal, cVal);
  }).join('');

  form(
    isEdit ? `Edit Journal Entry (${existingEntry.ref})` : 'New journal entry',
    fld('date', 'Date', 'date', isEdit ? existingEntry.date : today(), 1) +
    fld('narr', 'Narration', 'text', isEdit ? existingEntry.narr : '', 1) +
    '<div id="jr">' + rowsHtml + '</div>' +
    '<div class="bar" style="margin-top:6px;margin-bottom:10px;"><button type="button" id="jvAddBtn" class="btn">+ Add line</button></div>' +
    '<div id="jt" style="margin-bottom:14px;font-size:12.5px;">Debit ₹0.00 · Credit ₹0.00</div>',
    v => {
      for (const k of Object.keys(v)) {
        const m = /^[dc](\d+)$/.exec(k);
        if (m && v[k] && !v['a' + m[1]]) throw Error('Choose an account for every amount');
      }
      const L = Object.keys(v).filter(k => /^a\d+$/.test(k) && v[k]).map(k => {
        const n = k.slice(1);
        return { a: v[k], d: v['d' + n] ? P(v['d' + n]) : 0, c: v['c' + n] ? P(v['c' + n]) : 0 };
      }).filter(l => l.d || l.c);

      const totalD = L.reduce((s, l) => s + l.d, 0);
      const totalC = L.reduce((s, l) => s + l.c, 0);
      if (totalD === 0 && totalC === 0) throw Error('Please enter journal debit and credit lines');
      if (totalD !== totalC) throw Error(`Debits (${fmt(totalD)}) must strictly equal credits (${fmt(totalC)})`);

      if (isEdit) {
        post({
          id: existingEntry.id,
          ref: existingEntry.ref,
          date: v.date,
          narr: v.narr,
          src: existingEntry.src || 'jv',
          lines: L
        });
      } else {
        post({ date: v.date, narr: v.narr, src: 'jv', lines: L });
      }
    },
    isEdit ? 'Update journal' : 'Post journal',
    () => {
      $('#jvAddBtn')?.addEventListener('click', () => {
        const n = ++jvN;
        $('#jr')?.insertAdjacentHTML('beforeend', jvRow(n));
        jvCalc();
      });

      const f = $('#f');
      if (f) {
        const handleLineInput = ev => {
          const m = /^([dc])(\d+)$/.exec(ev.target?.name || '');
          if (m && ev.target.value.trim()) {
            const opp = (m[1] === 'd' ? 'c' : 'd') + m[2];
            const oppEl = f.elements[opp];
            if (oppEl && oppEl.value) oppEl.value = '';
          }
          jvCalc();
        };
        f.addEventListener('input', handleLineInput);
        f.addEventListener('change', handleLineInput);
      }

      // Initial validation state calculation to enforce button disabling
      jvCalc();
    }
  );
}

export function quickAddModal() {
  const actions = [
    { id: 'in', label: 'Money In', icon: 'in', color: 'emerald', bg: '#ecfdf5', border: '#a7f3d0', iconColor: '#059669' },
    { id: 'out', label: 'Money Out', icon: 'out', color: 'rose', bg: '#fff1f2', border: '#fecdd3', iconColor: '#e11d48' },
    { id: 'xfer', label: 'Transfer', icon: 'xfer', color: 'blue', bg: '#eff6ff', border: '#bfdbfe', iconColor: '#2563eb' },
    { id: 'bills', label: 'Purchase Bill', icon: 'bills', color: 'amber', bg: '#fffbeb', border: '#fde68a', iconColor: '#d97706' },
    { id: 'parties', label: 'Party', icon: 'parties', color: 'purple', bg: '#f5f3ff', border: '#ddd6fe', iconColor: '#7c3aed' },
    { id: 'pl', label: 'Profit & Loss', icon: 'pl', color: 'teal', bg: '#f0fdfa', border: '#99f6e4', iconColor: '#0d9488' }
  ];

  modal(`
    <div class="qa-sheet-head">
      <h3 class="qa-sheet-title">Quick Actions</h3>
      <div class="qa-sheet-sub">Create transactions or view real-time reports</div>
    </div>
    <div class="qa-grid qa">
      ${actions.map(q => `
        <button type="button" class="qa-card qa-card-${q.color}" data-a="qago" data-i="${q.id}">
          <span class="qa-icon" style="background:${q.bg};color:${q.iconColor};border:1px solid ${q.border}">
            ${ic(q.icon)}
          </span>
          <span class="qa-label">${q.label}</span>
        </button>
      `).join('')}
    </div>
  `);
}

export function showCsvModal() {
  const r = ['Date,VoucherRef,Type,Party,Account,Category,Method,ReferenceNo,Description,Amount,Status'];
  db.entries.forEach(e => {
    let partyName = e.meta?.partyName || '';
    if (!partyName) {
      const pLine = e.lines.find(l => l.p);
      if (pLine && pLine.p) partyName = pn(pLine.p);
    }
    const acct = e.lines.find(l => acc(l.a)?.cash)?.a || e.lines[0]?.a;
    const cat = e.lines.find(l => !acc(l.a)?.cash)?.a || e.lines[1]?.a;
    const refNo = e.meta?.ref || e.meta?.docNo || '';
    const desc = e.meta?.desc || e.narr || '';
    const method = e.meta?.method || '';
    const amt = (e.lines.reduce((s, l) => s + l.d, 0) / 100).toFixed(2);
    r.push([
      e.date,
      e.ref,
      e.src,
      '"' + (partyName || '').replace(/"/g, '""') + '"',
      '"' + (an(acct) || '').replace(/"/g, '""') + '"',
      '"' + (an(cat) || '').replace(/"/g, '""') + '"',
      '"' + (method || '').replace(/"/g, '""') + '"',
      '"' + (refNo || '').replace(/"/g, '""') + '"',
      '"' + (desc || '').replace(/"/g, '""') + '"',
      amt,
      e.status
    ].join(','));
  });
  downloadCSV(r.join('\n'), 'all_transactions');
  toast('Transactions CSV exported');
}

export const exportTransactionsCsv = showCsvModal;


export function showBackupModal() {
  modal(`<h3>Backup</h3><p>Copy this text and keep it somewhere safe.</p><textarea rows="10" id="ta" readonly>${esc(JSON.stringify(db))}</textarea><div class="row"><button id="copyBtn">Copy</button><button id="closeBkpBtn">Close</button></div>`);
  $('#copyBtn').onclick = () => { $('#ta').select(); document.execCommand('copy'); toast('Copied'); };
  $('#closeBkpBtn').onclick = closeM;
}
