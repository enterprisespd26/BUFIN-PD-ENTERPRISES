import { $, $$, esc, fmt, P, today, addD, addM, toast, ic, uid, downloadCSV, downloadJSON, downloadZIP, readZipFile } from './utils.js';
import { db, setDb, save, post, reverse, next, log, acc, an, pn, out, paid, dstat, cashAcc, isC, isS, lstat, lacr, SYS, TN, PT, net, checkCashLiquidity, sortEntries, getOrCreateExpenseAccount, syncPartyClassifications, setVer, setBaseVer } from './state.js';
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
    <div class="row modal-actions no-print" style="display:flex;gap:10px;justify-content:flex-end;align-items:center;flex-wrap:wrap;margin-top:16px;">
      ${((e.src === 'in' || e.src === 'out' || e.src === 'exp' || e.src === 'pay' || e.src === 'xfer' || e.src === 'jv') && e.status === 'posted') ? `
        <button type="button" class="btn p" data-a="edittxn" data-i="${esc(e.id)}" style="display:inline-flex;align-items:center;gap:6px;background:#2563eb;color:#ffffff;font-weight:600;padding:8px 16px;border-radius:8px;border:none;cursor:pointer;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
          <span>Edit Details</span>
        </button>
      ` : ''}
      ${linkedDoc ? `
        <button type="button" class="btn" id="viewLinkedDocBtn" style="display:inline-flex;align-items:center;gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          View ${linkedDoc.type === 'bill' ? 'Purchase Bill' : 'Sales Invoice'}
        </button>
      ` : ''}
      ${can ? `
        <button type="button" class="d" data-a="rev" data-i="${esc(e.id)}" style="display:inline-flex;align-items:center;gap:6px;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
          Reverse Entry
        </button>
      ` : ''}
      <button type="button" id="closeEntBtn" class="btn alt" style="padding:8px 16px;">Close</button>
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
  modal(`<h3>${esc(d.no)} <span class="b ${esc(st[1])}">${esc(st[0])}</span></h3>
    <div style="font-size:12.5px;line-height:1.5;margin-bottom:12px;padding:10px 12px;background:#f8fafc;border:1px solid var(--bd);border-radius:6px">
      <div style="font-weight:700;font-size:15px;color:var(--tx)">${esc(b.name || '')}</div>
      ${b.addr ? `<div style="color:var(--t2)">${esc(b.addr).replace(/\n/g, ', ')}</div>` : ''}
      <div style="color:var(--t2)">${b.phone ? 'Mob: ' + esc(b.phone) : ''}${b.email ? (b.phone ? ' | ' : '') + 'Email: ' + esc(b.email) : ''}</div>
      <div><b>GSTIN:</b> <code>${esc(b.gstin || '')}</code> · <b>State:</b> ${esc(b.state || 'Odisha')} (Code: 21)</div>
    </div>
    <p><b>${s ? 'Bill to' : 'Supplier'}:</b> ${esc(p.name || d.sup || '')} ${p.gstin || d.gstin ? '· <b>GSTIN:</b> ' + esc(p.gstin || d.gstin) : ''}<br>
    <b>Date:</b> ${esc(d.date)}${d.due ? ' · <b>Due:</b> ' + esc(d.due) : ''}</p>
    <div class="wrap"><table>
      <tr><td>${esc(d.desc)}</td><td class="num">${fmt(d.base)}</td></tr>
      ${taxRows(d, s)}
      <tr class="tot"><td>Total</td><td class="num">${fmt(d.total)}</td></tr>
      <tr><td>Paid</td><td class="num">${fmt(paid(d))}</td></tr>
      <tr class="tot"><td>Outstanding</td><td class="num">${fmt(out(d))}</td></tr>
    </table></div>
    ${d.pays.length ? '<small>Payments: ' + d.pays.map(x => esc(x.date) + ' ' + fmt(x.amt) + (x.void ? ' (void)' : '')).join(', ') + '</small>' : ''}
    <div class="row">
      <button onclick="window.print()">Print</button>
      ${!d.cancelled && out(d) > 0 ? `<button class="p" data-a="pay" data-i="${esc(d.id)}">${s ? 'Receive payment' : 'Pay bill'}</button>` : ''}
      ${!d.cancelled ? `<button class="d" data-a="cdoc" data-i="${esc(d.id)}">Cancel</button>` : ''}
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
      d.paid = totalPaisa - Math.max(0, curBalPaisa - aPaisa);
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
    : (Number(d.paid) || 0);
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
        : (Number(d.paid) || 0);
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
      d.paid = totalPaisa - Math.max(0, curBalPaisa - aPaisa);
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
    <small>Customers appear on invoices and Money In. Suppliers appear on purchase bills and trade payables. Lenders / Others include loan providers, expense vendors, employees and miscellaneous parties.</small>`,
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
  const isLoanMatch = l => l.party === i || (p.name && (l.party === p.name || l.partyName === p.name));
  const isLoan = p.type === 'lender' || (db.loans || []).some(isLoanMatch);
  const codes = [
    isC(p) ? '1100' : '',
    isS(p) ? '2000' : '',
    isLoan ? '2100' : ''
  ].filter(Boolean);
  const ents = db.entries.slice().sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.at || '').localeCompare(b.at || ''));
  let rec = 0, pay = 0;

  const blocks = codes.map(c => {
    let run = 0;
    const rows = ents.flatMap(e => (e.lines || []).filter(l => l.a === c && (l.p === i || (p.name && l.p === p.name))).map(l => {
      run += (c === '1100' ? (l.d - l.c) : (l.c - l.d));
      return `<tr><td>${e.date}</td><td>${esc(e.narr)}</td><td class="num">${l.d ? fmt(l.d) : ''}</td><td class="num">${l.c ? fmt(l.c) : ''}</td><td class="num">${fmt(run)}</td></tr>`;
    }));
    c === '1100' ? rec = run : pay = run;
    return `<h4>${c === '1100' ? 'Receivable: they owe us ' + fmt(run) : c === '2100' ? 'Loan Payable: we owe them ' + fmt(run) : 'Payable: we owe them ' + fmt(run)}</h4>
      <div class="wrap"><table><tr><th>Date</th><th>Details</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr>${rows.join('') || '<tr><td colspan="5" class="empty">No transactions yet.</td></tr>'}</table></div>`;
  }).join('');

  let extraRows = '';
  if (codes.length === 0) {
    const pEnts = ents.filter(e => e.lines && e.lines.some(l => l.p === i || (p.name && l.p === p.name)));
    if (pEnts.length > 0) {
      let run = 0;
      const rows = pEnts.map(e => {
        const line = e.lines.find(l => l.p === i || (p.name && l.p === p.name));
        const d = line ? line.d : 0;
        const c = line ? line.c : 0;
        run += (d - c);
        return `<tr><td>${e.date}</td><td>${esc(e.narr)}</td><td class="num">${d ? fmt(d) : ''}</td><td class="num">${c ? fmt(c) : ''}</td><td class="num">${fmt(run)}</td></tr>`;
      });
      extraRows = `<h4>Transaction History</h4>
        <div class="wrap"><table><tr><th>Date</th><th>Details</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Net Activity</th></tr>${rows.join('')}</table></div>`;
    }
  }

  const ln = (db.loans || []).filter(isLoanMatch).map(l => `<li>${l.ref}: ${fmt(l.principal - l.repaid)} outstanding</li>`).join('');

  modal(`<h3>${esc(p.name)}</h3>
    <p><small>${(PT[p.type] || p.type).split(' (')[0]}${p.phone ? ' · ' + esc(p.phone) : ''}${p.gstin ? ' · GSTIN ' + esc(p.gstin) : ''}${p.state ? ' · ' + esc(p.state) : ''}${p.terms ? ' · ' + p.terms + ' day terms' : ''}</small></p>
    ${blocks}
    ${extraRows}
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

export async function moneyInForm(existingEntry = null) {
  const isEdit = !!(existingEntry && existingEntry.id);
  let inAttachments = [];
  if (isEdit && existingEntry.id) {
    try {
      inAttachments = (await getAttachments(existingEntry.id)) || [];
    } catch (e) {
      inAttachments = [];
    }
  }
  const customers = (db.parties || []).filter(isC);

  const bankMethods = [
    'Bank Transfer / NEFT / RTGS',
    'UPI',
    'Cheque',
    'Debit / Credit Card',
    'Other'
  ];

  // Derive existing values if editing
  const debitLine = existingEntry?.lines?.find(l => l.d > 0) || null;
  const creditLine = existingEntry?.lines?.find(l => l.c > 0 && l.a !== debitLine?.a) || existingEntry?.lines?.find(l => l.c > 0) || null;
  const existingAmt = debitLine ? (debitLine.d / 100).toFixed(2) : '';
  const existingDate = existingEntry ? existingEntry.date : today();
  const existingAcct = debitLine?.a || existingEntry?.meta?.acct || '1010';
  const existingCat = existingEntry?.meta?.cat || creditLine?.a || '1100';
  const existingRef = existingEntry?.meta?.ref || existingEntry?.ref || '';
  const existingDesc = existingEntry?.meta?.desc !== undefined ? existingEntry.meta.desc : (existingEntry?.narr || '');
  const existingPartyId = existingEntry?.meta?.party || creditLine?.p || debitLine?.p || '';
  const existingPartyName = existingEntry?.meta?.partyName || existingEntry?.meta?.contributor || existingEntry?.meta?.payer || '';
  const existingCapitalType = existingEntry?.meta?.capitalType || 'Additional Capital';
  const existingContributor = existingEntry?.meta?.contributor || existingPartyName || (db.biz?.owner || 'PD ENTERPRISES');
  const existingPayer = existingEntry?.meta?.payer || existingPartyName || '';
  const existingSource = existingEntry?.meta?.sourceDesc || '';
  const existingMethod = existingEntry?.meta?.method || (existingAcct === '1000' ? 'Cash' : 'Bank Transfer / NEFT / RTGS');
  const existingInvoiceId = existingEntry?.meta?.invoiceId || '';
  const isCustomParty = existingPartyId === '__CUSTOM__' || (existingPartyName && !customers.some(p => p.id === existingPartyId));

  form(isEdit ? `Edit Money Received (${existingEntry.ref})` : 'Money In (Record Received)',
    `<div class="two">
      ${fld('date', 'Date', 'date', existingDate, 1)}
      <div style="display:flex; flex-direction:column; gap:4px;">
        <label>Deposit To Account *
          <select name="acct" id="txn_acct" required>
            ${accOpts(a => a.cash, existingAcct)}
          </select>
        </label>
        <div id="txn_in_cash_bal_hint" style="font-size:12px; color:var(--t2); padding-left:2px; display:none;"></div>
      </div>

      <label style="grid-column: 1 / -1;">Income Category *
        <select name="cat" id="txn_cat" required>
          <option value="1100"${existingCat === '1100' ? ' selected' : ''}>Customer Payment / Receipt (Trade Accounts Receivable)</option>
          <option value="3000"${existingCat === '3000' ? ' selected' : ''}>Capital Introduced (Owner's Capital / Equity)</option>
          <option value="4300"${existingCat === '4300' ? ' selected' : ''}>Interest Income</option>
          <option value="4200"${existingCat === '4200' ? ' selected' : ''}>Other Miscellaneous Income</option>
        </select>
      </label>

      <!-- Section 1: Customer Payment (cat === 1100) -->
      <div id="in_sec_customer" style="grid-column: 1 / -1; display: ${existingCat === '1100' ? 'flex' : 'none'}; flex-direction: column; gap: 8px;">
        <label>Customer / Payer *
          <select name="party" id="txn_party">
            <option value="">-- None / Walk-in Customer --</option>
            ${customers.map(p => `<option value="${p.id}"${p.id === existingPartyId ? ' selected' : ''}>${esc(p.name)}${p.phone ? ' (' + esc(p.phone) + ')' : ''}</option>`).join('')}
            <option value="__CUSTOM__"${isCustomParty ? ' selected' : ''}>➕ Enter custom customer name...</option>
          </select>
        </label>
        <div id="txn_custom_wrap" style="display:${isCustomParty ? 'block' : 'none'}">
          <label>Customer Name *
            <input type="text" name="custom_party" id="txn_custom_party" value="${esc(existingPartyName)}" placeholder="Type customer name...">
          </label>
        </div>
        <label>Select Unpaid Invoice (Optional)
          <select name="invoice_ref" id="txn_invoice_ref">
            <option value="">-- Select a customer above to load unpaid invoices --</option>
          </select>
        </label>
        <div id="in_invoice_due_hint" style="font-size:12px;color:var(--t2);margin-top:-2px;display:none;"></div>
      </div>

      <!-- Section 2: Capital Introduced (cat === 3000) -->
      <div id="in_sec_capital" style="grid-column: 1 / -1; display: ${existingCat === '3000' ? 'flex' : 'none'}; flex-direction: column; gap: 8px;">
        <div class="two">
          <label>Proprietor / Investor Name *
            <input type="text" name="proprietor_name" id="txn_proprietor_name" value="${esc(existingContributor)}" placeholder="e.g. Proprietor, Investor Name...">
          </label>
          <label>Capital Type *
            <select name="capital_type" id="txn_capital_type">
              <option value="Additional Capital"${existingCapitalType === 'Additional Capital' ? ' selected' : ''}>Additional Capital</option>
              <option value="Initial Capital Infusion"${existingCapitalType === 'Initial Capital Infusion' ? ' selected' : ''}>Initial Capital Infusion</option>
            </select>
          </label>
        </div>
      </div>

      <!-- Section 3: Interest & Other Income (cat === 4300 || cat === 4200) -->
      <div id="in_sec_other_income" style="grid-column: 1 / -1; display: ${(existingCat === '4300' || existingCat === '4200') ? 'flex' : 'none'}; flex-direction: column; gap: 8px;">
        <div class="two">
          <label>Payer / Source Name
            <input type="text" name="income_payer" id="txn_income_payer" value="${esc(existingPayer)}" placeholder="e.g. Bank, Financial Institution, Payer Name...">
          </label>
          <label>Income Source Description
            <input type="text" name="income_source" id="txn_income_source" value="${esc(existingSource)}" placeholder="e.g. Savings Interest, Scrap Handling, Scrap Recovery...">
          </label>
        </div>
      </div>

      <!-- Payment Method Wrap -->
      <div id="txn_method_wrap" style="grid-column: 1 / -1;">
        <label>Payment Method
          <select name="method" id="txn_method">
            ${bankMethods.map(m => `<option value="${m}"${m === existingMethod ? ' selected' : ''}>${m}</option>`).join('')}
          </select>
        </label>
      </div>

      <!-- Amount and Reference in ONE LINE -->
      <div class="amt-ref-row">
        ${fld('amt', 'Amount Received (₹)', 'number', existingAmt, 1, 'min="0.01" step="any" placeholder="0.00"')}
        ${fld('ref', 'Reference No.', 'text', existingRef, 0, 'placeholder="e.g. UTR / Cheque / Txn ID"')}
      </div>

      <label style="grid-column: 1 / -1;">Description / Notes
        <textarea name="desc" id="txn_desc" rows="2" placeholder="Itemized details or specific receipt context...">${esc(existingDesc)}</textarea>
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

      const isCash = v.acct === '1000' || (acc(v.acct)?.name || '').toLowerCase().includes('cash');
      const finalMethod = isCash ? 'Cash' : (v.method || 'Bank Transfer / NEFT / RTGS');
      const userRef = (v.ref || '').trim();
      const userDesc = (v.desc || '').trim();
      const cat = v.cat;
      let postedEnt = null;

      if (isEdit) {
        // Rollback previous invoice allocation if applicable
        const prevInvoices = (db.docs || []).filter(d => d.type === 'sale' && d.pays?.some(p => p.je === existingEntry.id));
        prevInvoices.forEach(inv => {
          inv.pays = inv.pays.filter(p => p.je !== existingEntry.id);
          const paidSum = inv.pays.reduce((s, p) => s + (p.amt || 0), 0);
          inv.paid = paidSum;
        });
      }

      if (cat === '3000') {
        // Capital Introduced (Owner's Capital)
        const contributor = (v.proprietor_name || '').trim() || (db.biz?.owner || "PD ENTERPRISES");
        const capitalType = v.capital_type || 'Additional Capital';
        const narr = userDesc
          ? `${contributor} - ${userDesc}`
          : `${contributor} - ${capitalType} (Capital Introduced)`;

        postedEnt = post({
          id: isEdit ? existingEntry.id : undefined,
          ref: isEdit ? existingEntry.ref : undefined,
          date: v.date,
          src: 'in',
          narr: narr,
          meta: {
            ...(isEdit ? existingEntry.meta : {}),
            method: finalMethod,
            ref: userRef,
            acct: v.acct,
            cat: '3000',
            catName: 'Capital Introduced',
            contributor: contributor,
            capitalType: capitalType,
            partyName: contributor,
            desc: userDesc
          },
          lines: [
            { a: v.acct, d: a, c: 0 },
            { a: '3000', d: 0, c: a }
          ]
        });
      } else if (cat === '1100') {
        // Customer Payment / Receipt (Accounts Receivable)
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

        const selectedInv = v.invoice_ref ? db.docs.find(d => d.id === v.invoice_ref) : null;
        const invNo = selectedInv ? (selectedInv.no || selectedInv.sno) : '';

        const narr = userDesc
          ? (partyName ? `${partyName} - ${userDesc}` : userDesc)
          : (invNo ? `${partyName} - Payment for Invoice ${invNo}` : (partyName ? `${partyName} - Customer Payment` : 'Customer Payment'));

        const pJe = postedEnt = post({
          id: isEdit ? existingEntry.id : undefined,
          ref: isEdit ? existingEntry.ref : undefined,
          date: v.date,
          src: 'in',
          narr: narr,
          meta: {
            ...(isEdit ? existingEntry.meta : {}),
            method: finalMethod,
            ref: userRef || invNo,
            docNo: invNo,
            invoiceId: selectedInv ? selectedInv.id : '',
            acct: v.acct,
            cat: '1100',
            catName: 'Customer Receipt',
            party: partyId || '',
            partyName: partyName,
            desc: userDesc
          },
          lines: [
            { a: v.acct, d: a, c: 0, p: partyId },
            { a: '1100', d: 0, c: a, p: partyId }
          ]
        });

        if (selectedInv) {
          if (!selectedInv.pays) selectedInv.pays = [];
          const curBal = Math.max(0, out(selectedInv));
          const appliedAmt = Math.min(a, curBal);
          selectedInv.pays.push({
            je: pJe.id,
            amt: appliedAmt,
            date: v.date,
            method: finalMethod,
            acct: v.acct
          });
          selectedInv.paid = (selectedInv.total || 0) - Math.max(0, curBal - appliedAmt);
        }
      } else {
        // Interest Income (4300) or Other Miscellaneous Income (4200)
        const payer = (v.income_payer || '').trim();
        const sourceDesc = (v.income_source || '').trim();
        const catName = cat === '4300' ? 'Interest Income' : 'Other Miscellaneous Income';

        const narr = userDesc
          ? (payer ? `${payer} - ${userDesc}` : userDesc)
          : (sourceDesc ? (payer ? `${payer} - ${sourceDesc}` : sourceDesc) : (payer ? `${payer} - ${catName}` : catName));

        postedEnt = post({
          id: isEdit ? existingEntry.id : undefined,
          ref: isEdit ? existingEntry.ref : undefined,
          date: v.date,
          src: 'in',
          narr: narr,
          meta: {
            ...(isEdit ? existingEntry.meta : {}),
            method: finalMethod,
            ref: userRef,
            acct: v.acct,
            cat: cat,
            catName: catName,
            payer: payer,
            partyName: payer,
            sourceDesc: sourceDesc,
            desc: userDesc
          },
          lines: [
            { a: v.acct, d: a, c: 0 },
            { a: cat, d: 0, c: a }
          ]
        });
      }

      if (inAttachments.length && postedEnt && postedEnt.id) {
        saveAttachments(postedEnt.id, inAttachments);
      }
    },
    isEdit ? 'Update Transaction' : 'Save Transaction',
    () => {
      bindAttachmentEvents({
        idPrefix: 'in_att',
        getFiles: () => inAttachments,
        setFiles: f => { inAttachments = f; }
      });

      const acctEl = $('#txn_acct');
      const methWrap = $('#txn_method_wrap');
      const methSel = $('#txn_method');
      const catEl = $('#txn_cat');

      const secCustomer = $('#in_sec_customer');
      const secCapital = $('#in_sec_capital');
      const secOtherIncome = $('#in_sec_other_income');

      const partySel = $('#txn_party');
      const customWrap = $('#txn_custom_wrap');
      const customInput = $('#txn_custom_party');
      const invoiceRefSel = $('#txn_invoice_ref');
      const invoiceDueHint = $('#in_invoice_due_hint');

      const amtInput = $('input[name="amt"]');
      const refInput = $('input[name="ref"]');
      const descInput = $('#txn_desc');
      const cashHintEl = $('#txn_in_cash_bal_hint');

      function syncAcctMethod() {
        if (!acctEl || !methWrap || !methSel) return;
        const code = acctEl.value;
        const isCash = code === '1000' || (acc(code)?.name || '').toLowerCase().includes('cash');
        const bal = net(code);

        if (cashHintEl) {
          cashHintEl.style.display = 'block';
          cashHintEl.innerHTML = `Available ${isCash ? 'Cash in Hand' : (acc(code)?.name || 'Account')}: <b style="color:${bal <= 0 ? '#dc2626' : '#0f5132'}">${fmt(bal)}</b>`;
        }

        if (isCash) {
          methWrap.style.display = 'none';
          methSel.innerHTML = '<option value="Cash" selected>Cash</option>';
        } else {
          methWrap.style.display = '';
          const cur = methSel.value && methSel.value !== 'Cash' ? methSel.value : 'Bank Transfer / NEFT / RTGS';
          methSel.innerHTML = bankMethods.map(m => `<option value="${m}"${m === cur ? ' selected' : ''}>${m}</option>`).join('');
        }
      }

      function updateInvoiceOptions() {
        if (!partySel || !invoiceRefSel) return;
        const custId = partySel.value;
        if (!custId || custId === '__CUSTOM__') {
          invoiceRefSel.innerHTML = '<option value="">-- ' + (custId === '__CUSTOM__' ? 'Custom customer (On-Account Receipt)' : 'Select a customer above to load unpaid invoices') + ' --</option>';
          if (invoiceDueHint) invoiceDueHint.style.display = 'none';
          return;
        }

        const openInvoices = (db.docs || []).filter(d => d.type === 'sale' && !d.cancelled && d.party === custId && (out(d) > 0 || (isEdit && d.pays?.some(p => p.je === existingEntry.id))));
        if (openInvoices.length > 0) {
          invoiceRefSel.innerHTML = '<option value="">-- Select Unpaid Invoice to Settle (Optional) --</option>' +
            openInvoices.map(b => {
              const due = (out(b) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
              const invNo = b.no || b.sno || b.id;
              const isSelected = isEdit && (existingInvoiceId === b.id || b.pays?.some(p => p.je === existingEntry.id));
              return `<option value="${esc(b.id)}" data-due="${(out(b) / 100).toFixed(2)}" data-no="${esc(invNo)}"${isSelected ? ' selected' : ''}>Invoice #${esc(invNo)} (${esc(b.date)}) — Due: ₹${due}</option>`;
            }).join('');
        } else {
          invoiceRefSel.innerHTML = '<option value="">-- No pending unpaid invoices (On-Account Receipt) --</option>';
          if (invoiceDueHint) invoiceDueHint.style.display = 'none';
        }
      }

      function switchCategory() {
        const cat = catEl ? catEl.value : '1100';
        if (secCustomer) secCustomer.style.display = 'none';
        if (secCapital) secCapital.style.display = 'none';
        if (secOtherIncome) secOtherIncome.style.display = 'none';

        if (cat === '1100') {
          // Customer Payment / Receipt
          if (secCustomer) secCustomer.style.display = 'flex';
          updateInvoiceOptions();
        } else if (cat === '3000') {
          // Capital Introduced
          if (secCapital) secCapital.style.display = 'flex';
        } else if (cat === '4300' || cat === '4200') {
          // Interest Income or Other Income
          if (secOtherIncome) secOtherIncome.style.display = 'flex';
        }
      }

      if (acctEl) acctEl.onchange = syncAcctMethod;
      syncAcctMethod();

      if (catEl) catEl.onchange = switchCategory;
      switchCategory();

      if (isEdit) {
        if (methSel && existingMethod) methSel.value = existingMethod;
        if (existingInvoiceId && invoiceRefSel) invoiceRefSel.value = existingInvoiceId;
      }

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
          updateInvoiceOptions();
        };
      }

      if (invoiceRefSel) {
        invoiceRefSel.onchange = () => {
          const opt = invoiceRefSel.options[invoiceRefSel.selectedIndex];
          if (opt && opt.dataset.due) {
            if (amtInput) amtInput.value = opt.dataset.due;
            if (refInput && !refInput.value) refInput.value = opt.dataset.no || '';
            if (descInput) descInput.value = `Payment received for Invoice ${opt.dataset.no || ''}`;
            if (invoiceDueHint) {
              invoiceDueHint.style.display = '';
              invoiceDueHint.innerHTML = `<span style="color:#0f5132;font-weight:600;">Selected Invoice Due: ₹${parseFloat(opt.dataset.due).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>`;
            }
          } else {
            if (invoiceDueHint) invoiceDueHint.style.display = 'none';
          }
        };
      }
    }
  );
}

