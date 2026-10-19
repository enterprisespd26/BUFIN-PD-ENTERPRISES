import { $, $$, esc, fmt, head, kpi, toast, today, uid, P, convertRate, debounce as _utilsDebounce } from '../modules/utils.js';
import { db, save, post, reverse, out, dstat, pn, isS, net, checkCashLiquidity } from '../modules/state.js';
import { partyForm, markBillPaid, showDoc, isIntraState } from '../modules/actions.js';
import { showActionSheet } from '../modules/components.js';

// Safe debounce fallback: guaranteed never undefined in any scope
export const debounce = (typeof _utilsDebounce === 'function') ? _utilsDebounce :
  (typeof window !== 'undefined' && typeof window.debounce === 'function') ? window.debounce :
  function (fn, ms = 300) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  };

if (typeof window !== 'undefined') {
  window.debounce = debounce;
}
import {
  openCameraScanner,
  showAttachmentViewer,
  attachmentPanelHTML,
  billFilePillsHTML,
  injectAttachmentStyles
} from '../modules/attachments.js';

export const billsState = {
  tab: 'rec', // 'new' | 'rec' | 'inventory'
  editId: null,
  selectedPartyId: null,
  files: [],
  q: '',
  invQ: '',
  invSupplier: '',
  invFromDate: '',
  invToDate: ''
};

const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sz = b => b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' KB';

/* ================= INVENTORY STOCK CALCULATOR & HELPERS ================= */
export function formatStockQty(qty, isWeight) {
  if (!isWeight) {
    return `${Number(qty || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} pcs`;
  }
  const kg = Number(qty || 0);
  if (kg >= 1000) {
    const tons = (kg / 1000).toFixed(2);
    return `${kg.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg <span style="color:#64748b;font-size:12px;font-weight:normal">(${tons} tons)</span>`;
  }
  if (kg >= 100) {
    const qtl = (kg / 100).toFixed(2);
    return `${kg.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg <span style="color:#64748b;font-size:12px;font-weight:normal">(${qtl} qtl)</span>`;
  }
  return `${kg.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`;
}