export async function moneyOutForm(existingEntry = null) {
  const isEdit = !!(existingEntry && existingEntry.id);
  let outAttachments = [];
  if (isEdit && existingEntry.id) {
    try {
      outAttachments = (await getAttachments(existingEntry.id)) || [];
    } catch (e) {
      outAttachments = [];
    }
  }
  const suppliers = db.parties.filter(isS);
  const lenders = db.parties.filter(p => p.type === 'lender' || (db.loans || []).some(l => l.party === p.id));
  const borrowedLoans = (db.loans || []).filter(l => l.dir === 'taken');
  const extraExpenseAccounts = (db.accounts || []).filter(a =>
    a.t === 'E' && !['5700', '5800', '5100', '5200', '5400', '5300', '5000', '5500', '5600', '2000', '2100', '3100'].includes(a.code)
  );

  const bankMethods = [
    'Bank Transfer / NEFT / RTGS',
    'UPI',
    'Cheque',
    'Debit / Credit Card',
    'Other'
  ];

  // Derive existing values if editing
  const creditLine = existingEntry?.lines?.find(l => l.c > 0) || null;
  const existingAmt = creditLine ? (creditLine.c / 100).toFixed(2) : '';
  const existingDate = existingEntry ? existingEntry.date : today();
  const existingAcct = creditLine?.a || existingEntry?.meta?.acct || '1010';
  const existingRef = existingEntry?.meta?.ref || existingEntry?.ref || '';
  const existingDesc = existingEntry?.meta?.desc !== undefined ? existingEntry.meta.desc : (existingEntry?.narr || '');
  const existingMethod = existingEntry?.meta?.method || (existingAcct === '1000' ? 'Cash' : 'Bank Transfer / NEFT / RTGS');

  let detectedCat = 'operating';
  if (existingEntry?.meta?.cat === 'supplier' || existingEntry?.src === 'pay' || existingEntry?.lines?.some(l => l.a === '2000')) {
    detectedCat = 'supplier';
  } else if (existingEntry?.meta?.cat === 'loan' || existingEntry?.lines?.some(l => l.a === '2100' || l.a === '5500')) {
    detectedCat = 'loan';
  } else if (existingEntry?.meta?.customCat || existingEntry?.meta?.cat === 'other') {
    detectedCat = 'other';
  } else if (existingEntry?.meta?.cat === 'operating' || existingEntry?.meta?.opAcc || existingEntry?.lines?.some(l => ['5700', '5800', '5100', '5200', '5400', '5300', '1300'].includes(l.a))) {
    detectedCat = 'operating';
  } else {
    detectedCat = 'operating';
  }

  // Operating fields
  const existingOpAcc = existingEntry?.meta?.opAcc || existingEntry?.lines?.find(l => l.d > 0 && l.a !== '1300')?.a || '5700';
  const existingOpPayee = existingEntry?.meta?.payee || existingEntry?.meta?.partyName || '';
  const existingOpGstRate = existingEntry?.meta?.gstRate !== undefined ? String(existingEntry.meta.gstRate) : '0';

  // Supplier fields
  const existingSupplierId = existingEntry?.meta?.party || existingEntry?.lines?.find(l => l.p)?.p || '';
  const existingSupplierName = existingEntry?.meta?.partyName || '';
  const existingBillId = existingEntry?.meta?.billId || '';
  const isCustomSupplier = existingSupplierId === '__CUSTOM__' || (existingSupplierName && !suppliers.some(p => p.id === existingSupplierId));

  // Loan fields
  const existingLoanId = existingEntry?.meta?.loanId || (existingEntry?.meta?.party ? 'party_' + existingEntry.meta.party : '');
  const existingPrincipal = existingEntry?.meta?.principal !== undefined ? (existingEntry.meta.principal / 100).toFixed(2) : (existingEntry?.lines?.find(l => l.a === '2100')?.d ? (existingEntry.lines.find(l => l.a === '2100').d / 100).toFixed(2) : '');
  const existingInterest = existingEntry?.meta?.interest !== undefined ? (existingEntry.meta.interest / 100).toFixed(2) : (existingEntry?.lines?.find(l => l.a === '5500')?.d ? (existingEntry.lines.find(l => l.a === '5500').d / 100).toFixed(2) : '');
  const existingLenderName = existingEntry?.meta?.partyName || '';
  const isCustomLender = existingLoanId === '__CUSTOM__' || (existingLenderName && !lenders.some(p => p.id === existingLoanId) && !borrowedLoans.some(l => l.id === existingLoanId));

  // Other fields
  const existingOtherPayee = existingEntry?.meta?.payee || '';
  const existingCustomCat = existingEntry?.meta?.customCat || existingEntry?.meta?.catName || '';

  form(isEdit ? `Edit Payment Voucher (${existingEntry.ref})` : 'Money Out (Record Payment)',
    `<div class="two">
      ${fld('date', 'Date', 'date', existingDate, 1)}
      
      <div style="display:flex; flex-direction:column; gap:4px;">
        <label>Paid From Account *
          <select name="acct" id="txn_acct" required>
            ${accOpts(a => a.cash, existingAcct)}
          </select>
        </label>
        <div id="txn_cash_bal_hint" style="font-size:12px; color:var(--t2); padding-left:2px; display:none;"></div>
      </div>

      <label style="grid-column: 1 / -1;">Expense / Payment Category *
        <select name="cat" id="txn_cat" required>
          <option value="operating"${detectedCat === 'operating' ? ' selected' : ''}>Operating / Setup Expense</option>
          <option value="supplier"${detectedCat === 'supplier' ? ' selected' : ''}>Supplier Payment</option>
          <option value="loan"${detectedCat === 'loan' ? ' selected' : ''}>Loan Repayment / EMI</option>
          <option value="other"${detectedCat === 'other' ? ' selected' : ''}>Other Miscellaneous Expense</option>
        </select>
      </label>

      <!-- Insufficient Cash Warning Banner -->
      <div id="cash_insufficient_warn" style="grid-column: 1 / -1; display:none; background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:10px 14px; font-size:12.5px; color:#991b1b;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:16px;">⚠️</span>
          <b id="cash_warn_text">Insufficient cash in hand balance. Please deposit funds or pay via Bank Account.</b>
        </div>
      </div>

      <!-- Section 1: Operating / Setup Expense -->
      <div id="sec_operating" style="grid-column: 1 / -1; display: ${detectedCat === 'operating' ? 'flex' : 'none'}; flex-direction: column; gap: 8px;">
        <label>Payee / Service Provider Name
          <input type="text" name="op_payee" id="txn_op_payee" value="${esc(existingOpPayee)}" placeholder="e.g. Rinku Toppo, Legal Services, Landlord, Power Utility...">
        </label>
        <label>Expense Ledger Account *
          <select name="op_acc" id="txn_op_acc" required>
            <option value="5700"${existingOpAcc === '5700' ? ' selected' : ''}>5700 - Licenses & Permits / Registration Expense</option>
            <option value="5800"${existingOpAcc === '5800' ? ' selected' : ''}>5800 - Legal, GST & Compliance Charges</option>
            <option value="5100"${existingOpAcc === '5100' ? ' selected' : ''}>5100 - Rent Expense (Operational)</option>
            <option value="5200"${existingOpAcc === '5200' ? ' selected' : ''}>5200 - Transport Expense (Operational)</option>
            <option value="5400"${existingOpAcc === '5400' ? ' selected' : ''}>5400 - Utilities / Electricity & Water</option>
            <option value="5300"${existingOpAcc === '5300' ? ' selected' : ''}>5300 - Salaries & Wages</option>
            ${extraExpenseAccounts.map(a => `<option value="${a.code}"${a.code === existingOpAcc ? ' selected' : ''}>${a.code} - ${esc(a.name)}</option>`).join('')}
          </select>
        </label>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
          <label>GST % (Input Tax Credit)
            <select name="op_gst_rate" id="txn_op_gst_rate">
              <option value="0"${existingOpGstRate === '0' ? ' selected' : ''}>0% (Nil / Exempt / Non-GST)</option>
              <option value="5"${existingOpGstRate === '5' ? ' selected' : ''}>5%</option>
              <option value="12"${existingOpGstRate === '12' ? ' selected' : ''}>12%</option>
              <option value="18"${existingOpGstRate === '18' ? ' selected' : ''}>18%</option>
              <option value="28"${existingOpGstRate === '28' ? ' selected' : ''}>28%</option>
            </select>
          </label>
          <div id="op_calc_summary" style="background:#f8fafc; border:1px solid var(--bd); border-radius:8px; padding:6px 10px; font-size:12px; display:flex; flex-direction:column; justify-content:center;">
            <span style="color:var(--t2);">Base: <b id="op_disp_base">₹0.00</b> | Input GST: <b id="op_disp_gst">₹0.00</b></span>
          </div>
        </div>
      </div>

      <!-- Section 2: Supplier Payment -->
      <div id="sec_supplier" style="grid-column: 1 / -1; display: ${detectedCat === 'supplier' ? 'flex' : 'none'}; flex-direction: column; gap: 8px;">
        <label>Supplier / Payee (Mandatory) *
          <select name="supplier_id" id="txn_supplier_id">
            <option value="">-- Select Active Supplier --</option>
            ${suppliers.map(p => `<option value="${p.id}"${p.id === existingSupplierId ? ' selected' : ''}>${esc(p.name)}${p.phone ? ' (' + esc(p.phone) + ')' : ''}</option>`).join('')}
            <option value="__CUSTOM__"${isCustomSupplier ? ' selected' : ''}>➕ Enter custom supplier name...</option>
          </select>
        </label>
        <div id="txn_custom_supplier_wrap" style="display:${isCustomSupplier ? 'block' : 'none'}">
          <label>Payment to (Name of person or Business) *
            <input type="text" name="custom_supplier" id="txn_custom_supplier" value="${esc(existingSupplierName)}" placeholder="Type person or business name...">
          </label>
        </div>
        <label>Pending Purchase Bill Reference
          <select name="bill_ref" id="txn_bill_ref">
            <option value="">-- Select a supplier above to load pending bills --</option>
          </select>
        </label>
        <div id="bill_due_hint" style="font-size:12px;color:var(--t2);margin-top:-2px;display:none;"></div>
      </div>

      <!-- Section 3: Loan Repayment / EMI -->
      <div id="sec_loan" style="grid-column: 1 / -1; display: ${detectedCat === 'loan' ? 'flex' : 'none'}; flex-direction: column; gap: 8px;">
        <label>Lender Name / Loan Account *
          <select name="loan_id" id="txn_loan_id">
            <option value="">-- Select Lender / Loan Account --</option>
            ${borrowedLoans.map(l => `<option value="${l.id}"${l.id === existingLoanId ? ' selected' : ''}>${esc(l.ref || l.name)} · Lender: ${esc(l.partyName || pn(l.party))}</option>`).join('')}
            ${lenders.map(p => `<option value="party_${p.id}"${('party_' + p.id) === existingLoanId ? ' selected' : ''}>Lender: ${esc(p.name)}</option>`).join('')}
            <option value="__CUSTOM__"${isCustomLender ? ' selected' : ''}>➕ Other Lender...</option>
          </select>
        </label>
        <div id="txn_custom_loan_wrap" style="display:${isCustomLender ? 'block' : 'none'}">
          <label>Custom Lender Name *
            <input type="text" name="custom_lender" id="txn_custom_lender" value="${esc(existingLenderName)}" placeholder="Type lender name...">
          </label>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
          <label>Principal Repayment (₹)
            <input type="number" step="any" min="0" name="loan_principal" id="txn_loan_principal" value="${existingPrincipal}" placeholder="0.00">
          </label>
          <label>Interest Paid (₹)
            <input type="number" step="any" min="0" name="loan_interest" id="txn_loan_interest" value="${existingInterest}" placeholder="0.00">
          </label>
        </div>
        <div id="loan_split_hint" style="font-size:12px; color:var(--t2); padding-left:2px;">
          Enter Principal and/or Interest. Total Amount Paid will auto-calculate.
        </div>
      </div>

      <!-- Section 4: Other Miscellaneous Expense -->
      <div id="sec_other" style="grid-column: 1 / -1; display: ${detectedCat === 'other' ? 'flex' : 'none'}; flex-direction: column; gap: 8px;">
        <label>Payee / Vendor Name (Optional)
          <input type="text" name="other_payee" id="txn_other_payee" value="${esc(existingOtherPayee)}" placeholder="e.g. Local shop, contractor, vendor...">
        </label>
        <label>Expense Category / Description *
          <input type="text" name="custom_cat" id="txn_custom_cat" value="${esc(existingCustomCat)}" placeholder="Enter custom Expense / Payment Category (e.g. Repairs, Office Supplies)...">
        </label>
      </div>

      <!-- Payment Method Wrap -->
      <div id="txn_method_wrap" style="grid-column: 1 / -1;">
        <label>Payment Method
          <select name="method" id="txn_method">
            ${bankMethods.map(m => `<option value="${m}"${m === existingMethod ? ' selected' : ''}>${m}</option>`).join('')}
          </select>
        </label>
      </div>

      <!-- Standard Amount and Reference No. in ONE LINE -->
      <div class="amt-ref-row" id="amt_ref_row">
        <div id="std_amt_wrap">
          <label id="std_amt_label">Total Amount Paid (₹) *
            <input type="number" step="any" min="0.01" name="amt" id="txn_amt" value="${existingAmt}" placeholder="0.00" required>
          </label>
        </div>

        <div id="txn_ref_wrap">
          <label id="txn_ref_label">Reference No. (UTR / Cheque No. / Txn ID)
            <input type="text" name="ref" id="txn_ref" value="${esc(existingRef)}" placeholder="e.g. UTR / Cheque / Txn ID">
          </label>
        </div>
      </div>

      <!-- Description / Notes -->
      <label style="grid-column: 1 / -1;" id="txn_desc_label">Description / Notes
        <textarea name="desc" id="txn_desc" rows="2" placeholder="Itemized details, material type, quantity, or specific context...">${esc(existingDesc)}</textarea>
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

      // Validate liquidity
      let outflowPaisa = 0;
      if (cat === 'loan' && (v.loan_principal || v.loan_interest)) {
        outflowPaisa = (v.loan_principal ? P(v.loan_principal) : 0) + (v.loan_interest ? P(v.loan_interest) : 0);
      } else {
        outflowPaisa = P(v.amt || '0');
      }
      if (outflowPaisa <= 0) throw Error('Total amount paid must be above zero');

      if (isCash) {
        const addedBack = (isEdit && existingAcct === '1000' && creditLine) ? creditLine.c : 0;
        const curCash = net('1000') + addedBack;
        if (outflowPaisa > curCash) {
          throw Error(`Insufficient cash in hand balance. Available: ${fmt(Math.max(0, curCash))}. Please deposit funds or pay via Bank Account.`);
        }
      }

      if (isEdit) {
        // Rollback previous bill allocation if applicable
        const prevBills = (db.docs || []).filter(d => d.type === 'bill' && d.pays?.some(p => p.je === existingEntry.id));
        prevBills.forEach(b => {
          b.pays = b.pays.filter(p => p.je !== existingEntry.id);
          const paidSum = b.pays.reduce((s, p) => s + (p.amt || 0), 0);
          b.paid = paidSum;
        });

        // Rollback previous loan repayment if applicable
        const prevLoanId = existingEntry.meta?.loanId;
        const prevPrinc = existingEntry.meta?.principal || (existingEntry.lines?.find(l => l.a === '2100')?.d || 0);
        if (prevLoanId && prevPrinc > 0) {
          const prevLoan = (db.loans || []).find(l => l.id === prevLoanId);
          if (prevLoan) {
            prevLoan.repaid = Math.max(0, (prevLoan.repaid || 0) - prevPrinc);
          }
        }
      }

      if (cat === 'operating') {
        // 1. Operating / Setup Expense
        const opAcc = v.op_acc || '5700';
        const opRate = parseFloat(v.op_gst_rate || 0);
        const payeeName = (v.op_payee || '').trim();
        const catName = an(opAcc);

        let partyId = '';
        if (payeeName) {
          let existingP = db.parties.find(p => p.name.trim().toLowerCase() === payeeName.toLowerCase());
          if (!existingP) {
            existingP = {
              id: uid(),
              name: payeeName,
              type: 'other',
              phone: '',
              gstin: '',
              state: db.biz.state || 'Odisha',
              terms: '0'
            };
            db.parties.push(existingP);
          } else if (existingP.type === 'supplier' && !db.docs.some(d => d.party === existingP.id && d.type === 'bill')) {
            existingP.type = 'other';
          }
          partyId = existingP.id;
        }

        const lines = [];
        let basePaisa = outflowPaisa;
        let gstPaisa = 0;
        if (opRate > 0) {
          basePaisa = Math.round(outflowPaisa * 100 / (100 + opRate));
          gstPaisa = outflowPaisa - basePaisa;
          lines.push({ a: opAcc, d: basePaisa, c: 0, p: partyId });
          lines.push({ a: '1300', d: gstPaisa, c: 0, p: partyId }); // Input GST Credit
        } else {
          lines.push({ a: opAcc, d: basePaisa, c: 0, p: partyId });
        }
        lines.push({ a: v.acct, d: 0, c: outflowPaisa, p: partyId });

        const narr = userDesc
          ? (payeeName ? `${payeeName} - ${userDesc}` : userDesc)
          : (payeeName ? `${payeeName} - ${catName}` : catName);

        postedEnt = post({
          id: isEdit ? existingEntry.id : undefined,
          ref: isEdit ? existingEntry.ref : undefined,
          date: v.date,
          src: 'out',
          narr: narr,
          meta: {
            ...(isEdit ? existingEntry.meta : {}),
            method: finalMethod,
            ref: userRef,
            acct: v.acct,
            cat: opAcc,
            catName: 'Operating / Setup Expense',
            opAcc: opAcc,
            base: basePaisa,
            gst: gstPaisa,
            gstRate: opRate,
            payee: payeeName,
            party: partyId,
            partyName: payeeName,
            desc: userDesc
          },
          lines: lines
        });
      } else if (cat === 'supplier') {
        // 2. Supplier Payment (Accounts Payable)
        let supplierId = '';
        let supplierName = '';
        if (v.supplier_id === '__CUSTOM__') {
          const customName = (v.custom_supplier || '').trim();
          if (!customName) throw Error('Please enter Payment to (Name of person or Business)');
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

        const selectedBill = v.bill_ref ? db.docs.find(d => d.id === v.bill_ref) : null;
        const billNo = selectedBill ? (selectedBill.sno || selectedBill.no) : '';

        const narr = userDesc
          ? `${supplierName} - ${userDesc}`
          : (billNo ? `${supplierName} - Payment for Bill ${billNo}` : `${supplierName} - Supplier Payment`);

        const pJe = postedEnt = post({
          id: isEdit ? existingEntry.id : undefined,
          ref: isEdit ? existingEntry.ref : undefined,
          date: v.date,
          src: 'out',
          narr: narr,
          meta: {
            ...(isEdit ? existingEntry.meta : {}),
            method: finalMethod,
            ref: userRef || billNo,
            docNo: billNo,
            billId: selectedBill ? selectedBill.id : '',
            acct: v.acct,
            cat: '2000',
            catName: 'Supplier Payment',
            party: supplierId,
            partyName: supplierName,
            desc: userDesc
          },
          lines: [
            { a: '2000', d: outflowPaisa, c: 0, p: supplierId },
            { a: v.acct, d: 0, c: outflowPaisa, p: supplierId }
          ]
        });

        if (selectedBill) {
          if (!selectedBill.pays) selectedBill.pays = [];
          const curBal = Math.max(0, out(selectedBill));
          const appliedAmt = Math.min(outflowPaisa, curBal);
          selectedBill.pays.push({
            je: pJe.id,
            amt: appliedAmt,
            date: v.date,
            method: finalMethod,
            acct: v.acct
          });
          selectedBill.paid = (selectedBill.total || 0) - Math.max(0, curBal - appliedAmt);
        }
      } else if (cat === 'loan') {
        // 3. Loan Repayment / EMI (Principal + Interest)
        let princPaisa = v.loan_principal ? P(v.loan_principal) : 0;
        let intPaisa = v.loan_interest ? P(v.loan_interest) : 0;
        if (princPaisa === 0 && intPaisa === 0) {
          princPaisa = outflowPaisa;
        }

        let lenderName = '';
        let loanRef = '';
        let loanId = '';
        let partyId = '';

        if (v.loan_id === '__CUSTOM__') {
          lenderName = (v.custom_lender || '').trim();
          if (!lenderName) throw Error('Please enter Lender Name');
          let existingP = db.parties.find(p => p.name.trim().toLowerCase() === lenderName.toLowerCase());
          if (!existingP) {
            existingP = { id: uid(), name: lenderName, type: 'lender', phone: '', gstin: '', state: db.biz.state || 'Odisha', terms: '0' };
            db.parties.push(existingP);
          }
          partyId = existingP.id;
        } else if (v.loan_id && v.loan_id.startsWith('party_')) {
          partyId = v.loan_id.replace('party_', '');
          lenderName = pn(partyId);
        } else if (v.loan_id) {
          const ln = (db.loans || []).find(l => l.id === v.loan_id);
          if (ln) {
            loanId = ln.id;
            loanRef = ln.ref;
            partyId = ln.party;
            lenderName = ln.partyName || pn(ln.party) || ln.name;
          }
        }

        if (!lenderName) lenderName = 'Lender';

        const lines = [];
        if (princPaisa > 0) lines.push({ a: '2100', d: princPaisa, c: 0, p: partyId });
        if (intPaisa > 0) lines.push({ a: '5500', d: intPaisa, c: 0, p: partyId });
        lines.push({ a: v.acct, d: 0, c: outflowPaisa, p: partyId });

        const narr = userDesc
          ? (lenderName ? `${lenderName} - ${userDesc}` : userDesc)
          : `${lenderName} - Loan Repayment / EMI (Principal: ${fmt(princPaisa)}${intPaisa > 0 ? ', Interest: ' + fmt(intPaisa) : ''})`;

        postedEnt = post({
          id: isEdit ? existingEntry.id : undefined,
          ref: isEdit ? existingEntry.ref : undefined,
          date: v.date,
          src: 'out',
          narr: narr,
          meta: {
            ...(isEdit ? existingEntry.meta : {}),
            method: finalMethod,
            ref: userRef || loanRef,
            acct: v.acct,
            cat: '2100',
            catName: 'Loan Repayment / EMI',
            loanId: loanId,
            party: partyId,
            partyName: lenderName,
            principal: princPaisa,
            interest: intPaisa,
            desc: userDesc
          },
          lines: lines
        });

        if (loanId) {
          const loanObj = (db.loans || []).find(l => l.id === loanId);
          if (loanObj && princPaisa > 0) {
            loanObj.repaid = (loanObj.repaid || 0) + princPaisa;
            loanObj.last = v.date;
            if ((loanObj.principal || 0) - loanObj.repaid <= 0) loanObj.due = '';
          }
        }
      } else if (cat === 'other') {
        // 4. Other Miscellaneous Expense
        const customCatName = (v.custom_cat || '').trim();
        if (!customCatName) throw Error('Please enter the Expense Category / Description');

        const payee = (v.other_payee || '').trim();
        let partyId = '';
        if (payee) {
          let existingP = db.parties.find(p => p.name.trim().toLowerCase() === payee.toLowerCase());
          if (!existingP) {
            existingP = {
              id: uid(),
              name: payee,
              type: 'other',
              phone: '',
              gstin: '',
              state: db.biz.state || 'Odisha',
              terms: '0'
            };
            db.parties.push(existingP);
          } else if (existingP.type === 'supplier' && !db.docs.some(d => d.party === existingP.id && d.type === 'bill')) {
            existingP.type = 'other';
          }
          partyId = existingP.id;
        }

        const accountCode = getOrCreateExpenseAccount(customCatName);

        const narr = userDesc
          ? (payee ? `${payee} - ${userDesc}` : userDesc)
          : (payee ? `${payee} - ${customCatName}` : customCatName);

        postedEnt = post({
          id: isEdit ? existingEntry.id : undefined,
          ref: isEdit ? existingEntry.ref : undefined,
          date: v.date,
          src: 'out',
          narr: narr,
          meta: {
            ...(isEdit ? existingEntry.meta : {}),
            method: finalMethod,
            ref: userRef,
            acct: v.acct,
            cat: accountCode,
            catName: customCatName,
            customCat: customCatName,
            payee: payee,
            party: partyId,
            partyName: payee,
            desc: userDesc
          },
          lines: [
            { a: accountCode, d: outflowPaisa, c: 0, p: partyId },
            { a: v.acct, d: 0, c: outflowPaisa, p: partyId }
          ]
        });
      }

      if (outAttachments.length && postedEnt && postedEnt.id) {
        saveAttachments(postedEnt.id, outAttachments);
      }
    },
    isEdit ? 'Update Transaction' : 'Save Transaction',
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
      const secOperating = $('#sec_operating');
      const secSupplier = $('#sec_supplier');
      const secLoan = $('#sec_loan');
      const secOther = $('#sec_other');

      // Amount & Reference
      const amtInput = $('#txn_amt');
      const refInput = $('#txn_ref');
      const descInput = $('#txn_desc');

      // Operating fields
      const opAccSel = $('#txn_op_acc');
      const opGstRateSel = $('#txn_op_gst_rate');
      const dispBase = $('#op_disp_base');
      const dispGst = $('#op_disp_gst');

      // Supplier fields
      const supplierSel = $('#txn_supplier_id');
      const customSupWrap = $('#txn_custom_supplier_wrap');
      const customSupInput = $('#txn_custom_supplier');
      const billRefSel = $('#txn_bill_ref');
      const billDueHint = $('#bill_due_hint');

      // Loan fields
      const loanSel = $('#txn_loan_id');
      const customLoanWrap = $('#txn_custom_loan_wrap');
      const customLoanInput = $('#txn_custom_lender');
      const loanPrincInput = $('#txn_loan_principal');
      const loanIntInput = $('#txn_loan_interest');

      // Other fields
      const customCatInput = $('#txn_custom_cat');

      const cashHintEl = $('#txn_cash_bal_hint');
      const cashWarnEl = $('#cash_insufficient_warn');
      const cashWarnText = $('#cash_warn_text');

      function checkLiquidityWarn() {
        if (!acctEl) return;
        const code = acctEl.value;
        const isCash = code === '1000' || (acc(code)?.name || '').toLowerCase().includes('cash');
        const bal = net(code);
        const sb = $('#sb') || document.querySelector('#f button[type="submit"]') || document.querySelector('#f button.p');

        const currentExistingPaisa = (isEdit && code === existingAcct) ? (creditLine ? creditLine.c : 0) : 0;
        const effectiveBal = bal + currentExistingPaisa;

        if (cashHintEl) {
          cashHintEl.style.display = 'block';
          cashHintEl.innerHTML = `Available ${isCash ? 'Cash in Hand' : (acc(code)?.name || 'Account')}: <b style="color:${effectiveBal <= 0 ? '#dc2626' : '#0f5132'}">${fmt(effectiveBal)}</b>`;
        }

        let needed = 0;
        try { needed = P(amtInput?.value || '0'); } catch (e) {}

        if (needed > 0 && needed > effectiveBal) {
          if (cashWarnEl) cashWarnEl.style.display = 'block';
          if (cashWarnText) {
            cashWarnText.textContent = isCash
              ? 'Insufficient balance in Cash in Hand. Please deposit funds or pay via Bank Account.'
              : `Insufficient balance in ${acc(code)?.name || 'Bank Account'} (Available: ${fmt(Math.max(0, effectiveBal))}, Required: ${fmt(needed)}).`;
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

        const openBills = db.docs.filter(d => d.type === 'bill' && !d.cancelled && d.party === supId && (out(d) > 0 || (isEdit && d.pays?.some(p => p.je === existingEntry.id))));
        if (openBills.length > 0) {
          billRefSel.innerHTML = '<option value="">-- Select Pending Bill to Settle (Optional) --</option>' +
            openBills.map(b => {
              const due = (out(b) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 });
              const billNo = b.sno || b.no;
              const mat = b.mat || (b.lines && b.lines[0]?.n) || 'Goods';
              const isSelected = isEdit && (existingBillId === b.id || b.pays?.some(p => p.je === existingEntry.id));
              return `<option value="${esc(b.id)}" data-due="${(out(b) / 100).toFixed(2)}" data-no="${esc(billNo)}" data-mat="${esc(mat)}"${isSelected ? ' selected' : ''}>Bill #${esc(billNo)} (${esc(b.date)}) — Due: ₹${due} [${esc(mat)}]</option>`;
            }).join('');
        } else {
          billRefSel.innerHTML = '<option value="">-- No pending unpaid bills (On-Account Payment) --</option>';
          if (billDueHint) billDueHint.style.display = 'none';
        }
      }

      function calcOperationalGst() {
        if (!amtInput || !opGstRateSel || !dispBase || !dispGst) return;
        let tot = 0;
        try { tot = P(amtInput.value || '0'); } catch (e) {}
        const rate = parseFloat(opGstRateSel.value || 0);
        let b = tot;
        let g = 0;
        if (rate > 0) {
          b = Math.round(tot * 100 / (100 + rate));
          g = tot - b;
        }
        dispBase.textContent = fmt(b);
        dispGst.textContent = fmt(g);
        checkLiquidityWarn();
      }

      function syncLoanSplit() {
        const p = parseFloat(loanPrincInput?.value || 0);
        const i = parseFloat(loanIntInput?.value || 0);
        if (p > 0 || i > 0) {
          if (amtInput) amtInput.value = (p + i).toFixed(2);
        }
        checkLiquidityWarn();
      }

      function switchCategory() {
        const cat = catEl ? catEl.value : 'operating';

        // Hide all category sections first
        if (secOperating) secOperating.style.display = 'none';
        if (secSupplier) secSupplier.style.display = 'none';
        if (secLoan) secLoan.style.display = 'none';
        if (secOther) secOther.style.display = 'none';

        if (cat === 'operating') {
          // 1. Operating / Setup Expense
          if (secOperating) secOperating.style.display = 'flex';
          calcOperationalGst();
        } else if (cat === 'supplier') {
          // 2. Supplier Payment
          if (secSupplier) secSupplier.style.display = 'flex';
          updateBillOptions();
        } else if (cat === 'loan') {
          // 3. Loan Repayment / EMI
          if (secLoan) secLoan.style.display = 'flex';
          if (loanPrincInput && !loanPrincInput.value && amtInput?.value) {
            loanPrincInput.value = amtInput.value;
          }
        } else if (cat === 'other') {
          // 4. Other Miscellaneous Expense
          if (secOther) secOther.style.display = 'flex';
          if (customCatInput && !isEdit) customCatInput.focus();
        }
        checkLiquidityWarn();
      }

      if (acctEl) acctEl.onchange = syncAcctMethod;
      syncAcctMethod();

      if (catEl) catEl.onchange = switchCategory;
      switchCategory();

      if (isEdit) {
        if (methSel && existingMethod) methSel.value = existingMethod;
        if (existingBillId && billRefSel) billRefSel.value = existingBillId;
      }

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

      if (loanPrincInput) loanPrincInput.oninput = syncLoanSplit;
      if (loanIntInput) loanIntInput.oninput = syncLoanSplit;

      if (amtInput) {
        amtInput.oninput = () => {
          if (catEl?.value === 'operating') {
            calcOperationalGst();
          } else if (catEl?.value === 'loan') {
            const tot = parseFloat(amtInput?.value || 0);
            const curI = parseFloat(loanIntInput?.value || 0);
            if (loanPrincInput) {
              loanPrincInput.value = Math.max(0, tot - curI).toFixed(2);
            }
          }
          checkLiquidityWarn();
        };
      }

      if (opGstRateSel) {
        opGstRateSel.onchange = calcOperationalGst;
      }
    }
  );
}

export function txnForm(kind, existingEntry = null) {
  if (kind === 'out') {
    return moneyOutForm(existingEntry);
  }
  return moneyInForm(existingEntry);
}

export function newExpForm(existingEntry = null) {
  return moneyOutForm(existingEntry);
}

export function newTransferForm(existingEntry = null) {
  const isEdit = !!(existingEntry && existingEntry.id);
  const cashAccounts = db.accounts.filter(a => a.cash);
  const creditLine = existingEntry?.lines?.find(l => l.c > 0) || null;
  const debitLine = existingEntry?.lines?.find(l => l.d > 0) || null;
  const defaultFrom = creditLine?.a || '1000'; // Cash in Hand
  const defaultTo = debitLine?.a || cashAccounts.find(a => a.code !== defaultFrom)?.code || '1010'; // Bank Account
  const existingAmt = creditLine ? (creditLine.c / 100).toFixed(2) : '';
  const existingDate = existingEntry ? existingEntry.date : today();
  const existingRef = existingEntry?.meta?.ref || '';
  const existingDesc = existingEntry?.meta?.desc !== undefined ? existingEntry.meta.desc : (existingEntry?.narr || '');

  const svgIcons = {
    bank: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-building-bank"><path d="M3 21h18"/><path d="M3 10h18"/><path d="M5 6l7-3 7 3"/><path d="M4 10v11"/><path d="M20 10v11"/><path d="M8 14v4"/><path d="M12 14v4"/><path d="M16 14v4"/></svg>`,
    wallet: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-wallet"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>`,
    transfer: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-arrow-right-left"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>`,
    warning: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-alert-circle"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
  };

  form(isEdit ? `Edit Transfer (${existingEntry.ref})` : 'Transfer Money (Contra Voucher)',
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
            <input type="date" name="date" id="xfer_date" class="xfer-input with-prefix-icon" value="${existingDate}" required>
          </div>
        </div>

        <!-- Transfer Amount Field -->
        <div class="xfer-field">
          <label class="xfer-label" for="xfer_amt">
            Transfer Amount (₹) <span class="xfer-req">*</span>
          </label>
          <div class="xfer-input-wrap">
            <span class="xfer-input-prefix-currency" aria-hidden="true">₹</span>
            <input type="number" name="amt" id="xfer_amt" class="xfer-input with-prefix-currency" min="0.01" step="any" value="${existingAmt}" placeholder="0.00" required>
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
            <input type="text" name="ref" id="xfer_ref" class="xfer-input with-prefix-icon" value="${esc(existingRef)}" placeholder="e.g. UTR / Cheque / ATM ID">
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
          <textarea name="desc" id="xfer_desc" class="xfer-textarea" rows="2" placeholder="Optional notes (e.g. Counter cash deposit to SBI, ATM withdrawal for petty cash)...">${esc(existingDesc)}</textarea>
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
      const addedBack = (isEdit && v.from === creditLine?.a) ? creditLine.c : 0;
      const fromBal = net(v.from) + addedBack;
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
        id: isEdit ? existingEntry.id : undefined,
        ref: isEdit ? existingEntry.ref : undefined,
        date: v.date,
        src: 'xfer',
        narr: narr,
        meta: {
          ...(isEdit ? existingEntry.meta : {}),
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
    isEdit ? 'Update Transfer' : 'Confirm Transfer',
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
        const addedBack = (isEdit && fromCode === creditLine?.a) ? creditLine.c : 0;
        const fromBal = net(fromCode) + addedBack;
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
            type: 'lender',
            phone: '',
            gstin: '',
            state: db.biz.state || 'Odisha',
            terms: '0'
          };
          db.parties.push(existing);
        } else if (existing.type === 'supplier' && !db.docs.some(d => d.party === existing.id && d.type === 'bill')) {
          existing.type = 'lender';
        }
        partyId = existing.id;
        partyName = existing.name;
      } else {
        if (!partyId) throw Error('Please select or enter a lender/borrower');
        const p = db.parties.find(x => x.id === partyId);
        if (p && p.type === 'supplier' && !db.docs.some(d => d.party === p.id && d.type === 'bill')) {
          p.type = 'lender';
        }
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

  // Snapshot before attempting mutation: abort without deleting if any reversal fails
  const snapshot = JSON.parse(JSON.stringify(db));

  try {
    // Reverse all journal entries associated with this loan
    const entries = db.entries.filter(e => e.meta && e.meta.loan === id);
    for (const e of entries) {
      if (e.status === 'posted') {
        reverse(e.id);
      }
    }

    // Remove loan
    db.loans = db.loans.filter(x => x.id !== id);

    // Recompute party type after removal - do not leave party typed 'lender'
    syncPartyClassifications(db);

    save();
    toast(`Loan ${l.name || l.ref} deleted`);
    window.location.hash = '#/loans';
    window.dispatchEvent(new CustomEvent('bufin-render'));
  } catch (err) {
    setDb(snapshot);
    toast('Cannot delete loan: ' + (err.message || err));
  }
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


export function buildAllBackupFiles() {
  const escCsv = val => {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };

  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const dStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const files = [];

  // 1. Chart of Accounts
  const coaRows = [['Account Code', 'Account Name', 'Type Code', 'Account Type', 'Is Cash/Bank', 'Current Balance (₹)']];
  for (const a of (db.accounts || [])) {
    const b = net(a.code);
    coaRows.push([
      a.code,
      a.name,
      a.t,
      TN[a.t] || a.t,
      a.cash ? 'Yes' : 'No',
      (b / 100).toFixed(2)
    ]);
  }
  files.push({ name: `02_chart_of_accounts_${dStr}.csv`, data: coaRows.map(r => r.map(escCsv).join(',')).join('\n') });

  // 2. Journal Entries (all lines)
  const jeRows = [['Date', 'Journal Ref', 'Source Type', 'Account Code', 'Account Name', 'Debit (₹)', 'Credit (₹)', 'Party Name', 'Narration', 'Status']];
  for (const e of (db.entries || [])) {
    for (const l of (e.lines || [])) {
      jeRows.push([
        e.date,
        e.ref,
        e.src || 'jv',
        l.a,
        an(l.a),
        l.d ? (l.d / 100).toFixed(2) : '0.00',
        l.c ? (l.c / 100).toFixed(2) : '0.00',
        pn(l.p),
        e.narr || '',
        e.status || 'posted'
      ]);
    }
  }
  files.push({ name: `01_journal_entries_${dStr}.csv`, data: jeRows.map(r => r.map(escCsv).join(',')).join('\n') });

  // 3. Sales Invoices
  const saleRows = [['Invoice No', 'Date', 'Due Date', 'Customer Name', 'Customer Phone', 'Customer GSTIN', 'Taxable Base (₹)', 'GST Amount (₹)', 'Total Amount (₹)', 'Paid Amount (₹)', 'Balance Due (₹)', 'Payment Status', 'Payment Mode', 'Notes']];
  for (const d of (db.docs || []).filter(x => (x.type || x.t) === 'sale')) {
    const paidAmt = (d.pays || []).reduce((s, p) => s + (p.a || 0), 0);
    const outAmt = (d.total || 0) - paidAmt;
    const status = d.cancelled ? 'Cancelled' : outAmt <= 0 ? 'Paid' : paidAmt > 0 ? 'Partial' : 'Open';
    saleRows.push([
      d.no || '',
      d.date || '',
      d.due || '',
      d.c?.n || pn(d.party) || '',
      d.c?.p || '',
      d.c?.g || '',
      d.base ? (d.base / 100).toFixed(2) : '0.00',
      d.gst ? (d.gst / 100).toFixed(2) : '0.00',
      d.total ? (d.total / 100).toFixed(2) : '0.00',
      (paidAmt / 100).toFixed(2),
      (outAmt / 100).toFixed(2),
      status,
      d.pm || '',
      d.nt || ''
    ]);
  }
  files.push({ name: `03_sales_invoices_${dStr}.csv`, data: saleRows.map(r => r.map(escCsv).join(',')).join('\n') });

  // 4. Purchase Bills
  const billRows = [['Bill No', 'Supplier Invoice No', 'Date', 'Due Date', 'Supplier Name', 'Material Description', 'Quantity', 'Unit', 'Rate (₹)', 'Taxable Base (₹)', 'GST Amount (₹)', 'Total Amount (₹)', 'Paid Amount (₹)', 'Status', 'Cloud Receipt Link']];
  for (const d of (db.docs || []).filter(x => (x.type || x.t) === 'bill')) {
    const paidAmt = (d.pays || []).reduce((s, p) => s + (p.a || 0), 0);
    const outAmt = (d.total || 0) - paidAmt;
    const status = d.cancelled ? 'Cancelled' : outAmt <= 0 ? 'Paid' : paidAmt > 0 ? 'Partial' : 'Open';
    const fileUrl = (d.files || []).map(f => f.url).filter(Boolean).join(' | ');
    billRows.push([
      d.no || '',
      d.sno || '',
      d.date || '',
      d.due || '',
      d.sup || pn(d.party) || '',
      d.mat || '',
      d.q || '',
      d.u || '',
      d.r || '',
      d.base ? (d.base / 100).toFixed(2) : '0.00',
      d.gst ? (d.gst / 100).toFixed(2) : '0.00',
      d.total ? (d.total / 100).toFixed(2) : '0.00',
      (paidAmt / 100).toFixed(2),
      status,
      fileUrl
    ]);
  }
  files.push({ name: `04_purchase_bills_${dStr}.csv`, data: billRows.map(r => r.map(escCsv).join(',')).join('\n') });

  // 5. Parties Directory
  const partyRows = [['Party ID', 'Party Name', 'Party Type', 'Mobile Phone', 'GSTIN', 'State', 'Address', 'City']];
  for (const p of (db.parties || [])) {
    partyRows.push([
      p.id,
      p.name,
      p.type || 'both',
      p.phone || '',
      p.gstin || '',
      p.state || '',
      p.addr || '',
      p.city || ''
    ]);
  }
  files.push({ name: `05_parties_directory_${dStr}.csv`, data: partyRows.map(r => r.map(escCsv).join(',')).join('\n') });

  // 6. Inventory Items
  const itemRows = [['Item Name', 'HSN / SAC Code', 'Default Unit', 'Standard Rate (₹)']];
  for (const it of (db.items || [])) {
    itemRows.push([
      it.n || '',
      it.h || '',
      it.u || 'kg',
      it.r ? Number(it.r).toFixed(2) : '0.00'
    ]);
  }
  files.push({ name: `06_inventory_items_${dStr}.csv`, data: itemRows.map(r => r.map(escCsv).join(',')).join('\n') });

  // 7. Cash and Bank Book
  const cashAccounts = (db.accounts || []).filter(a => a.cash).map(a => a.code);
  const cbRows = [['Date', 'Reference', 'Account Code', 'Account Name', 'Party Name', 'Narration', 'Money In (₹)', 'Money Out (₹)']];
  for (const e of sortEntries(db.entries || [])) {
    for (const l of (e.lines || [])) {
      if (cashAccounts.includes(l.a)) {
        cbRows.push([
          e.date,
          e.ref,
          l.a,
          an(l.a),
          pn(l.p),
          e.narr || '',
          l.d ? (l.d / 100).toFixed(2) : '0.00',
          l.c ? (l.c / 100).toFixed(2) : '0.00'
        ]);
      }
    }
  }
  files.push({ name: `07_cash_and_bank_book_${dStr}.csv`, data: cbRows.map(r => r.map(escCsv).join(',')).join('\n') });

  // 8. Loans Register
  const loanRows = [['Loan ID', 'Loan Reference', 'Loan Name', 'Direction', 'Party Name', 'Principal (₹)', 'Repaid (₹)', 'Outstanding (₹)', 'Annual Rate (%)', 'Date', 'Due Date', 'Status', 'Notes']];
  for (const l of (db.loans || [])) {
    const outPrinc = (l.principal || 0) - (l.repaid || 0);
    const status = outPrinc <= 0 ? 'Closed' : l.due && l.due < today() ? 'Overdue' : 'Active';
    loanRows.push([
      l.id,
      l.ref || '',
      l.name || '',
      l.dir || 'taken',
      l.partyName || pn(l.party) || '',
      (l.principal / 100).toFixed(2),
      (l.repaid / 100).toFixed(2),
      (outPrinc / 100).toFixed(2),
      l.rate || '',
      l.date || '',
      l.due || '',
      status,
      l.notes || ''
    ]);
  }
  files.push({ name: `08_loans_register_${dStr}.csv`, data: loanRows.map(r => r.map(escCsv).join(',')).join('\n') });

  // 9. Master Combined Transactions (ALL DATA CONSOLIDATED)
  const masterRows = [['Date', 'Reference No', 'Transaction Category', 'Primary Party', 'Account Code', 'Account Name', 'Debit Amount (₹)', 'Credit Amount (₹)', 'Narration / Description', 'Status']];
  for (const e of sortEntries(db.entries || [])) {
    const cat = e.src === 'sale' ? 'Sales Invoice'
      : e.src === 'bill' ? 'Purchase Bill'
      : e.src === 'open' ? 'Opening Balance'
      : e.src === 'pay' ? 'Payment'
      : e.src === 'trf' ? 'Transfer'
      : 'Journal Entry';
    for (const l of (e.lines || [])) {
      masterRows.push([
        e.date,
        e.ref,
        cat,
        pn(l.p),
        l.a,
        an(l.a),
        l.d ? (l.d / 100).toFixed(2) : '0.00',
        l.c ? (l.c / 100).toFixed(2) : '0.00',
        e.narr || '',
        e.status || 'posted'
      ]);
    }
  }
  files.push({ name: `00_all_transactions_master_combined_${dStr}.csv`, data: masterRows.map(r => r.map(escCsv).join(',')).join('\n') });

  // 10. Complete System Backup JSON (for instant 1-click restore)
  files.push({
    name: `bufin_system_backup_state_${dStr}.json`,
    data: JSON.stringify(db, null, 2)
  });

  // 11. Readme summary file
  const readmeText = `=====================================================
BUFIN COMPLETE LEDGER BACKUP ARCHIVE
Business Name: ${db.biz.name || ''}
Proprietor:    ${db.biz.owner || ''}
GSTIN:         ${db.biz.gstin || ''}
Export Date:   ${now.toLocaleString('en-IN')}
=====================================================

CONTENTS OF THIS ZIP BACKUP:
1. 00_all_transactions_master_combined_${dStr}.csv
   -> Consolidated master spreadsheet combining all debits, credits, and transactions across every account.
2. 01_journal_entries_${dStr}.csv
   -> Full double-entry general journal with line-by-line debits and credits.
3. 02_chart_of_accounts_${dStr}.csv
   -> Complete Chart of Accounts with account codes, categories, and balances.
4. 03_sales_invoices_${dStr}.csv
   -> All sales invoices, customer details, GST split, payment status.
5. 04_purchase_bills_${dStr}.csv
   -> All purchase bills, scrap weighbridge slips, supplier details, and Cloudinary receipt links.
6. 05_parties_directory_${dStr}.csv
   -> Customers, suppliers, and contacts directory with GSTIN and phone numbers.
7. 06_inventory_items_${dStr}.csv
   -> Product catalog, HSN/SAC codes, and standard rates.
8. 07_cash_and_bank_book_${dStr}.csv
   -> Dedicated cash and bank ledger statement.
9. 08_loans_register_${dStr}.csv
   -> Borrowed/lent loans, EMI schedules, and principal tracking.
10. bufin_system_backup_state_${dStr}.json
   -> Native system state file. Can be restored directly into BUFIN anytime!

HOW TO USE:
- Open any .csv file in Microsoft Excel, Google Sheets, LibreOffice, or Apple Numbers.
- To restore your data into BUFIN, go to Settings -> Restore Backup and select either this .zip file or the .json file inside.
=====================================================`;
  files.push({ name: `README_BACKUP_SUMMARY.txt`, data: readmeText });

  return { files, dStr };
}

export function showBackupModal() {
  const stats = [
    {
      label: 'Accounts',
      count: db.accounts.length,
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path><path d="M6 6h10"></path><path d="M6 10h10"></path></svg>`
    },
    {
      label: 'Journal Entries',
      count: db.entries.length,
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`
    },
    {
      label: 'Parties',
      count: db.parties.length,
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>`
    },
    {
      label: 'Sales Invoices',
      count: (db.docs || []).filter(x => (x.type || x.t) === 'sale').length,
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z"></path><line x1="8" y1="8" x2="16" y2="8"></line><line x1="8" y1="12" x2="16" y2="12"></line><line x1="8" y1="16" x2="12" y2="16"></line></svg>`
    },
    {
      label: 'Purchase Bills',
      count: (db.docs || []).filter(x => (x.type || x.t) === 'bill').length,
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"></path><path d="M3 6h18"></path><path d="M16 10a4 4 0 0 1-8 0"></path></svg>`
    },
    {
      label: 'Inventory Items',
      count: (db.items || []).length,
      icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path><path d="m3.3 7 8.7 5 8.7-5"></path><path d="M12 22V12"></path></svg>`
    }
  ];

  const jsonStr = JSON.stringify(db, null, 2);

  const statsHtml = stats.map(s => `
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px 12px;display:flex;justify-content:space-between;align-items:center;">
      <div style="display:flex;align-items:center;gap:6px;">
        ${s.icon}
        <span style="font-size:12px;color:#64748b;font-weight:500;">${s.label}</span>
      </div>
      <b style="font-size:13px;color:#0f172a;font-variant-numeric:tabular-nums;">${s.count}</b>
    </div>
  `).join('');

  modal(`
    <div style="padding:4px 0;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <div style="width:38px;height:38px;border-radius:10px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="20" height="5" x="2" y="3" rx="1"/>
            <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/>
            <path d="M10 12h4"/>
          </svg>
        </div>
        <div>
          <h3 style="margin:0;font-size:17px;font-weight:700;color:#0f172a;">Download Complete Ledger Backup</h3>
          <div style="font-size:12px;color:#64748b;margin-top:2px;">Export all individual CSV spreadsheets in a ZIP archive or system JSON file.</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(130px, 1fr));gap:8px;margin-bottom:12px;">
        ${statsHtml}
      </div>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:6px;color:#166534;font-size:12.5px;font-weight:700;margin-bottom:8px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path>
          </svg>
          <span>ZIP Archive Contents (Dedicated CSVs + Master File):</span>
        </div>

        <div style="background:#dcfce7;border:1px solid #86efac;border-radius:6px;padding:6px 10px;display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;">
          <div style="display:flex;align-items:center;gap:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#15803d" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="8" y1="13" x2="16" y2="13"></line>
              <line x1="8" y1="17" x2="16" y2="17"></line>
            </svg>
            <span style="font-family:monospace;font-size:11.5px;font-weight:700;color:#14532d;">00_all_transactions_master_combined.csv</span>
          </div>
          <span style="background:#15803d;color:#fff;font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:10px;text-transform:uppercase;letter-spacing:0.3px;white-space:nowrap;">Master All-in-One</span>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(185px, 1fr));gap:5px;">
          ${[
            '01_journal_entries.csv',
            '02_chart_of_accounts.csv',
            '03_sales_invoices.csv',
            '04_purchase_bills.csv',
            '05_parties_directory.csv',
            '06_inventory_items.csv',
            '07_cash_bank_book.csv',
            '08_loans_register.csv'
          ].map(name => `
            <div style="background:#ffffff;border:1px solid #bbf7d0;padding:4px 8px;border-radius:5px;display:flex;align-items:center;gap:6px;font-size:11px;font-family:monospace;color:#166534;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${name}</span>
            </div>
          `).join('')}
          <div style="background:#ffffff;border:1px solid #93c5fd;padding:4px 8px;border-radius:5px;display:flex;align-items:center;gap:6px;font-size:11px;font-family:monospace;color:#1e40af;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
              <polyline points="16 18 22 12 16 6"></polyline>
              <polyline points="8 6 2 12 8 18"></polyline>
            </svg>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">bufin_system_backup_state.json</span>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">
        <button type="button" id="btnDownloadZip" class="p" style="height:44px;display:flex;align-items:center;justify-content:center;gap:8px;font-size:13.5px;font-weight:700;cursor:pointer;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span>Download All CSVs in ZIP Archive (.zip)</span>
        </button>

        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button type="button" id="btnDownloadBackup" style="flex:1;min-width:160px;height:38px;display:inline-flex;align-items:center;justify-content:center;gap:6px;font-size:12.5px;cursor:pointer;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="12" y1="18" x2="12" y2="12"></line>
              <line x1="9" y1="15" x2="15" y2="15"></line>
            </svg>
            <span>System JSON Only (.json)</span>
          </button>
          <button type="button" id="btnCopyBackup" style="height:38px;padding:0 14px;display:inline-flex;align-items:center;gap:6px;font-size:12.5px;cursor:pointer;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copy JSON</span>
          </button>
        </div>
      </div>

      <details style="margin-top:10px;">
        <summary style="font-size:12px;color:#64748b;cursor:pointer;padding:4px 0;">View Raw JSON</summary>
        <textarea id="ta" rows="5" readonly style="width:100%;font-size:11px;font-family:monospace;margin-top:6px;box-sizing:border-box;">${esc(jsonStr)}</textarea>
      </details>
    </div>
  `);

  $('#btnDownloadZip').onclick = () => {
    const { files, dStr } = buildAllBackupFiles();
    const cleanBiz = (db.biz.name || 'PD_ENTERPRISES').replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadZIP(files, `bufin_complete_backup_${cleanBiz}_${dStr}`);
    toast('Complete ZIP backup with all CSVs downloaded!');
  };

  $('#btnDownloadBackup').onclick = () => {
    downloadJSON(db, `bufin_backup_${(db.biz.name || 'PD_ENTERPRISES').replace(/[^a-zA-Z0-9_-]/g, '_')}`);
    toast('System JSON backup downloaded');
  };

  $('#btnCopyBackup').onclick = () => {
    navigator.clipboard?.writeText(jsonStr).then(() => toast('Backup JSON copied to clipboard')).catch(() => {
      $('#ta').select();
      document.execCommand('copy');
      toast('Backup JSON copied');
    });
  };
}

export function showRestoreModal() {
  modal(`
    <div style="padding:4px 0;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <div style="width:38px;height:38px;border-radius:10px;background:#fef2f2;color:#dc2626;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 4 1 10 7 10"></polyline>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
          </svg>
        </div>
        <div>
          <h3 style="margin:0;font-size:17px;font-weight:700;color:#0f172a;">Restore Ledger from Backup</h3>
          <div style="font-size:12px;color:#64748b;margin-top:2px;">Upload a previously downloaded .zip archive or .json backup file.</div>
        </div>
      </div>

      <!-- File Drop / Select Area -->
      <div id="restoreDropZone" style="border:2px dashed #cbd5e1;border-radius:12px;padding:22px 14px;text-align:center;background:#f8fafc;cursor:pointer;transition:all 0.2s;margin-bottom:14px;">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:6px;">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
        <div style="font-size:13.5px;font-weight:600;color:#1e293b;">Click to upload backup file (.zip or .json)</div>
        <div style="font-size:11.5px;color:#64748b;margin-top:3px;">or drag &amp; drop your BUFIN backup file here</div>
        <input type="file" id="restoreFileInput" accept=".zip,.json,application/zip,application/json" style="display:none;">
      </div>

      <!-- Verification / Preview Block -->
      <div id="restorePreview" style="display:none;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:12px;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:6px;color:#15803d;font-weight:700;font-size:13px;margin-bottom:6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
          <span>Valid BUFIN Backup Verified</span>
        </div>
        <div id="restoreStats" style="font-size:12px;color:#166534;line-height:1.5;"></div>
      </div>

      <!-- Error Block -->
      <div id="restoreError" style="display:none;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px;margin-bottom:12px;color:#b91c1c;font-size:12.5px;font-weight:500;"></div>

      <details style="margin-bottom:14px;">
        <summary style="font-size:12px;color:#64748b;cursor:pointer;padding:4px 0;">Or Paste Backup JSON Text</summary>
        <textarea id="restoreTextarea" rows="4" placeholder="Paste BUFIN JSON backup text here..." style="width:100%;font-size:12px;box-sizing:border-box;margin-top:6px;"></textarea>
      </details>

      <div style="background:#fffbeb;border:1px solid #fef3c7;border-radius:8px;padding:8px 12px;margin-bottom:14px;display:flex;align-items:center;gap:8px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
          <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <span style="font-size:11.5px;color:#92400e;line-height:1.35;">Restoring will completely overwrite the active ledger. A safety backup of your current data will be automatically downloaded before applying.</span>
      </div>

      <div style="margin-bottom:16px;">
        <label for="restorePasswordInput" style="display:block;font-size:12px;font-weight:600;color:#334155;margin-bottom:5px;">Enter PIN or Password to authorize restore:</label>
        <input type="password" id="restorePasswordInput" placeholder="Enter 4-digit PIN or master password" style="width:100%;box-sizing:border-box;padding:8px 10px;font-size:13px;border:1px solid #cbd5e1;border-radius:8px;" autocomplete="current-password">
      </div>

      <div style="display:flex;justify-content:flex-end;gap:10px;">
        <button type="button" id="btnCancelRestore">Cancel</button>
        <button type="button" id="btnConfirmRestore" class="d" disabled style="opacity:0.5;cursor:not-allowed;">Confirm &amp; Restore</button>
      </div>
    </div>
  `);

  let parsedData = null;

  const validateAndShow = (rawText) => {
    try {
      const o = typeof rawText === 'object' && rawText !== null ? rawText : JSON.parse(rawText);
      if (!o || typeof o !== 'object') throw new Error('Invalid file: expected JSON object.');
      if (!Array.isArray(o.accounts)) throw new Error('Invalid backup: "accounts" array is missing.');
      if (!Array.isArray(o.entries)) throw new Error('Invalid backup: "entries" array is missing.');
      if (!Array.isArray(o.parties)) throw new Error('Invalid backup: "parties" array is missing.');
      if (!Array.isArray(o.docs)) throw new Error('Invalid backup: "docs" array is missing.');
      if (!Array.isArray(o.loans)) throw new Error('Invalid backup: "loans" array is missing.');
      if (!Array.isArray(o.seq) && (typeof o.seq !== 'object' || o.seq === null)) throw new Error('Invalid backup: "seq" structure is missing.');
      if (o.audit !== undefined && o.audit !== null && !Array.isArray(o.audit)) throw new Error('Invalid backup: "audit" must be an array.');

      // Validate every entry balanced & unique refs
      const refs = new Set();
      const codes = new Set(o.accounts.map(a => a.code));
      for (const e of o.entries) {
        if (!e.ref) throw new Error('Journal entry missing reference (ref).');
        if (refs.has(e.ref)) throw new Error('Duplicate journal reference in backup: ' + e.ref);
        refs.add(e.ref);
        if (!Array.isArray(e.lines) || e.lines.length < 2) {
          throw new Error(`Entry ${e.ref} must have at least 2 lines.`);
        }
        let d = 0, c = 0;
        for (const l of e.lines) {
          if (!codes.has(l.a)) throw new Error(`Entry ${e.ref} references unknown account "${l.a}".`);
          if (!Number.isInteger(l.d) || !Number.isInteger(l.c) || l.d < 0 || l.c < 0 || (l.d && l.c)) {
            throw new Error(`Entry ${e.ref} contains invalid line amounts.`);
          }
          d += l.d; c += l.c;
        }
        if (d !== c) {
          throw new Error(`Entry ${e.ref} is unbalanced: Debits (${d}) != Credits (${c}).`);
        }
      }

      parsedData = o;
      $('#restoreError').style.display = 'none';
      $('#restoreStats').innerHTML = `
        <b>Business:</b> ${esc(o.biz?.name || 'BUFIN')} | 
        <b>Accounts:</b> ${o.accounts.length} | 
        <b>Entries:</b> ${o.entries.length} | 
        <b>Parties:</b> ${(o.parties || []).length} |
        <b>Docs:</b> ${(o.docs || []).length} |
        <b>Loans:</b> ${(o.loans || []).length}
      `;
      $('#restorePreview').style.display = 'block';
      const btn = $('#btnConfirmRestore');
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
      btn.classList.remove('d');
      btn.classList.add('p');
      btn.textContent = 'Restore Ledger Now';
    } catch (err) {
      parsedData = null;
      $('#restorePreview').style.display = 'none';
      $('#restoreError').innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>${esc(err.message)}</span>
        </div>
      `;
      $('#restoreError').style.display = 'block';
      const btn = $('#btnConfirmRestore');
      btn.disabled = true;
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    }
  };

  const fileInput = $('#restoreFileInput');
  const dropZone = $('#restoreDropZone');

  dropZone.onclick = () => fileInput.click();
  dropZone.ondragover = e => { e.preventDefault(); dropZone.style.borderColor = '#2563eb'; dropZone.style.background = '#eff6ff'; };
  dropZone.ondragleave = e => { e.preventDefault(); dropZone.style.borderColor = '#cbd5e1'; dropZone.style.background = '#f8fafc'; };
  dropZone.ondrop = e => {
    e.preventDefault();
    dropZone.style.borderColor = '#cbd5e1';
    dropZone.style.background = '#f8fafc';
    if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  };

  fileInput.onchange = e => {
    if (e.target.files.length) handleFile(e.target.files[0]);
  };

  const handleFile = file => {
    const isZip = file.name.toLowerCase().endsWith('.zip');
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        let jsonContent = null;
        if (isZip) {
          const zipBytes = new Uint8Array(ev.target.result);
          const extracted = readZipFile(zipBytes, '.json');
          if (!extracted || !extracted.data) {
            throw new Error('Could not find BUFIN system backup (.json) inside the ZIP archive.');
          }
          jsonContent = extracted.data;
        } else {
          jsonContent = ev.target.result;
        }
        validateAndShow(jsonContent);
        dropZone.innerHTML = `
          <div style="color:#16a34a;font-weight:600;font-size:13.5px;display:flex;align-items:center;justify-content:center;gap:6px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span>File Loaded: ${esc(file.name)}</span>
          </div>
          <div style="font-size:11.5px;color:#64748b;margin-top:2px;">${(file.size / 1024).toFixed(1)} KB — Click to choose different file</div>
        `;
      } catch (err) {
        parsedData = null;
        $('#restorePreview').style.display = 'none';
        $('#restoreError').innerHTML = `
          <div style="display:flex;align-items:center;gap:6px;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>${esc(err.message)}</span>
          </div>
        `;
        $('#restoreError').style.display = 'block';
      }
    };

    if (isZip) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  $('#restoreTextarea').oninput = e => {
    if (e.target.value.trim()) validateAndShow(e.target.value.trim());
  };

  $('#btnCancelRestore').onclick = closeM;
  $('#btnConfirmRestore').onclick = async () => {
    if (!parsedData) return;
    const pwdInput = $('#restorePasswordInput');
    const password = (pwdInput?.value || '').trim();
    if (!password) {
      if (pwdInput) pwdInput.focus();
      return toast('Please enter your password or PIN to authorize restore');
    }

    const btn = $('#btnConfirmRestore');
    btn.disabled = true;
    btn.textContent = 'Restoring...';

    try {
      // 1. Auto-download pre-restore backup before applying
      try {
        const preBackup = JSON.stringify(db, null, 2);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const blob = new Blob([preBackup], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `bufin-pre-restore-backup-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 1000);
      } catch (downErr) {
        console.warn('Auto-download pre-restore backup warning:', downErr);
      }

      // 2. Call backend restore endpoint (bypasses "cannot delete posted entry" and records audit)
      const res = await fetch('/api/state/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, data: parsedData })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Restore failed with status ' + res.status);
      }

      // 3. Reload state from server and update local state
      const stateRes = await fetch('/api/state');
      if (!stateRes.ok) throw new Error('Could not reload restored state from server');
      const stateJson = await stateRes.json();
      setDb(stateJson.data);
      setVer(stateJson.version);
      setBaseVer(stateJson.version);

      closeM();
      window.dispatchEvent(new Event('bufin-render'));
      toast('Ledger successfully restored from backup!');
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Restore Ledger Now';
      toast('Restore failed: ' + (e.message || e));
    }
  };
}