export function getInventoryStock() {
  const bills = db.docs.filter(d => d.type === 'bill' && !d.cancelled);
  const sales = db.docs.filter(d => d.type === 'sale' && !d.cancelled);

  const stockMap = new Map();

  function toBaseKg(q, u) {
    const unit = (u || 'kg').toLowerCase().trim();
    if (unit === 'ton' || unit === 'tons' || unit === 'mt') return q * 1000;
    if (unit === 'quintal' || unit === 'quintals' || unit === 'qtl') return q * 100;
    return q; // default kg
  }

  function isWeightUnit(u) {
    const unit = (u || 'kg').toLowerCase().trim();
    return unit !== 'pcs' && unit !== 'pc' && unit !== 'piece' && unit !== 'pieces';
  }

  // 1. Process all Purchase Bills (Inflow)
  bills.forEach(b => {
    const items = [];
    if (b.lines && Array.isArray(b.lines) && b.lines.length) {
      b.lines.forEach(l => {
        items.push({
          mat: l.n || l.desc || 'Scrap Material',
          q: parseFloat(l.q) || 0,
          u: l.u || 'kg',
          r: parseFloat(l.r) || 0,
          amt: (parseFloat(l.q) || 0) * (parseFloat(l.r) || 0)
        });
      });
    } else {
      const q = parseFloat(b.q) || 0;
      const r = parseFloat(b.r) || 0;
      const amt = (b.base ? b.base / 100 : (q * r)) || (q * r);
      items.push({
        mat: (b.mat || b.desc || 'Scrap Material').trim(),
        q,
        u: b.u || 'kg',
        r,
        amt
      });
    }

    const sup = b.sup || pn(b.party) || 'Unknown';
    const billRef = b.sno || b.no || 'BILL';
    const billDate = b.date || '';

    items.forEach(it => {
      if (!it.mat) return;
      const key = it.mat.toLowerCase().trim();
      if (!stockMap.has(key)) {
        stockMap.set(key, {
          name: it.mat,
          isWeight: isWeightUnit(it.u),
          purchasedKg: 0,
          purchasedPcs: 0,
          totalInvestment: 0,
          suppliers: new Set(),
          bills: [],
          latestDate: '',
          latestRate: 0,
          latestUnit: it.u,
          soldKg: 0,
          soldPcs: 0
        });
      }

      const entry = stockMap.get(key);
      const isWeight = isWeightUnit(it.u);
      if (isWeight) {
        entry.purchasedKg += toBaseKg(it.q, it.u);
      } else {
        entry.purchasedPcs += it.q;
      }
      entry.totalInvestment += it.amt;
      if (sup) entry.suppliers.add(sup);

      entry.bills.push({
        id: b.id,
        ref: billRef,
        date: billDate,
        sup,
        qty: it.q,
        unit: it.u,
        rate: it.r,
        amt: it.amt
      });

      if (!entry.latestDate || billDate >= entry.latestDate) {
        entry.latestDate = billDate;
        entry.latestRate = it.r;
        entry.latestUnit = it.u;
      }
    });
  });

  // 2. Process all Sales Invoices (Outflow linkage)
  sales.forEach(s => {
    (s.lines || []).forEach(l => {
      const matName = (l.n || '').trim();
      if (!matName) return;
      const key = matName.toLowerCase();
      if (stockMap.has(key)) {
        const entry = stockMap.get(key);
        const sq = parseFloat(l.q) || 0;
        if (isWeightUnit(l.u)) {
          entry.soldKg += toBaseKg(sq, l.u);
        } else {
          entry.soldPcs += sq;
        }
      }
    });
  });

  // 3. Assemble stock ledger items
  const results = [];
  stockMap.forEach((val, key) => {
    const isWeight = val.isWeight;
    const purchasedQty = isWeight ? val.purchasedKg : val.purchasedPcs;
    const soldQty = isWeight ? val.soldKg : val.soldPcs;
    const currentStock = Math.max(0, purchasedQty - soldQty);
    const unitLabel = isWeight ? 'kg' : 'pcs';

    const avgRate = purchasedQty > 0 ? (val.totalInvestment / purchasedQty) : 0;
    const stockValuation = currentStock * avgRate;

    const matchingItem = (db.items || []).find(it => (it.n || '').toLowerCase().trim() === key);
    const minThreshold = matchingItem?.minStock || matchingItem?.min || val.minStock || 0;
    const isLowStock = currentStock > 0 && minThreshold > 0 && currentStock <= minThreshold;
    const isDepleted = currentStock <= 0;
    const status = isDepleted ? 'Depleted' : (isLowStock ? 'Low Stock' : 'In Stock');

    val.bills.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    results.push({
      key,
      name: val.name,
      isWeight,
      unitLabel,
      purchasedQty,
      soldQty,
      currentStock,
      totalInvestment: val.totalInvestment,
      avgRate,
      latestRate: val.latestRate,
      latestUnit: val.latestUnit,
      stockValuation,
      minStock: minThreshold,
      isLowStock,
      status,
      suppliers: Array.from(val.suppliers),
      bills: val.bills
    });
  });

  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

/* ================= INDEXEDDB FILE STORAGE ================= */
const IDB = new Promise((ok, no) => {
  try {
    if (typeof indexedDB === 'undefined') return ok(null);
    const r = indexedDB.open('pdpurch', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('p', { keyPath: 'id' });
    r.onsuccess = () => ok(r.result);
    r.onerror = () => no(r.error);
  } catch (e) {
    ok(null);
  }
});

const itx = async (m, fn) => {
  const d = await IDB;
  if (!d) return null;
  return new Promise((ok, no) => {
    const t = d.transaction('p', m);
    const q = fn(t.objectStore('p'));
    t.oncomplete = () => ok(q && q.result);
    t.onerror = () => no(t.error);
  });
};

const pGet = id => itx('readonly', s => s.get(id));
const pPut = o => itx('readwrite', s => s.put(o));
const pDel = id => itx('readwrite', s => s.delete(id));

function shrink(f) {
  return new Promise(ok => {
    if (!f.type.startsWith('image/')) return ok(f);
    const u = URL.createObjectURL(f);
    const i = new Image();
    i.onload = () => {
      const k = Math.min(1, 1800 / Math.max(i.width, i.height));
      const c = document.createElement('canvas');
      c.width = Math.round(i.width * k);
      c.height = Math.round(i.height * k);
      const x = c.getContext('2d');
      x.fillStyle = '#fff';
      x.fillRect(0, 0, c.width, c.height);
      x.drawImage(i, 0, 0, c.width, c.height);
      c.toBlob(b => {
        URL.revokeObjectURL(u);
        ok(b && b.size < f.size ? new File([b], f.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : f);
      }, 'image/jpeg', 0.82);
    };
    i.onerror = () => {
      URL.revokeObjectURL(u);
      ok(f);
    };
    i.src = u;
  });
}

/* ================= RENDER PURCHASE BILLS ================= */
export function renderBills() {
  injectAttachmentStyles();

  const bills = db.docs.filter(d => d.type === 'bill').reverse();
  const scrapItems = db.items || [];
  const suppliers = db.parties.filter(isS);

  // Stats
  const totalBills = bills.length;
  const thisMonthStr = today().slice(0, 7);
  const thisMonthTotal = bills.filter(d => (d.date || '').startsWith(thisMonthStr) && !d.cancelled).reduce((s, d) => s + (d.total || 0), 0);
  const totalPurchased = bills.filter(d => !d.cancelled).reduce((s, d) => s + (d.total || 0), 0);
  const totalPending = bills.filter(d => !d.cancelled).reduce((s, d) => s + out(d), 0);

  // Active bill being edited
  let activeBill;
  if (billsState.editId) {
    activeBill = db.docs.find(d => d.id === billsState.editId && d.type === 'bill');
  }

  let activeSupplier = null;
  if (billsState.selectedPartyId) {
    activeSupplier = db.parties.find(p => p.id === billsState.selectedPartyId);
  } else if (activeBill && activeBill.party) {
    activeSupplier = db.parties.find(p => p.id === activeBill.party);
    if (activeSupplier) billsState.selectedPartyId = activeSupplier.id;
  }
  const activeSupplierId = activeSupplier ? activeSupplier.id : (billsState.selectedPartyId || '');

  const supName = activeSupplier ? activeSupplier.name : (activeBill ? (activeBill.sup || pn(activeBill.party) || '') : '');
  const supPhone = activeSupplier ? (activeSupplier.phone || '') : (activeBill ? (activeBill.phone || '') : '');
  const supGstin = activeSupplier ? (activeSupplier.gstin || '') : (activeBill ? (activeBill.gstin || '') : '');
  const supState = activeSupplier ? (activeSupplier.state || db.biz.state || 'Odisha') : (activeBill ? (activeBill.state || db.biz.state || 'Odisha') : (db.biz.state || 'Odisha'));
  const supAddr = activeSupplier ? (activeSupplier.addr || '') : (activeBill ? (activeBill.addr || '') : '');
  const billNo = activeBill ? (activeBill.sno || activeBill.no || '') : '';
  const billDate = activeBill ? activeBill.date : today();
  const material = activeBill ? (activeBill.mat || activeBill.desc || '') : '';
  const qty = activeBill ? (activeBill.q ?? '') : '';
  const unit = activeBill ? (activeBill.u || 'kg') : 'kg';
  const rate = activeBill ? (activeBill.r ?? '') : '';
  const amt = activeBill ? ((activeBill.base || 0) / 100).toFixed(2) : '';
  const gst = activeBill ? ((activeBill.gst || 0) / 100).toFixed(2) : '0';
  const tot = activeBill ? ((activeBill.total || 0) / 100).toFixed(2) : (amt ? ((+amt) + (+gst)).toFixed(2) : '');
  const paidAmt = activeBill ? (activeBill.paid !== undefined ? activeBill.paid : (((activeBill.total || 0) - out(activeBill)) / 100).toFixed(2)) : '0';
  const pm = activeBill ? (activeBill.pm || 'Cash') : 'Cash';
  const notes = activeBill ? (activeBill.nt || '') : '';

  // Filter records
  const qLower = (billsState.q || '').toLowerCase();
  const filteredBills = bills.filter(d => {
    const sup = d.sup || pn(d.party) || '';
    const no = d.sno || d.no || '';
    const mat = d.mat || d.desc || '';
    return (sup + ' ' + no + ' ' + mat).toLowerCase().includes(qLower);
  });

  const isInventory = billsState.tab === 'inventory' || window.location.hash.startsWith('#/inventory');
  const currentTab = isInventory ? 'inventory' : (billsState.tab === 'new' ? 'new' : 'rec');

  // Calculate Inventory Stock dynamically from Purchase Bills & Sales Outflow
  const allStock = getInventoryStock();

  // Extract unique suppliers from all stock items
  const uniqueSuppliersSet = new Set();
  allStock.forEach(s => (s.suppliers || []).forEach(sup => uniqueSuppliersSet.add(sup)));
  const uniqueSuppliers = Array.from(uniqueSuppliersSet).sort();

  // Filter inventory
  const invQ = (billsState.invQ || '').trim().toLowerCase();
  const invSup = (billsState.invSupplier || '').trim().toLowerCase();
  const invFrom = billsState.invFromDate || '';
  const invTo = billsState.invToDate || '';

  const filteredStock = allStock.filter(item => {
    if (invQ) {
      const matMatch = item.name.toLowerCase().includes(invQ);
      const supMatch = item.suppliers.some(s => s.toLowerCase().includes(invQ));
      const billMatch = item.bills.some(b => b.ref.toLowerCase().includes(invQ));
      if (!matMatch && !supMatch && !billMatch) return false;
    }
    if (invSup) {
      if (!item.suppliers.some(s => s.toLowerCase() === invSup)) return false;
    }
    if (invFrom || invTo) {
      const hasBillInRange = item.bills.some(b => {
        if (invFrom && b.date < invFrom) return false;
        if (invTo && b.date > invTo) return false;
        return true;
      });
      if (!hasBillInRange) return false;
    }
    return true;
  });

  const totalMaterials = allStock.length;
  const totalAcquiredKg = allStock.filter(s => s.isWeight).reduce((acc, s) => acc + s.purchasedQty, 0);
  const totalSoldKg = allStock.filter(s => s.isWeight).reduce((acc, s) => acc + s.soldQty, 0);
  const totalCurrentStockKg = allStock.filter(s => s.isWeight).reduce((acc, s) => acc + s.currentStock, 0);
  const totalInvested = allStock.reduce((acc, s) => acc + s.totalInvestment, 0);
  const totalStockValuation = allStock.reduce((acc, s) => acc + s.stockValuation, 0);

  return `
    ${head(isInventory ? 'Inventory Stock' : 'Purchase Bills', isInventory ? '' : `<button class="p" id="u_head_add">${currentTab === 'new' ? 'View records' : '+ New purchase'}</button>`)}

    ${isInventory ? '' : `
    <div class="pd-nav-tabs noprint">
      <button type="button" class="${currentTab === 'new' && !billsState.editId ? 'on' : ''}" data-bt="new">
        New purchase
      </button>
      <button type="button" class="${currentTab === 'rec' ? 'on' : ''}" data-bt="rec">
        Purchase records (${totalBills})
      </button>
    </div>
    `}

    <!-- TAB 1: ADD / EDIT BILL -->
    <div id="pd-tab-bill-new" style="display:${currentTab === 'new' ? 'block' : 'none'}">
      <div class="pd-card">
        ${billsState.editId ? `
          <div style="display:flex;justify-content:space-between;align-items:center;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;margin-bottom:18px;flex-wrap:wrap;gap:10px;">
            <div style="display:flex;align-items:center;gap:10px;">
              <span style="background:#2563eb;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:4px;text-transform:uppercase;">Edit Mode</span>
              <h3 style="margin:0;font-size:16px;color:#1e40af;">Editing Purchase Bill: <b>${esc(billNo || activeBill?.sno || activeBill?.no)}</b></h3>
            </div>
            <div class="pd-btn-row" style="margin:0;gap:8px;">
              <button type="button" class="btn p sm" id="u_btn_save_top">Update Purchase Bill</button>
              <button type="button" class="btn alt sm" id="u_btn_cancel_top">Cancel</button>
              <button type="button" class="btn alt sm" id="u_btn_back_rec">← Back to Records</button>
            </div>
          </div>
        ` : `
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:10px;">
            <h3 id="u_ft" style="margin:0;">Add purchase bill</h3>
          </div>
        `}

        <!-- EXISTING PARTY SELECTION -->
        <div class="pd-party-selector" style="background:#f8fafc;border:1px solid var(--bd);border-radius:8px;padding:14px 16px;margin-bottom:20px;">
          <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;">
            <div style="flex:1;min-width:260px;">
              <label class="pd-label" style="font-weight:600;color:var(--tx);margin-bottom:6px;">
                Select Existing Supplier
              </label>
              <select id="u_sel_supplier" style="width:100%;padding:8px 12px;border:1px solid var(--bd);border-radius:6px;background:#fff;font-size:14px;font-weight:500;">
                <option value="">-- Choose from existing suppliers --</option>
                ${suppliers.map(p => `<option value="${p.id}" ${p.id === activeSupplierId ? 'selected' : ''}>${esc(p.name)}${p.phone ? ' (' + esc(p.phone) + ')' : ''}${p.state ? ' · ' + esc(p.state) : ''}</option>`).join('')}
                <option value="__NEW__">➕ + Add New Supplier...</option>
              </select>
            </div>
            <div style="display:flex;align-items:flex-end;padding-top:18px;">
              <button type="button" class="p" id="u_btn_new_sup" style="padding:8px 16px;font-size:13px;font-weight:600;white-space:nowrap;">
                + Add Supplier
              </button>
            </div>
          </div>
        </div>

        <div class="pd-grid">
          <label class="pd-label">Supplier / seller *
            <input type="text" id="u_sup" list="u_sl" value="${esc(supName)}" placeholder="Supplier name">
            <datalist id="u_sl">
              ${suppliers.map(p => `<option value="${esc(p.name)}">`).join('')}
            </datalist>
          </label>
          <label class="pd-label">Phone
            <input type="text" id="u_phone" value="${esc(supPhone)}" placeholder="Phone number">
          </label>
          <label class="pd-label">Supplier GSTIN (optional)
            <input type="text" id="u_gstin" style="text-transform:uppercase" value="${esc(supGstin)}" placeholder="e.g. 21AAAAA0000A1Z5">
          </label>
          <label class="pd-label">State
            <input type="text" id="u_state" value="${esc(supState)}" placeholder="State">
          </label>
          <label class="pd-label" style="grid-column:1/-1">Address
            <input type="text" id="u_addr" value="${esc(supAddr)}" placeholder="Supplier address">
          </label>
          <label class="pd-label">Bill no.
            <input type="text" id="u_no" value="${esc(billNo)}" placeholder="e.g. PB-102">
          </label>
          <label class="pd-label">Bill date *
            <input type="date" id="u_dt" value="${esc(billDate)}">
          </label>
          <label class="pd-label">Material
            <input type="text" id="u_mat" list="u_ml" value="${esc(material)}" placeholder="e.g. Iron scrap">
            <datalist id="u_ml">
              ${scrapItems.map(x => `<option value="${esc(x.n)}">`).join('')}
            </datalist>
          </label>
          <label class="pd-label">Quantity
            <input type="number" step="any" min="0" id="u_q" value="${esc(qty)}">
          </label>
          <label class="pd-label">Unit
            <select id="u_u">
              ${['kg', 'quintal', 'ton', 'pcs'].map(u => `<option value="${u}" ${u === unit ? 'selected' : ''}>${u}</option>`).join('')}
            </select>
          </label>
          <label class="pd-label">Rate (₹)
            <input type="number" step="any" min="0" id="u_r" value="${esc(rate)}">
          </label>
          <label class="pd-label">Amount (₹)
            <input type="number" step="any" min="0" id="u_amt" value="${esc(amt)}">
          </label>
          <label class="pd-label">GST (₹)
            <input type="number" step="any" min="0" id="u_gst" value="${esc(gst)}">
          </label>
          <label class="pd-label">Total (₹)
            <input type="text" id="u_tot" value="${esc(tot)}" readonly style="background:#f1f5f9;font-weight:600">
          </label>
          <label class="pd-label">Paid (₹)
            <input type="number" step="any" min="0" id="u_paid" value="${esc(paidAmt)}">
          </label>
          <label class="pd-label">Payment method
            <select id="u_pm">
              ${['Cash', 'UPI', 'Bank transfer', 'Cheque', 'Credit'].map(m => `<option ${m === pm ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </label>
        </div>

        <!-- Cash in Hand Liquidity Warning -->
        <div id="u_cash_warn" style="display:none;margin-top:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;font-size:12.5px;color:#991b1b;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span style="font-size:16px;">⚠️</span>
            <b id="u_cash_warn_text">Insufficient cash in hand balance. Please deposit funds or pay via Bank Account.</b>
          </div>
        </div>

        <label class="pd-label" style="margin-top:14px">Notes
          <textarea id="u_nt" rows="2">${esc(notes)}</textarea>
        </label>

        ${attachmentPanelHTML({
          uploadId: 'u_btn_upload_bill',
          cameraId: 'u_btn_camera_bill',
          inputId: 'u_files',
          listId: 'u_fl',
          listHTML: billFilePillsHTML(billsState.files)
        })}

        <div class="pd-btn-row" style="margin-top:18px">
          <button type="button" class="btn p" id="u_save">${billsState.editId ? 'Update Purchase Bill' : 'Save purchase bill'}</button>
          <button type="button" class="btn alt" id="${billsState.editId ? 'u_btn_cancel_bottom' : 'u_clr'}">${billsState.editId ? 'Cancel' : 'Clear'}</button>
        </div>
      </div>
    </div>

    <!-- TAB 2: RECORDS LIST -->
    <div id="pd-tab-bill-rec" style="display:${currentTab === 'rec' ? 'block' : 'none'}">
      <div class="pd-stats">
        <div><span>Bills</span><b>${totalBills}</b></div>
        <div><span>This month</span><b>${fmt(thisMonthTotal)}</b></div>
        <div><span>Total purchased</span><b>${fmt(totalPurchased)}</b></div>
        <div><span>To pay</span><b>${fmt(totalPending)}</b></div>
      </div>

      <div class="pd-card">
        <div class="pd-btn-row" style="margin-bottom:12px;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <h3 style="margin:0">Purchase records</h3>
          <div class="pd-btn-row" style="align-items:center;gap:8px">
            <input type="text" id="u_s" placeholder="Search supplier / bill no / material" value="${esc(billsState.q)}" style="width:260px;max-width:100%">
            <button type="button" class="btn alt sm" id="u_csv">Export CSV</button>
          </div>
        </div>

        <div class="pd-table-wrap responsive-cards">
          <table class="pd-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Supplier</th>
                <th>Bill no</th>
                <th>Material</th>
                <th style="text-align:right">Total</th>
                <th>Status</th>
                <th>Files</th>
                <th style="text-align:right">Actions</th>
              </tr>
            </thead>
            <tbody id="u_b">
              ${filteredBills.length ? filteredBills.map(d => {
                const totalAmt = (d.total || 0) / 100;
                const paidVal = d.paid !== undefined ? d.paid : ((d.total || 0) - out(d)) / 100;
                const bal = totalAmt - paidVal;
                const s = dstat(d);
                const isPaid = bal <= 0 || s[0] === 'Paid';
                const isPartial = !isPaid && (paidVal > 0);
                const pillCls = isPaid ? '' : (isPartial ? 'p' : 'u');
                const pillTxt = isPaid ? 'Paid' : (isPartial ? 'Part paid' : 'Unpaid');

                return `<tr>
                  <td>${d.date ? d.date.split('-').reverse().join('/') : ''}</td>
                  <td><b>${esc(d.sup || pn(d.party))}</b></td>
                  <td>${esc(d.sno || d.no || '–')}</td>
                  <td>${esc(d.mat || d.desc || 'Scrap')}${d.q ? ' (' + d.q + ' ' + (d.u || 'kg') + ')' : ''}</td>
                  <td style="text-align:right;font-weight:600">${fmt(d.total)}</td>
                  <td><span class="pd-pill ${pillCls}">${pillTxt}</span></td>
                  <td>
                    ${d.hasFiles ? `<button type="button" class="btn alt sm" data-ba="v" data-id="${esc(d.id)}">📎 View</button>` : '–'}
                  </td>
                  <td style="text-align:right">
                    <div class="pd-btn-row desktop-actions" style="justify-content:flex-end">
                      <button type="button" class="btn alt sm" data-ba="e" data-id="${esc(d.id)}">Edit</button>
                      ${!isPaid && !d.cancelled ? `<button type="button" class="btn alt sm" data-ba="p" data-id="${esc(d.id)}">Mark paid</button>` : ''}
                      <button type="button" class="btn red sm" data-ba="d" data-id="${esc(d.id)}">Delete</button>
                    </div>
                    <button type="button" class="pd-more-btn" data-ba="more" data-id="${esc(d.id)}" title="Actions" aria-label="Actions">⋮</button>
                  </td>
                </tr>`;
              }).join('') : `<tr><td colspan="8" style="text-align:center;color:var(--t2);padding:24px">No purchase bills yet</td></tr>`}
            </tbody>
          </table>
        </div>
        <p style="color:var(--t2);font-size:13px;margin:8px 0 0">
          Saved on this device and synced with your BUFIN double-entry ledger. Attached bills are safely stored in browser storage.
        </p>
      </div>
    </div>

    <!-- TAB 3: INVENTORY STOCK LEDGER (View-Only, Derived Strictly From Purchase Bills) -->
    <div id="pd-tab-inventory" style="display:${currentTab === 'inventory' ? 'block' : 'none'}">
      <!-- High Level KPI Metrics (Matches standard BUFIN grid & kpi layout) -->
      <div class="grid-6">
        ${kpi('Materials Acquired', `${totalMaterials} Types`)}
        ${kpi('Total Purchased', formatStockQty(totalAcquiredKg, true))}
        ${kpi('Total Sold / Shipped', formatStockQty(totalSoldKg, true))}
        ${kpi('Current In Stock', formatStockQty(totalCurrentStockKg, true))}
        ${kpi('Total Invested', fmt(Math.round(totalInvested * 100)))}
        ${kpi('Stock Valuation', fmt(Math.round(totalStockValuation * 100)))}
      </div>

      <div class="pd-card">
        <!-- Filter Toolbar (Matches Purchase records & Sales records standard layout) -->
        <div class="pd-btn-row" style="margin-bottom:14px;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex:1;">
            <input type="text" id="inv_search_q" value="${esc(billsState.invQ || '')}" placeholder="Search material, supplier, bill..." style="width:240px;max-width:100%;">
            <select id="inv_filter_sup" style="width:auto;min-width:160px;">
              <option value="">All Suppliers (${uniqueSuppliers.length})</option>
              ${uniqueSuppliers.map(s => `<option value="${esc(s.toLowerCase())}" ${billsState.invSupplier?.toLowerCase() === s.toLowerCase() ? 'selected' : ''}>${esc(s)}</option>`).join('')}
            </select>
            <input type="date" id="inv_from_date" value="${esc(billsState.invFromDate || '')}" title="From date" style="width:auto;">
            <input type="date" id="inv_to_date" value="${esc(billsState.invToDate || '')}" title="To date" style="width:auto;">
            ${(billsState.invQ || billsState.invSupplier || billsState.invFromDate || billsState.invToDate) ? `<button type="button" class="btn alt sm" id="inv_btn_reset">Clear</button>` : ''}
          </div>
          <button type="button" class="btn alt sm" id="inv_btn_csv">Export CSV</button>
        </div>

        <!-- Inventory Table -->
        <div class="pd-table-wrap">
          <table class="pd-table">
            <thead>
              <tr>
                <th style="width:36px">#</th>
                <th>Material Name</th>
                <th class="num">Total Purchased</th>
                <th class="num">Total Sold</th>
                <th class="num">Current Stock</th>
                <th>Status</th>
                <th>Supplier(s)</th>
                <th>Rates</th>
                <th class="num">Total Investment</th>
                <th>Linked Bills</th>
              </tr>
            </thead>
            <tbody>
              ${filteredStock.length ? filteredStock.map((s, idx) => {
                const isDepleted = s.currentStock <= 0;
                return `<tr>
                  <td>${idx + 1}</td>
                  <td>
                    <b>${esc(s.name)}</b>
                    <div style="font-size:12px;color:var(--t2);">${s.bills.length} purchase bill${s.bills.length === 1 ? '' : 's'}</div>
                  </td>
                  <td class="num">${formatStockQty(s.purchasedQty, s.isWeight)}</td>
                  <td class="num" style="color:var(--t2);">${formatStockQty(s.soldQty, s.isWeight)}</td>
                  <td class="num" style="font-weight:600;">${formatStockQty(s.currentStock, s.isWeight)}</td>
                  <td>
                    <span class="b ${isDepleted ? 'rd' : (s.isLowStock ? 'wn' : 'ok')}">${s.status || (isDepleted ? 'Depleted' : 'In Stock')}</span>
                  </td>
                  <td>
                    <div style="font-size:13px;">${s.suppliers.map(sup => esc(sup)).join(', ')}</div>
                  </td>
                  <td>
                    <div style="font-size:13px;">Avg: ₹${s.avgRate.toFixed(2)} / ${s.unitLabel}</div>
                    <div style="font-size:12px;color:var(--t2);">Latest: ₹${s.latestRate.toFixed(2)} / ${s.latestUnit || s.unitLabel}</div>
                  </td>
                  <td class="num" style="font-weight:600;">
                    ${fmt(Math.round(s.totalInvestment * 100))}
                  </td>
                  <td>
                    <div style="display:flex;flex-wrap:wrap;gap:4px;">
                      ${s.bills.map(b => `
                        <button type="button" class="btn alt sm" data-bill-id="${esc(b.id)}" title="${esc(b.date)} · ${esc(b.sup)} · ${b.qty} ${esc(b.unit)} @ ₹${b.rate}" style="padding:2px 7px;font-size:11px;">
                          ${esc(b.ref)}
                        </button>
                      `).join('')}
                    </div>
                  </td>
                </tr>`;
              }).join('') : `
                <tr>
                  <td colspan="10" style="text-align:center;padding:32px;color:var(--t2);">
                    No inventory materials found. Materials will automatically appear here once you record your first Purchase Bill.
                  </td>
                </tr>
              `}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ATTACHMENT MODAL -->
    <div id="u_m">
      <div class="pd-card" style="position:relative">
        <button type="button" class="dlg-close" id="u_mx" aria-label="Close" title="Close">&times;</button>
        <div class="pd-btn-row" style="margin-bottom:12px;border-bottom:1px solid var(--bd);padding-bottom:10px;padding-right:40px">
          <h3 id="u_mt" style="margin:0">Bill files</h3>
        </div>
        <div id="u_mb"></div>
      </div>
    </div>
  `;
}

export function bindBillsEvents() {
  const container = $('#v');
  if (!container) return;

  const U = i => $('#u_' + i);

  // Tab switching
  container.querySelectorAll('[data-bt]').forEach(btn => {
    btn.onclick = () => {
      billsState.tab = btn.dataset.bt;
      if (btn.dataset.bt === 'new') {
        billsState.editId = null;
        billsState.selectedPartyId = null;
        billsState.files = [];
      }
      container.innerHTML = renderBills();
      bindBillsEvents();
    };
  });

  // Header button toggle
  const headAddBtn = $('#u_head_add');
  if (headAddBtn) {
    headAddBtn.onclick = () => {
      billsState.tab = billsState.tab === 'new' ? 'rec' : 'new';
      if (billsState.tab === 'new') {
        billsState.editId = null;
        billsState.selectedPartyId = null;
        billsState.files = [];
      }
      container.innerHTML = renderBills();
      bindBillsEvents();
    };
  }

  // Cancel edit buttons
  const cancelBillEdit = () => {
    billsState.editId = null;
    billsState.selectedPartyId = null;
    billsState.files = [];
    billsState.tab = 'rec';
    container.innerHTML = renderBills();
    bindBillsEvents();
  };
  const cancelTop = U('btn_cancel_top');
  if (cancelTop) cancelTop.onclick = cancelBillEdit;
  const backRec = U('btn_back_rec');
  if (backRec) backRec.onclick = cancelBillEdit;
  const cancelBottom = U('btn_cancel_bottom');
  if (cancelBottom) cancelBottom.onclick = cancelBillEdit;

  // "+ New purchase" button in records toolbar
  const addNewBtn = $('#u_btn_add_new');
  if (addNewBtn) {
    addNewBtn.onclick = () => {
      billsState.tab = 'new';
      billsState.editId = null;
      billsState.selectedPartyId = null;
      billsState.files = [];
      container.innerHTML = renderBills();
      bindBillsEvents();
    };
  }

  // Recalculate Total
  const ptot = () => {
    const amt = parseFloat(U('amt')?.value) || 0;
    const gst = parseFloat(U('gst')?.value) || 0;
    if (U('tot')) U('tot').value = (amt + gst).toFixed(2);
  };

  // Existing Supplier dropdown
  const selSup = U('sel_supplier');
  if (selSup) {
    selSup.onchange = () => {
      const val = selSup.value;
      if (val === '__NEW__') {
        selSup.value = billsState.selectedPartyId || '';
        partyForm(null, 'supplier', newParty => {
          billsState.selectedPartyId = newParty.id;
          billsState.tab = 'new';
          container.innerHTML = renderBills();
          bindBillsEvents();
          toast('Supplier "' + newParty.name + '" added & selected');
        });
        return;
      }
      billsState.selectedPartyId = val || null;
      const p = db.parties.find(x => x.id === val);
      if (p) {
        if (U('sup')) U('sup').value = p.name;
        if (U('phone')) U('phone').value = p.phone || '';
        if (U('gstin')) U('gstin').value = p.gstin || '';
        if (U('state')) U('state').value = p.state || db.biz.state || 'Odisha';
        if (U('addr')) U('addr').value = p.addr || '';
      }
    };
  }

  // Quick add supplier button
  const btnNewSup = U('btn_new_sup');
  if (btnNewSup) {
    btnNewSup.onclick = () => {
      partyForm(null, 'supplier', newParty => {
        billsState.selectedPartyId = newParty.id;
        billsState.tab = 'new';
        container.innerHTML = renderBills();
        bindBillsEvents();
        toast('Supplier "' + newParty.name + '" added & selected');
      });
    };
  }

  // Supplier input change autofill
  const supInput = U('sup');
  if (supInput) {
    supInput.onchange = () => {
      const val = supInput.value.trim().toLowerCase();
      const p = db.parties.find(x => x.name.trim().toLowerCase() === val && isS(p));
      if (p) {
        billsState.selectedPartyId = p.id;
        if (U('sel_supplier')) U('sel_supplier').value = p.id;
        if (U('phone')) U('phone').value = p.phone || '';
        if (U('gstin')) U('gstin').value = p.gstin || '';
        if (U('state')) U('state').value = p.state || db.biz.state || 'Odisha';
        if (U('addr')) U('addr').value = p.addr || '';
      }
    };
  }

  // Material input change -> autofill unit and smart rate conversion
  const matInput = U('mat');
  if (matInput) {
    const onMatSelect = () => {
      const val = matInput.value.trim().toLowerCase();
      const m = (db.items || []).find(x => x.n.toLowerCase() === val);
      if (m) {
        const unitSelect = U('u');
        const rateInput = U('r');
        const masterUnit = m.u || 'kg';
        const masterRate = parseFloat(m.r) || 0;

        if (unitSelect) {
          const curUnit = unitSelect.value || masterUnit;
          if (curUnit && curUnit !== masterUnit && masterRate > 0) {
            if (rateInput) rateInput.value = convertRate(masterRate, masterUnit, curUnit);
          } else {
            unitSelect.value = masterUnit;
            if (rateInput) rateInput.value = masterRate;
          }
          unitSelect.dataset.prevUnit = unitSelect.value;
        }

        const q = parseFloat(U('q')?.value) || 0;
        const r = parseFloat(U('r')?.value) || 0;
        if (U('amt')) U('amt').value = (q * r).toFixed(2);
        ptot();
      }
    };
    matInput.onchange = onMatSelect;
    matInput.oninput = () => {
      const val = matInput.value.trim().toLowerCase();
      if ((db.items || []).some(x => x.n.toLowerCase() === val)) {
        onMatSelect();
      }
    };
  }

  // Unit dropdown change -> auto-convert rate based on unit conversion matrix
  const unitSelect = U('u');
  if (unitSelect) {
    unitSelect.dataset.prevUnit = unitSelect.value || 'kg';
    unitSelect.onchange = () => {
      const newUnit = unitSelect.value;
      const prevUnit = unitSelect.dataset.prevUnit || 'kg';
      const rateInput = U('r');
      const curRate = parseFloat(rateInput?.value) || 0;

      if (curRate > 0) {
        rateInput.value = convertRate(curRate, prevUnit, newUnit);
      } else {
        const matVal = (U('mat')?.value || '').trim().toLowerCase();
        const m = (db.items || []).find(x => x.n.toLowerCase() === matVal);
        if (m && m.r) {
          rateInput.value = convertRate(m.r, m.u || 'kg', newUnit);
        }
      }
      unitSelect.dataset.prevUnit = newUnit;

      const q = parseFloat(U('q')?.value) || 0;
      const r = parseFloat(U('r')?.value) || 0;
      if (U('amt')) U('amt').value = (q * r).toFixed(2);
      ptot();
    };
  }

  // Qty * Rate -> Amount
  ['q', 'r'].forEach(id => {
    const el = U(id);
    if (el) {
      el.oninput = () => {
        const q = parseFloat(U('q')?.value) || 0;
        const r = parseFloat(U('r')?.value) || 0;
        if (U('amt')) {
          U('amt').value = (q * r).toFixed(2);
        }
        ptot();
      };
    }
  });

  if (U('amt')) U('amt').oninput = ptot;
  if (U('gst')) U('gst').oninput = ptot;

  // Live Cash in Hand liquidity check
  const checkBillCashLiquidity = () => {
    const paidInput = U('paid');
    const pmSelect = U('pm');
    const warnEl = U('cash_warn');
    const warnText = U('cash_warn_text');
    if (!paidInput || !pmSelect || !warnEl) return;

    const pm = pmSelect.value;
    const paidAmt = parseFloat(paidInput.value || 0);
    if (pm !== 'Cash' || paidAmt <= 0) {
      warnEl.style.display = 'none';
      return;
    }

    const paidPaisa = Math.round(paidAmt * 100);
    const existingDoc = billsState.editId ? db.docs.find(d => d.id === billsState.editId && d.type === 'bill') : null;
    const existingPayJeId = (existingDoc && existingDoc.pays && existingDoc.pays.length) ? existingDoc.pays[0].je : null;
    const check = checkCashLiquidity('1000', paidPaisa, existingPayJeId);

    if (!check.ok) {
      warnEl.style.display = 'block';
      if (warnText) {
        warnText.textContent = `Insufficient cash in hand balance (Available: ${fmt(Math.max(0, check.available))}, Required: ${fmt(paidPaisa)}). Please deposit funds or pay via Bank Account.`;
      }
    } else {
      warnEl.style.display = 'none';
    }
  };

  if (U('paid')) U('paid').oninput = checkBillCashLiquidity;
  if (U('pm')) U('pm').onchange = checkBillCashLiquidity;
  checkBillCashLiquidity();

  // File Picker & Camera Scanner
  const fileInput = U('files');
  const uploadBtn = $('#u_btn_upload_bill');
  if (uploadBtn && fileInput) {
    uploadBtn.onclick = () => fileInput.click();
  }

  const cameraBtn = $('#u_btn_camera_bill');
  if (cameraBtn) {
    cameraBtn.onclick = () => {
      openCameraScanner(async att => {
        const r = await fetch(att.data);
        const b = await r.blob();
        b.name = att.name;
        billsState.files.push({ name: att.name, type: att.type, blob: b, data: att.data, url: att.url || '' });
        drawAttachedFiles();
      });
    };
  }

  if (fileInput) {
    fileInput.onchange = async e => {
      for (const f of e.target.files) {
        if (!(f.type.startsWith('image/') || f.type === 'application/pdf' || /\.pdf$/i.test(f.name))) {
          toast('Only JPG, PNG or PDF files are allowed');
          continue;
        }
        const b = await shrink(f);
        billsState.files.push({ name: b.name, type: b.type || 'application/pdf', blob: b });
      }
      fileInput.value = '';
      drawAttachedFiles();
    };
  }

  function drawAttachedFiles() {
    const fl = U('fl');
    if (!fl) return;
    fl.innerHTML = billFilePillsHTML(billsState.files);
    fl.querySelectorAll('.u-prev-file').forEach(a => {
      a.onclick = ev => {
        ev.preventDefault();
        const idx = parseInt(a.dataset.x, 10);
        const file = billsState.files[idx];
        if (file) {
          const files = billsState.files.map(f => ({
            name: f.name,
            type: f.type,
            size: f.blob?.size || f.size || 0,
            url: f.url || '',
            data: f.url || f.data || (f.blob ? URL.createObjectURL(f.blob) : '')
          }));
          showAttachmentViewer(files, idx);
        }
      };
    });
    fl.querySelectorAll('.u-del-file').forEach(a => {
      a.onclick = ev => {
        ev.preventDefault();
        const idx = parseInt(a.dataset.x, 10);
        if (!isNaN(idx)) {
          billsState.files.splice(idx, 1);
          drawAttachedFiles();
        }
      };
    });
  }

  // Render existing files (edit mode) with working preview/remove handlers
  if (billsState.files.length) drawAttachedFiles();

  // Clear Form
  const clrBtn = U('clr');
  if (clrBtn) {
    clrBtn.onclick = () => {
      billsState.editId = null;
      billsState.selectedPartyId = null;
      billsState.files = [];
      container.innerHTML = renderBills();
      bindBillsEvents();
    };
  }

  // Save / Update Purchase Bill
  const handleSaveBill = async () => {
    const supName = (U('sup')?.value || '').trim();
    const supPhone = (U('phone')?.value || '').trim();
    const supGstin = (U('gstin')?.value || '').trim().toUpperCase();
    const supState = (U('state')?.value || db.biz.state || 'Odisha').trim();
    const supAddr = (U('addr')?.value || '').trim();
    const billNo = (U('no')?.value || '').trim();
    const date = U('dt')?.value || today();
    const mat = (U('mat')?.value || '').trim();
    const q = parseFloat(U('q')?.value) || 0;
    const u = U('u')?.value || 'kg';
    const r = parseFloat(U('r')?.value) || 0;
    const amt = parseFloat(U('amt')?.value) || 0;
    const gst = parseFloat(U('gst')?.value) || 0;
    const tot = parseFloat(U('tot')?.value) || (amt + gst);
    const paidAmt = parseFloat(U('paid')?.value) || 0;
    const pm = U('pm')?.value || 'Cash';
    const nt = (U('nt')?.value || '').trim();

    if (!supName) return toast('Supplier name is required');
    if (supGstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/.test(supGstin)) {
      return toast('Supplier GSTIN format looks wrong');
    }
    if (!date) return toast('Bill date is required');
    if (tot <= 0) return toast('Amount must be above zero');

    const totalPaisa = Math.round(tot * 100);
    const paidPaisa = Math.min(Math.round(paidAmt * 100), totalPaisa);
    const isEditMode = Boolean(billsState.editId);
    const existingDoc = isEditMode ? db.docs.find(d => d.id === billsState.editId && d.type === 'bill') : null;

    // Validate Cash in Hand liquidity if paid upfront in cash
    if (pm === 'Cash' && paidPaisa > 0) {
      const existingPayJeId = (existingDoc && existingDoc.pays && existingDoc.pays.length) ? existingDoc.pays[0].je : null;
      const check = checkCashLiquidity('1000', paidPaisa, existingPayJeId);
      if (!check.ok) {
        return toast(check.error || 'Insufficient cash in hand balance. Please deposit funds or pay via Bank Account.');
      }
    }

    // Check duplicate supplier bill number if not editing
    const duplicate = db.docs.some(d => d.type === 'bill' && d.id !== billsState.editId && billNo && (d.sno || '').toLowerCase() === billNo.toLowerCase() && (d.sup || pn(d.party)).toLowerCase() === supName.toLowerCase() && !d.cancelled);
    if (duplicate) return toast("This supplier's bill no. is already saved");

    // Find or create supplier in db.parties
    let supplierParty = billsState.selectedPartyId ? db.parties.find(p => p.id === billsState.selectedPartyId) : null;
    if (!supplierParty) {
      supplierParty = db.parties.find(p => p.name.trim().toLowerCase() === supName.toLowerCase() && isS(p));
    }
    if (!supplierParty) {
      supplierParty = {
        id: uid(),
        name: supName,
        type: 'supplier',
        phone: supPhone,
        gstin: supGstin,
        state: supState,
        addr: supAddr,
        terms: '0'
      };
      db.parties.push(supplierParty);
    } else {
      if (supName) supplierParty.name = supName;
      if (supPhone) supplierParty.phone = supPhone;
      if (supGstin) supplierParty.gstin = supGstin;
      if (supState) supplierParty.state = supState;
      if (supAddr) supplierParty.addr = supAddr;
    }

    const basePaisa = Math.round(amt * 100);
    const gstPaisa = Math.round(gst * 100);
    const diff = totalPaisa - (basePaisa + gstPaisa);

    // Post purchase double-entry journal entry lines:
    // Debit: 5000 Purchases / Cost of Goods Sold (for basePaisa)
    // Debit: 1300 Input GST (for gstPaisa) if gst > 0
    // Credit: 2000 Accounts Payable (for totalPaisa) with p: supplierParty.id
    const jLines = [
      { a: '5000', d: basePaisa + (diff > 0 ? diff : 0), c: 0, p: supplierParty.id }
    ];
    if (gstPaisa > 0) {
      jLines.push({ a: '1300', d: gstPaisa, c: 0, p: supplierParty.id });
    }
    if (diff < 0) {
      jLines.push({ a: '4200', d: 0, c: Math.abs(diff), p: supplierParty.id });
    }
    jLines.push({ a: '2000', d: 0, c: totalPaisa, p: supplierParty.id });

    let jeId = null;
    if (existingDoc && existingDoc.je) {
      // UPSERT / UPDATE: Update existing journal entry in-place instead of creating a duplicate
      const existingJe = db.entries.find(e => e.id === existingDoc.je);
      if (existingJe) {
        existingJe.date = date;
        existingJe.narr = (billNo ? billNo + ' - ' : '') + supName + (mat ? ' (' + mat + ')' : '');
        existingJe.meta = { ...existingJe.meta, docNo: billNo, mat };
        existingJe.lines = jLines;
        jeId = existingJe.id;
      }
    }

    if (!jeId) {
      const je = post({
        date,
        src: 'bill',
        narr: (billNo ? billNo + ' - ' : '') + supName + (mat ? ' (' + mat + ')' : ''),
        meta: { docNo: billNo, mat },
        lines: jLines
      });
      jeId = je.id;
    }

    const docId = existingDoc ? existingDoc.id : uid();
    const internalNo = existingDoc ? existingDoc.no : ('BILL-' + String(db.docs.filter(d => d.type === 'bill').length + 1).padStart(4, '0'));

    const docObj = existingDoc || {
      id: docId,
      type: 'bill',
      pays: []
    };

    docObj.no = internalNo;
    docObj.sno = billNo;
    docObj.date = date;
    docObj.due = date;
    docObj.party = supplierParty.id;
    docObj.sup = supName;
    docObj.phone = supPhone;
    docObj.gstin = supGstin;
    docObj.state = supState;
    docObj.addr = supAddr;
    docObj.mat = mat;
    docObj.q = q;
    docObj.u = u;
    docObj.r = r;
    docObj.desc = mat + (q ? ' (' + q + ' ' + u + ')' : '');
    docObj.base = basePaisa;
    docObj.gst = gstPaisa;
    docObj.rate = q && r ? Math.round(gst / amt * 100) : 0;
    const isIntra = isIntraState({ state: supState, gstin: supGstin });
    const halfGst = Math.floor(gstPaisa / 2);
    docObj.tax = gstPaisa > 0 ? (isIntra ? { cg: halfGst, sg: gstPaisa - halfGst } : { ig: gstPaisa }) : {};
    docObj.total = totalPaisa;
    docObj.paid = paidAmt;
    docObj.pm = pm;
    docObj.nt = nt;
    docObj.je = jeId;
    docObj.hasFiles = billsState.files.length > 0;
    docObj.cancelled = false;

    // Handle upfront payment receipt if paidAmt > 0 and not credit
    if (paidAmt > 0 && pm !== 'Credit') {
      const paidPaisa = Math.min(Math.round(paidAmt * 100), totalPaisa);
      const cashAcct = pm === 'Cash' ? '1000' : '1010';
      let pJeId = null;

      if (existingDoc && existingDoc.pays && existingDoc.pays.length && existingDoc.pays[0].je) {
        const existingPJe = db.entries.find(e => e.id === existingDoc.pays[0].je);
        if (existingPJe) {
          existingPJe.date = date;
          existingPJe.lines = [
            { a: '2000', d: paidPaisa, c: 0, p: supplierParty.id },
            { a: cashAcct, d: 0, c: paidPaisa, p: supplierParty.id }
          ];
          existingPJe.narr = `${supplierParty.name} - Payment for Bill ${billNo || internalNo}`;
          existingPJe.meta = {
            ...existingPJe.meta,
            ref: billNo || internalNo,
            docNo: billNo || internalNo,
            billId: docId,
            party: supplierParty.id,
            partyName: supplierParty.name,
            acct: cashAcct,
            method: pm,
            desc: `${mat ? mat + (q ? ' (' + q + ' ' + u + ')' : '') : 'Material purchase'} - Bill ${billNo || internalNo}`
          };
          existingDoc.pays[0].amt = paidPaisa;
          existingDoc.pays[0].date = date;
          existingDoc.pays[0].method = pm;
          existingDoc.pays[0].acct = cashAcct;
          pJeId = existingPJe.id;
        }
      }

      if (!pJeId) {
        const pJe = post({
          date,
          src: 'out',
          narr: `${supplierParty.name} - Payment for Bill ${billNo || internalNo}`,
          meta: {
            ref: billNo || internalNo,
            docNo: billNo || internalNo,
            billId: docId,
            party: supplierParty.id,
            partyName: supplierParty.name,
            acct: cashAcct,
            cat: '2000',
            method: pm,
            desc: `${mat ? mat + (q ? ' (' + q + ' ' + u + ')' : '') : 'Material purchase'} - Bill ${billNo || internalNo}`
          },
          lines: [
            { a: '2000', d: paidPaisa, c: 0, p: supplierParty.id },
            { a: cashAcct, d: 0, c: paidPaisa, p: supplierParty.id }
          ]
        });
        docObj.pays = [{ je: pJe.id, amt: paidPaisa, date, method: pm, acct: cashAcct }];
      }
    } else {
      if (existingDoc && existingDoc.pays && existingDoc.pays.length && existingDoc.pays[0].je) {
        try { reverse(existingDoc.pays[0].je); } catch (e) { }
      }
      docObj.pays = [];
      docObj.paid = 0;
    }

    if (!existingDoc) {
      db.docs.push(docObj);
    }

    // Save files in IndexedDB & sync to Cloudinary if available
    if (billsState.files.length) {
      for (const f of billsState.files) {
        if (!f.url) {
          try {
            let dataUrl = f.data;
            if (!dataUrl && f.blob) {
              dataUrl = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.readAsDataURL(f.blob);
              });
            }
            if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
              const res = await fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ file: dataUrl, folder: 'bufin/bills' })
              });
              if (res.ok) {
                const json = await res.json();
                if (json.url) {
                  f.url = json.url;
                  f.public_id = json.public_id;
                  f.cloud = 'cloudinary';
                }
              }
            }
          } catch (err) {
            console.warn('Cloudinary upload deferred/failed:', err);
          }
        }
      }
      try {
        await pPut({ id: docId, files: billsState.files });
      } catch (e) {
        console.warn('Could not store files in IndexedDB:', e);
      }
    }

    save();
    toast(isEditMode ? 'Purchase bill updated successfully' : 'Purchase bill saved successfully');

    billsState.tab = 'rec';
    billsState.editId = null;
    billsState.selectedPartyId = null;
    billsState.files = [];
    container.innerHTML = renderBills();
    bindBillsEvents();
  };

  const saveBtn = U('save');
  if (saveBtn) saveBtn.onclick = handleSaveBill;

  const saveTopBtn = U('btn_save_top');
  if (saveTopBtn) saveTopBtn.onclick = handleSaveBill;

  // Search filter
  const sInput = U('s');
  if (sInput) {
    sInput.oninput = debounce(() => {
      billsState.q = sInput.value;
      container.innerHTML = renderBills();
      bindBillsEvents();
      const nInput = $('#u_s');
      if (nInput) {
        nInput.focus();
        nInput.setSelectionRange(nInput.value.length, nInput.value.length);
      }
    }, 300);
  }

  // Export CSV
  const csvBtn = U('csv');
  if (csvBtn) {
    csvBtn.onclick = async () => {
      const bills = db.docs.filter(d => d.type === 'bill').reverse();
      const h = 'Date,Supplier,Bill no,Material,Qty,Unit,Rate,Amount,GST,Total,Paid,Balance,Method\n';
      const b = bills.map(d => {
        const total = (d.total || 0) / 100;
        const paid = d.paid !== undefined ? d.paid : ((d.total || 0) - out(d)) / 100;
        const bal = total - paid;
        return [
          d.date,
          d.sup || pn(d.party),
          d.sno || d.no || '',
          d.mat || d.desc || '',
          d.q || '',
          d.u || '',
          d.r || '',
          ((d.base || 0) / 100).toFixed(2),
          ((d.gst || 0) / 100).toFixed(2),
          total.toFixed(2),
          paid.toFixed(2),
          bal.toFixed(2),
          d.pm || ''
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
      }).join('\n');

      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([h + b], { type: 'text/csv' }));
      a.download = 'purchase_bills_' + today() + '.csv';
      a.click();
      toast('CSV exported');
    };
  }

  // Records Table Actions: View files, Edit, Mark paid, Delete
  let murl = [];
  const mclose = () => {
    murl.forEach(URL.revokeObjectURL);
    murl = [];
    const m = U('m');
    if (m) m.style.display = 'none';
    const mb = U('mb');
    if (mb) mb.innerHTML = '';
  };
  const mxBtn = U('mx');
  if (mxBtn) mxBtn.onclick = mclose;

  container.querySelectorAll('#u_b button[data-ba]').forEach(btn => {
    btn.onclick = async () => {
      const action = btn.dataset.ba;
      const id = btn.dataset.id;
      const doc = db.docs.find(d => d.id === id && d.type === 'bill');
      if (!doc) return;

      if (action === 'more') {
        const isPaid = doc.pays && doc.pays.length && doc.pays.reduce((s, p) => s + (p.a || 0), 0) >= (doc.total || 0);
        const sheetItems = [
          {
            label: 'View / Print Bill Voucher',
            icon: '📄',
            onClick: () => {
              showDoc(id);
            }
          },
          {
            label: 'Edit Purchase Bill',
            icon: '✏️',
            onClick: async () => {
              billsState.editId = id;
              billsState.selectedPartyId = doc.party || null;
              billsState.tab = 'new';
              try {
                const rec = await pGet(id);
                billsState.files = rec?.files ? [...rec.files] : [];
              } catch (e) {
                billsState.files = [];
              }
              container.innerHTML = renderBills();
              bindBillsEvents();
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }
        ];
        if (doc.hasFiles) {
          sheetItems.push({
            label: '📎 View Attachments',
            icon: '📎',
            onClick: async () => {
              try {
                const rec = await pGet(id);
                const files = (rec?.files || []).map(f => ({
                  name: f.name,
                  type: f.type,
                  size: f.blob?.size || f.size || 0,
                  url: f.url || '',
                  data: f.url || f.data || (f.blob ? URL.createObjectURL(f.blob) : '')
                }));
                if (!files.length) return toast('No files attached');
                showAttachmentViewer(files, 0);
              } catch (e) {
                toast('Could not open files: ' + (e?.message || e));
              }
            }
          });
        }
        if (!isPaid && !doc.cancelled) {
          sheetItems.push({
            label: 'Mark as Paid',
            icon: '💵',
            onClick: () => {
              markBillPaid(doc, () => {
                container.innerHTML = renderBills();
                bindBillsEvents();
              });
            }
          });
        }
        sheetItems.push({
          label: 'Delete Purchase Bill',
          icon: '🗑️',
          danger: true,
          onClick: () => {
            if (confirm(`Are you sure you want to delete purchase bill ${doc.sno || doc.no || ''}?`)) {
              if (doc.je) {
                try { reverse(doc.je); } catch (e) { console.warn('Could not reverse je:', e); }
              }
              if (doc.pays && doc.pays.length) {
                doc.pays.forEach(p => {
                  try { reverse(p.je); } catch (e) { }
                });
              }
              doc.cancelled = true;
              db.docs = db.docs.filter(d => d !== doc);
              save();
              toast('Purchase bill deleted');
              container.innerHTML = renderBills();
              bindBillsEvents();
            }
          }
        });
        showActionSheet(`Purchase Bill #${doc.sno || doc.no || ''}`, `${esc(doc.sup || pn(doc.party))} • ${fmt(doc.total)}`, sheetItems);
        return;
      }

      if (action === 'v') {
        try {
          const rec = await pGet(id);
          const files = (rec?.files || []).map(f => ({
            name: f.name,
            type: f.type,
            size: f.blob?.size || f.size || 0,
            url: f.url || '',
            data: f.url || f.data || (f.blob ? URL.createObjectURL(f.blob) : '')
          }));
          if (!files.length) return toast('No files attached');
          showAttachmentViewer(files, 0);
        } catch (e) {
          toast('Could not open files: ' + (e?.message || e));
        }
      } else if (action === 'e') {
        // Edit bill
        billsState.editId = id;
        billsState.selectedPartyId = doc.party || null;
        billsState.tab = 'new';
        try {
          const rec = await pGet(id);
          billsState.files = rec?.files ? [...rec.files] : [];
        } catch (e) {
          billsState.files = [];
        }
        container.innerHTML = renderBills();
        bindBillsEvents();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (action === 'p') {
        // Mark paid with account selection (Cash vs Bank)
        markBillPaid(doc, () => {
          container.innerHTML = renderBills();
          bindBillsEvents();
        });
      } else if (action === 'd') {
        // Delete
        if (btn.dataset.confirmed) {
          if (doc.je) {
            try { reverse(doc.je); } catch (e) { console.warn('Could not reverse bill je:', e); }
          }
          if (doc.pays && doc.pays.length) {
            doc.pays.forEach(p => {
              try { reverse(p.je); } catch (e) {}
            });
          }
          doc.cancelled = true;
          db.docs = db.docs.filter(d => d !== doc);
          try { await pDel(id); } catch (e) {}
          save();
          toast('Purchase bill deleted');
          container.innerHTML = renderBills();
          bindBillsEvents();
        } else {
          btn.dataset.confirmed = '1';
          btn.textContent = 'Confirm?';
          setTimeout(() => {
            btn.textContent = 'Delete';
            delete btn.dataset.confirmed;
          }, 3000);
        }
      }
    };
  });

  // ================= INVENTORY STOCK EVENT LISTENERS =================
  // Inventory: Search input (debounced 300ms)
  const invSearch = $('#inv_search_q');
  if (invSearch) {
    invSearch.oninput = debounce(() => {
      billsState.invQ = invSearch.value;
      container.innerHTML = renderBills();
      bindBillsEvents();
      const n = $('#inv_search_q');
      if (n) {
        n.focus();
        n.setSelectionRange(n.value.length, n.value.length);
      }
    }, 300);
  }

  // Inventory: Supplier filter
  const invSupFilter = $('#inv_filter_sup');
  if (invSupFilter) {
    invSupFilter.onchange = () => {
      billsState.invSupplier = invSupFilter.value;
      container.innerHTML = renderBills();
      bindBillsEvents();
    };
  }

  // Inventory: From date
  const invFrom = $('#inv_from_date');
  if (invFrom) {
    invFrom.onchange = () => {
      billsState.invFromDate = invFrom.value;
      container.innerHTML = renderBills();
      bindBillsEvents();
    };
  }

  // Inventory: To date
  const invTo = $('#inv_to_date');
  if (invTo) {
    invTo.onchange = () => {
      billsState.invToDate = invTo.value;
      container.innerHTML = renderBills();
      bindBillsEvents();
    };
  }

  // Inventory: Reset filters
  const invReset = $('#inv_btn_reset');
  if (invReset) {
    invReset.onclick = () => {
      billsState.invQ = '';
      billsState.invSupplier = '';
      billsState.invFromDate = '';
      billsState.invToDate = '';
      container.innerHTML = renderBills();
      bindBillsEvents();
    };
  }

  // Inventory: Export CSV
  const invCsv = $('#inv_btn_csv');
  if (invCsv) {
    invCsv.onclick = () => {
      const stock = getInventoryStock();
      const headers = 'Material Name,Total Purchased,Total Sold,Current Stock,Unit,Avg Rate (Rs),Latest Rate (Rs),Total Investment (Rs),Stock Valuation (Rs),Suppliers,Linked Bills\n';
      const rows = stock.map(s => [
        `"${(s.name || '').replace(/"/g, '""')}"`,
        s.purchasedQty.toFixed(2),
        s.soldQty.toFixed(2),
        s.currentStock.toFixed(2),
        s.unitLabel,
        s.avgRate.toFixed(2),
        s.latestRate.toFixed(2),
        s.totalInvestment.toFixed(2),
        s.stockValuation.toFixed(2),
        `"${(s.suppliers || []).join(', ').replace(/"/g, '""')}"`,
        `"${(s.bills || []).map(b => b.ref).join(', ').replace(/"/g, '""')}"`
      ].join(',')).join('\n');

      const blob = new Blob([headers + rows], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `Inventory_Stock_${today()}.csv`;
      a.click();
      toast('Inventory CSV exported');
    };
  }

  // Inventory: Clickable Linked Purchase Bill Tags (Opens Bill Detail Modal)
  container.querySelectorAll('#pd-tab-inventory [data-bill-id]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      showDoc(btn.dataset.billId);
    };
  });
}
