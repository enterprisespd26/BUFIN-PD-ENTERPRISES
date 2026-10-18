import { $, esc, toast, toWebpThumbnail } from './utils.js';

// ==========================================
// 0. PROFESSIONAL UI KIT (SVG icons + styles)
// ==========================================
const svg = (paths, size = 16, sw = 1.8) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export const ICONS = {
  paperclip: s => svg('<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>', s),
  upload:    s => svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>', s),
  camera:    s => svg('<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>', s),
  flip:      s => svg('<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/>', s),
  image:     s => svg('<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>', s),
  file:      s => svg('<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>', s),
  x:         s => svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', s, 2.2),
  check:     s => svg('<polyline points="20 6 9 17 4 12"/>', s, 2.4),
  retake:    s => svg('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>', s),
  download:  s => svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>', s),
  zoomIn:    s => svg('<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/>', s),
  zoomOut:   s => svg('<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/>', s),
  alert:     s => svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/>', s),
  scan:      s => svg('<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" x2="17" y1="12" y2="12"/>', s),
  chevL:     s => svg('<polyline points="15 18 9 12 15 6"/>', s, 2.2),
  chevR:     s => svg('<polyline points="9 18 15 12 9 6"/>', s, 2.2),
  cloud:     s => svg('<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>', s),
};

export function injectAttachmentStyles() {
  if (document.getElementById('bufinAttStyles')) return;
  const st = document.createElement('style');
  st.id = 'bufinAttStyles';
  st.textContent = `
  :root{--bf-pri:#2563eb;--bf-pri-d:#1d4ed8;--bf-ink:#0f172a;--bf-mut:#64748b;--bf-line:#e2e8f0;--bf-soft:#f8fafc}

  /* ---------- Buttons ---------- */
  .bf-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:36px;padding:0 14px;border-radius:8px;
    font:600 13px/1 inherit;font-family:inherit;letter-spacing:.1px;cursor:pointer;white-space:nowrap;
    border:1px solid var(--bf-line);background:#fff;color:var(--bf-ink);
    box-shadow:0 1px 2px rgba(15,23,42,.05);transition:background .15s,border-color .15s,box-shadow .15s,transform .05s;text-decoration:none}
  .bf-btn:hover{background:#f1f5f9;border-color:#cbd5e1}
  .bf-btn:active{transform:translateY(1px)}
  .bf-btn:focus-visible{outline:2px solid var(--bf-pri);outline-offset:2px}
  .bf-btn svg{flex:none;color:var(--bf-mut)}
  .bf-btn:hover svg{color:var(--bf-ink)}
  .bf-btn.pri{background:var(--bf-pri);border-color:var(--bf-pri);color:#fff;box-shadow:0 1px 2px rgba(37,99,235,.3)}
  .bf-btn.pri:hover{background:var(--bf-pri-d);border-color:var(--bf-pri-d)}
  .bf-btn.pri svg{color:#fff}
  .bf-btn.lg{height:42px;padding:0 20px;font-size:14px}
  .bf-btn.ghost-dark{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.18);color:#fff;box-shadow:none}
  .bf-btn.ghost-dark:hover{background:rgba(255,255,255,.18)}
  .bf-btn.ghost-dark svg{color:#e2e8f0}

  /* ---------- Attachment panel ---------- */
  .bf-att{margin-top:16px;border:1px solid var(--bf-line);border-radius:12px;background:#fff;overflow:hidden}
  .bf-att-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
    padding:12px 16px;background:var(--bf-soft);border-bottom:1px solid var(--bf-line)}
  .bf-att-title{display:flex;align-items:center;gap:10px}
  .bf-att-ico{width:34px;height:34px;border-radius:9px;background:#eff6ff;color:var(--bf-pri);display:grid;place-items:center}
  .bf-att-title b{display:block;font-size:13.5px;color:var(--bf-ink);font-weight:650}
  .bf-att-title small{display:block;font-size:12px;color:var(--bf-mut);margin-top:1px}
  .bf-att-actions{display:flex;gap:8px;flex-wrap:wrap}
  .bf-att-body{padding:14px 16px}
  .bf-att-empty{display:flex;align-items:center;gap:12px;padding:14px;border:1.5px dashed #cbd5e1;border-radius:10px;
    color:var(--bf-mut);font-size:12.5px;background:#fcfdff}
  .bf-att-empty svg{color:#94a3b8;flex:none}
  .bf-files{display:flex;flex-wrap:wrap;gap:10px}
  .bf-file{display:flex;align-items:center;gap:10px;padding:8px 10px 8px 8px;border:1px solid var(--bf-line);border-radius:10px;
    background:#fff;max-width:300px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
  .bf-file:hover{border-color:#bfdbfe;background:#f8fbff}
  .bf-thumb{width:38px;height:38px;border-radius:8px;overflow:hidden;flex:none;display:grid;place-items:center;
    background:#eff6ff;color:var(--bf-pri)}
  .bf-thumb.pdf{background:#fef2f2;color:#dc2626}
  .bf-thumb img{width:100%;height:100%;object-fit:cover}
  .bf-file-meta{min-width:0;display:flex;flex-direction:column}
  .bf-file-meta a{font-size:12.5px;font-weight:600;color:var(--bf-ink);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:170px}
  .bf-file-meta a:hover{color:var(--bf-pri)}
  .bf-file-meta span{font-size:11px;color:var(--bf-mut);display:flex;align-items:center;gap:6px;margin-top:2px}
  .bf-cloud{display:inline-flex;align-items:center;gap:3px;color:#0284c7;font-weight:600}
  .bf-file-x{margin-left:4px;width:24px;height:24px;border-radius:6px;border:none;background:transparent;color:#94a3b8;cursor:pointer;display:grid;place-items:center;flex:none}
  .bf-file-x:hover{background:#fee2e2;color:#dc2626}

  /* ---------- Camera modal ---------- */
  .bf-cam-ov{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;
    background:rgba(2,6,23,.78);backdrop-filter:blur(10px);animation:bfFade .18s ease;overflow:hidden}
  @keyframes bfFade{from{opacity:0}to{opacity:1}}
  @keyframes bfPop{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
  .bf-cam{width:100%;max-width:640px;height:min(660px, 94dvh);max-height:94dvh;background:#0b1220;border:1px solid rgba(255,255,255,.1);border-radius:18px;overflow:hidden;
    box-shadow:0 30px 70px -10px rgba(0,0,0,.6);display:flex;flex-direction:column;animation:bfPop .22s ease;color:#e2e8f0}
  .bf-cam-head{flex:none;display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid rgba(255,255,255,.08);background:#0b1220}
  .bf-cam-head .t{display:flex;align-items:center;gap:10px}
  .bf-cam-head .ic{width:32px;height:32px;border-radius:9px;background:rgba(37,99,235,.18);color:#93c5fd;display:grid;place-items:center}
  .bf-cam-head b{display:block;font-size:13.5px;color:#fff;font-weight:650}
  .bf-cam-head small{display:block;font-size:11px;color:#94a3b8;margin-top:1px}
  .bf-cam-close{width:44px;height:44px;min-width:44px;min-height:44px;border-radius:50%;border:1.5px solid rgba(255,255,255,.25);background:rgba(255,255,255,.12);color:#fff;cursor:pointer;display:grid;place-items:center;transition:all .15s}
  .bf-cam-close:hover{background:rgba(239,68,68,.85);border-color:#ef4444;color:#fff}
  .bf-stage{flex:1;min-height:0;position:relative;background:#000;overflow:hidden;width:100%}
  .bf-stage video,.bf-stage img.bf-shot{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
  .bf-vignette{position:absolute;inset:0;pointer-events:none;box-shadow:inset 0 0 100px rgba(0,0,0,.45)}
  .bf-frame{position:absolute;inset:8% 10%;pointer-events:none}
  .bf-frame i{position:absolute;width:26px;height:26px;border:3px solid #fff;opacity:.95;filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))}
  .bf-frame i:nth-child(1){top:0;left:0;border-right:0;border-bottom:0;border-top-left-radius:8px}
  .bf-frame i:nth-child(2){top:0;right:0;border-left:0;border-bottom:0;border-top-right-radius:8px}
  .bf-frame i:nth-child(3){bottom:0;left:0;border-right:0;border-top:0;border-bottom-left-radius:8px}
  .bf-frame i:nth-child(4){bottom:0;right:0;border-left:0;border-top:0;border-bottom-right-radius:8px}
  .bf-scanline{position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#60a5fa,transparent);
    box-shadow:0 0 14px 2px rgba(96,165,250,.7);animation:bfScan 2.6s ease-in-out infinite}
  @keyframes bfScan{0%,100%{top:4%}50%{top:96%}}
  .bf-hint{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);display:flex;align-items:center;gap:6px;
    padding:6px 12px;border-radius:999px;background:rgba(15,23,42,.78);backdrop-filter:blur(6px);
    color:#f1f5f9;font-size:11.5px;font-weight:500;border:1px solid rgba(255,255,255,.14);white-space:nowrap}
  .bf-status{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:10px;
    text-align:center;padding:24px;background:rgba(2,6,23,.85);color:#e2e8f0;font-size:13px;line-height:1.5}
  .bf-status .ico{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:rgba(251,191,36,.15);color:#fbbf24}
  .bf-status .spin{width:26px;height:26px;border:3px solid rgba(255,255,255,.2);border-top-color:#60a5fa;border-radius:50%;animation:bfSpin .8s linear infinite}
  @keyframes bfSpin{to{transform:rotate(360deg)}}
  .bf-status small{color:#94a3b8;font-size:11.5px}
  .bf-cam-foot{flex:none;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:10px;padding:12px 16px;border-top:1px solid rgba(255,255,255,.08);background:#0b1220}
  .bf-cam-foot .l{display:flex;justify-content:flex-start}
  .bf-cam-foot .r{display:flex;justify-content:flex-end}
  .bf-shutter{width:60px;height:60px;border-radius:50%;border:3.5px solid #fff;background:transparent;padding:3px;cursor:pointer;display:grid;place-items:center;
    transition:transform .08s}
  .bf-shutter span{display:block;width:100%;height:100%;border-radius:50%;background:#fff;transition:background .15s,transform .15s}
  .bf-shutter:hover span{background:#dbeafe}
  .bf-shutter:active{transform:scale(.94)}
  .bf-shutter:focus-visible{outline:2px solid #60a5fa;outline-offset:3px}
  .bf-cam-foot.review{grid-template-columns:1fr 1fr}

  @media(max-width:640px){
    .bf-cam-ov{padding:0}
    .bf-cam{max-width:100vw;width:100vw;height:100vh;height:100dvh;max-height:100vh;max-height:100dvh;border-radius:0;border:none}
    .bf-cam-head{padding:10px 14px}
    .bf-cam-foot{padding:10px 14px;padding-bottom:max(12px, env(safe-area-inset-bottom, 12px))}
    .bf-shutter{width:56px;height:56px}
    .bf-btn .lbl-hide{display:none}
    .bf-frame{inset:6% 8%}
  }

  /* ---------- Attachment viewer ---------- */
  .bf-view{position:fixed;inset:0;z-index:10001;display:flex;flex-direction:column;background:rgba(2,6,23,.94);backdrop-filter:blur(10px)}
  .bf-view-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 20px;color:#fff;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(15,23,42,.8)}
  .bf-view-head .t{display:flex;align-items:center;gap:12px;min-width:0}
  .bf-view-head .t b{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bf-view-head .t small{color:#94a3b8;font-size:12px}
  .bf-view-tools{display:flex;gap:8px;align-items:center}
  .bf-view-body{flex:1;display:flex;align-items:center;justify-content:center;position:relative;overflow:auto;padding:20px}
  .bf-nav{position:absolute;top:50%;transform:translateY(-50%);width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.18);
    background:rgba(15,23,42,.7);color:#fff;cursor:pointer;display:grid;place-items:center;z-index:5}
  .bf-nav:hover{background:rgba(37,99,235,.85)}
  `;
  document.head.appendChild(st);
}

// ---- Reusable attachment panel (used by bills.js and others) ----
export function attachmentPanelHTML({ uploadId, cameraId, inputId, listId, listHTML, label = 'Bill Attachments & Weighbridge Slips', sub = 'JPG, PNG or PDF · scan with camera or upload' }) {
  return `
    <div class="bf-att">
      <div class="bf-att-head">
        <div class="bf-att-title">
          <div class="bf-att-ico">${ICONS.paperclip(18)}</div>
          <div><b>${esc(label)}</b><small>${esc(sub)}</small></div>
        </div>
        <div class="bf-att-actions">
          <button type="button" class="bf-btn" id="${uploadId}">${ICONS.upload(16)}<span>Attach file</span></button>
          <button type="button" class="bf-btn pri" id="${cameraId}">${ICONS.camera(16)}<span>Scan with camera</span></button>
        </div>
      </div>
      <input type="file" id="${inputId}" accept="image/*,.pdf,application/pdf" multiple style="display:none">
      <div class="bf-att-body" id="${listId}">${listHTML}</div>
    </div>`;
}

const emptyHTML = `<div class="bf-att-empty">${ICONS.scan(22)}<div>No documents attached yet. Attach the supplier invoice or capture the weighbridge slip with your camera.</div></div>`;

function fileCard(f, i, cls) {
  const isImg = f.type?.startsWith('image/');
  const isPdf = f.type?.includes('pdf') || /\.pdf$/i.test(f.name || '');
  const src = f.url || f.data || '';
  const thumbSrc = isImg && src ? toWebpThumbnail(src, 160) : src;
  const thumb = isImg && src
    ? `<div class="bf-thumb"><img src="${thumbSrc}" alt="" loading="lazy"></div>`
    : `<div class="bf-thumb ${isPdf ? 'pdf' : ''}">${isImg ? ICONS.image(18) : ICONS.file(18)}</div>`;
  const size = f.blob?.size || f.size || 0;
  return `
    <div class="bf-file">
      ${thumb}
      <div class="bf-file-meta">
        <a href="#" class="${cls.prev}" ${cls.attr}="${i}" title="${esc(f.name)}">${esc(f.name)}</a>
        <span>${formatFileSize(size)}${f.url ? `<em class="bf-cloud" style="font-style:normal">${ICONS.cloud(12)} Synced</em>` : ''}</span>
      </div>
      <button type="button" class="bf-file-x ${cls.del}" ${cls.attr}="${i}" title="Remove" aria-label="Remove file">${ICONS.x(14)}</button>
    </div>`;
}

// Used by bills.js (keeps its existing .u-prev-file / .u-del-file / data-x hooks)
export function billFilePillsHTML(files) {
  if (!files || !files.length) return emptyHTML;
  const cls = { prev: 'u-prev-file', del: 'u-del-file', attr: 'data-x' };
  return `<div class="bf-files">${files.map((f, i) => fileCard(f, i, cls)).join('')}</div>`;
}

// ==========================================
// 1. INDEXEDDB PERSISTENT ATTACHMENT STORAGE
// ==========================================
const DB_NAME = 'bufin_attachments';
const DB_VERSION = 1;
const STORE_NAME = 'files';

let dbInstance = null;

function getDb() {
  if (dbInstance) return Promise.resolve(dbInstance);
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE_NAME)) {
          d.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => { dbInstance = req.result; resolve(dbInstance); };
      req.onerror = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

export async function saveAttachments(recordId, files) {
  if (!recordId || !files || !files.length) return;
  const db = await getDb();
  if (!db) {
    try {
      const smallFiles = files.slice(0, 3).map(f => ({
        name: f.name, type: f.type, size: f.size, data: f.data?.slice(0, 500000), url: f.url
      }));
      localStorage.setItem(`bufin_att_${recordId}`, JSON.stringify(smallFiles));
    } catch (e) {}
    return;
  }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ id: String(recordId), files, at: new Date().toISOString() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch (e) { resolve(false); }
  });
}

export async function getAttachments(recordId) {
  if (!recordId) return [];
  const db = await getDb();
  if (!db) {
    try {
      const raw = localStorage.getItem(`bufin_att_${recordId}`);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(String(recordId));
      req.onsuccess = () => resolve(req.result?.files || []);
      req.onerror = () => resolve([]);
    } catch (e) { resolve([]); }
  });
}

export async function deleteAttachments(recordId) {
  if (!recordId) return;
  const db = await getDb();
  if (db) {
    try { db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(String(recordId)); } catch (e) {}
  }
  try { localStorage.removeItem(`bufin_att_${recordId}`); } catch (e) {}
}

// ==========================================
// 2. IMAGE COMPRESSION & FILE PARSING
// ==========================================
export function shrinkImage(file, maxDimension = 1600, quality = 0.84) {
  return new Promise((resolve) => {
    if (!file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => resolve({
        name: file.name, type: file.type || 'application/octet-stream', size: file.size, data: reader.result
      });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width, h = img.height;
      if (w > maxDimension || h > maxDimension) {
        if (w > h) { h = Math.round((h * maxDimension) / w); w = maxDimension; }
        else { w = Math.round((w * maxDimension) / h); h = maxDimension; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve({
        name: file.name.replace(/\.[^/.]+$/, '') + '.jpg',
        type: 'image/jpeg',
        size: Math.round((dataUrl.length * 3) / 4),
        data: dataUrl
      });
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

export function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '0 KB';
  if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}

// ==========================================
// 3. LIVE CAMERA SCANNER MODAL (capture → review → use)
// ==========================================
export function openCameraScanner(onCaptured) {
  injectAttachmentStyles();
  document.getElementById('bufinCameraOverlay')?.remove();

  let activeStream = null;
  let facing = 'environment';
  let shot = null; // captured object while reviewing

  const overlay = document.createElement('div');
  overlay.id = 'bufinCameraOverlay';
  overlay.className = 'bf-cam-ov';
  overlay.innerHTML = `
    <div class="bf-cam" role="dialog" aria-modal="true" aria-label="Document scanner">
      <div class="bf-cam-head">
        <div class="t">
          <div class="ic">${ICONS.scan(18)}</div>
          <div><b>Document Scanner</b><small>Invoices, receipts &amp; weighbridge slips</small></div>
        </div>
        <button type="button" class="bf-cam-close universal-close-btn" id="bfClose" aria-label="Close" title="Close">${ICONS.x(18)}</button>
      </div>

      <div class="bf-stage" id="bfStage">
        <video id="bfVideo" autoplay playsinline muted></video>
        <div class="bf-vignette"></div>
        <div class="bf-frame" id="bfFrame"><i></i><i></i><i></i><i></i><div class="bf-scanline"></div></div>
        <div class="bf-hint" id="bfHint">${ICONS.scan(14)} Align the document within the frame</div>
        <div class="bf-status" id="bfStatus"></div>
      </div>

      <div class="bf-cam-foot" id="bfFoot"></div>
    </div>`;
  document.body.appendChild(overlay);

  const $o = s => overlay.querySelector(s);
  const video = $o('#bfVideo');
  const stage = $o('#bfStage');
  const status = $o('#bfStatus');
  const foot = $o('#bfFoot');

  const showStatus = (html) => { status.innerHTML = html; status.style.display = 'flex'; };
  const hideStatus = () => { status.style.display = 'none'; };

  function stopStream() {
    if (activeStream) { activeStream.getTracks().forEach(t => t.stop()); activeStream = null; }
  }
  function close() {
    stopStream();
    window.removeEventListener('keydown', onKey);
    overlay.remove();
  }
  const onKey = e => { if (e.key === 'Escape') close(); };
  window.addEventListener('keydown', onKey);
  $o('#bfClose').onclick = close;
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });

  async function startStream() {
    stopStream();
    showStatus(`<div class="spin"></div><div>Starting camera…</div><small>Allow camera access if your browser asks</small>`);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera is not supported in this browser');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      activeStream = stream;
      video.srcObject = stream;
      await video.play().catch(() => {});
      hideStatus();
    } catch (err) {
      console.warn('Camera stream error:', err);
      showStatus(`<div class="ico">${ICONS.alert(22)}</div>
        <div><b style="color:#fff">Camera unavailable</b><br>${esc(err.message || 'Permission denied')}</div>
        <small>Use “Upload” below to choose an image or PDF instead.</small>`);
    }
  }

  function renderLive() {
    shot = null;
    stage.querySelector('img.bf-shot')?.remove();
    video.style.display = '';
    $o('#bfFrame').style.display = '';
    $o('#bfHint').style.display = '';
    foot.className = 'bf-cam-foot';
    foot.innerHTML = `
      <div class="l">
        <label class="bf-btn ghost-dark" style="cursor:pointer;margin:0">
          ${ICONS.upload(16)}<span class="lbl-hide">Upload</span>
          <input type="file" id="bfFallback" accept="image/*,application/pdf" style="display:none">
        </label>
      </div>
      <button type="button" class="bf-shutter" id="bfSnap" aria-label="Capture photo"><span></span></button>
      <div class="r">
        <button type="button" class="bf-btn ghost-dark" id="bfFlip">${ICONS.flip(16)}<span class="lbl-hide">Flip camera</span></button>
      </div>`;

    $o('#bfFlip').onclick = () => { facing = facing === 'environment' ? 'user' : 'environment'; startStream(); };

    $o('#bfSnap').onclick = () => {
      if (!video.videoWidth) return toast('Camera is not ready yet');
      const c = document.createElement('canvas');
      c.width = video.videoWidth; c.height = video.videoHeight;
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      const dataUrl = c.toDataURL('image/jpeg', 0.85);
      shot = {
        name: `scan_${new Date().toISOString().slice(0, 10)}_${Date.now().toString().slice(-4)}.jpg`,
        type: 'image/jpeg',
        size: Math.round((dataUrl.length * 3) / 4),
        data: dataUrl,
        date: new Date().toISOString()
      };
      renderReview();
    };

    $o('#bfFallback').onchange = async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      const att = await shrinkImage(file);
      if (att) { close(); onCaptured && onCaptured(att); toast('File attached'); }
    };
  }

  function renderReview() {
    video.style.display = 'none';
    $o('#bfFrame').style.display = 'none';
    $o('#bfHint').style.display = 'none';
    const img = document.createElement('img');
    img.className = 'bf-shot';
    img.src = shot.data;
    img.alt = 'Captured document';
    stage.insertBefore(img, stage.querySelector('.bf-vignette'));
    foot.className = 'bf-cam-foot review';
    foot.innerHTML = `
      <button type="button" class="bf-btn lg ghost-dark" id="bfRetake" style="width:100%">${ICONS.retake(16)}<span>Retake</span></button>
      <button type="button" class="bf-btn lg pri" id="bfUse" style="width:100%">${ICONS.check(16)}<span>Use this photo</span></button>`;
    $o('#bfRetake').onclick = renderLive;
    $o('#bfUse').onclick = () => {
      const out = shot;
      close();
      onCaptured && onCaptured(out);
      toast('Document captured');
    };
  }

  renderLive();
  startStream();
}

// ==========================================
// 4. ATTACHMENT CONTROL COMPONENT (UPLOAD + SCAN)
// ==========================================
export function renderAttachmentControl({ idPrefix, files = [], label = 'Receipts & Document Attachments' }) {
  injectAttachmentStyles();
  return `
    <div class="bf-att">
      <div class="bf-att-head">
        <div class="bf-att-title">
          <div class="bf-att-ico">${ICONS.paperclip(18)}</div>
          <div><b>${esc(label)}</b><small>JPG, PNG or PDF · scan with camera or upload</small></div>
        </div>
        <div class="bf-att-actions">
          <button type="button" class="bf-btn" id="${idPrefix}_btn_upload">${ICONS.upload(16)}<span>Attach file</span></button>
          <button type="button" class="bf-btn pri" id="${idPrefix}_btn_camera">${ICONS.camera(16)}<span>Scan with camera</span></button>
        </div>
      </div>
      <input type="file" id="${idPrefix}_file_input" multiple accept="image/*,application/pdf,.csv" style="display:none">
      <input type="file" id="${idPrefix}_camera_input" accept="image/*" capture="environment" style="display:none">
      <div class="bf-att-body" id="${idPrefix}_file_list">${renderAttachmentPills(idPrefix, files)}</div>
    </div>`;
}

export function renderAttachmentPills(idPrefix, files) {
  if (!files || !files.length) return emptyHTML;
  const cls = { prev: `${idPrefix}_btn_preview`, del: `${idPrefix}_btn_remove`, attr: 'data-idx' };
  return `<div class="bf-files">${files.map((f, i) => fileCard(f, i, cls)).join('')}</div>`;
}

export function bindAttachmentEvents({ idPrefix, getFiles, setFiles, onChange }) {
  const fileInput = document.getElementById(`${idPrefix}_file_input`);
  const uploadBtn = document.getElementById(`${idPrefix}_btn_upload`);
  const cameraBtn = document.getElementById(`${idPrefix}_btn_camera`);

  if (uploadBtn && fileInput) uploadBtn.onclick = () => fileInput.click();

  if (cameraBtn) {
    cameraBtn.onclick = () => {
      openCameraScanner(async att => {
        const current = getFiles();
        current.push(att);
        setFiles(current);
        refreshPills();
        if (onChange) onChange(current);
      });
    };
  }

  if (fileInput) {
    fileInput.onchange = async e => {
      for (const f of Array.from(e.target.files || [])) {
        const att = await shrinkImage(f);
        if (att) { const cur = getFiles(); cur.push(att); setFiles(cur); }
      }
      fileInput.value = '';
      refreshPills();
      if (onChange) onChange(getFiles());
    };
  }

  function refreshPills() {
    const listEl = document.getElementById(`${idPrefix}_file_list`);
    if (listEl) { listEl.innerHTML = renderAttachmentPills(idPrefix, getFiles()); bindPillEvents(); }
  }

  function bindPillEvents() {
    const listEl = document.getElementById(`${idPrefix}_file_list`);
    if (!listEl) return;
    listEl.querySelectorAll(`.${idPrefix}_btn_remove`).forEach(btn => {
      btn.onclick = e => {
        e.preventDefault();
        const cur = getFiles();
        cur.splice(parseInt(btn.dataset.idx, 10), 1);
        setFiles(cur);
        refreshPills();
        if (onChange) onChange(cur);
      };
    });
    listEl.querySelectorAll(`.${idPrefix}_btn_preview`).forEach(link => {
      link.onclick = e => {
        e.preventDefault();
        showAttachmentViewer(getFiles(), parseInt(link.dataset.idx, 10));
      };
    });
  }

  bindPillEvents();
}

// ==========================================
// 5. ATTACHMENT ZOOM & DOWNLOAD VIEWER MODAL
// ==========================================
export function showAttachmentViewer(files, initialIdx = 0) {
  if (!files || !files.length) return;
  injectAttachmentStyles();
  let curIdx = Math.max(0, Math.min(initialIdx, files.length - 1));
  let zoom = 1;

  document.getElementById('bufinAttachmentViewer')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'bufinAttachmentViewer';
  overlay.className = 'bf-view';

  const keyHandler = e => { if (e.key === 'Escape') close(); };
  function close() { overlay.remove(); window.removeEventListener('keydown', keyHandler); }

  function render() {
    const f = files[curIdx];
    const src = f.url || f.data || '';
    const isImg = f.type?.startsWith('image/');
    const isPdf = f.type?.includes('pdf') || /\.pdf$/i.test(f.name || '');

    overlay.innerHTML = `
      <div class="bf-view-head">
        <div class="t">
          <div class="bf-att-ico" style="background:rgba(37,99,235,.2);color:#93c5fd">${isImg ? ICONS.image(18) : ICONS.file(18)}</div>
          <div style="min-width:0"><b>${esc(f.name)}</b><small>${formatFileSize(f.size)} · ${curIdx + 1} of ${files.length}</small></div>
        </div>
        <div class="bf-view-tools">
          ${isImg ? `
            <button type="button" class="bf-btn ghost-dark" id="bfZo" aria-label="Zoom out">${ICONS.zoomOut(16)}</button>
            <button type="button" class="bf-btn ghost-dark" id="bfZr" style="min-width:64px">${Math.round(zoom * 100)}%</button>
            <button type="button" class="bf-btn ghost-dark" id="bfZi" aria-label="Zoom in">${ICONS.zoomIn(16)}</button>` : ''}
          <a href="${src}" download="${esc(f.name)}" target="_blank" rel="noopener noreferrer" class="bf-btn pri">${ICONS.download(16)}<span>Download</span></a>
          <button type="button" class="bf-btn ghost-dark universal-close-btn" id="bfVx" aria-label="Close" title="Close" style="min-width:44px;min-height:44px;width:44px;height:44px;border-radius:50%;display:grid;place-items:center">${ICONS.x(16)}</button>
        </div>
      </div>
      <div class="bf-view-body">
        ${files.length > 1 ? `
          <button type="button" class="bf-nav" id="bfPrev" style="left:16px" aria-label="Previous">${ICONS.chevL(20)}</button>
          <button type="button" class="bf-nav" id="bfNext" style="right:16px" aria-label="Next">${ICONS.chevR(20)}</button>` : ''}
        ${isImg
          ? `<img id="bfImg" src="${toWebpThumbnail(src, 1200)}" loading="lazy" style="max-width:90%;max-height:80vh;object-fit:contain;transition:transform .2s;transform:scale(${zoom});border-radius:6px;box-shadow:0 20px 40px rgba(0,0,0,.5)">`
          : isPdf
            ? `<iframe src="${src}" style="width:85%;height:80vh;border:none;border-radius:10px;background:#fff"></iframe>`
            : `<div style="background:#fff;padding:32px;border-radius:14px;text-align:center;max-width:400px">
                 <div class="bf-thumb" style="width:56px;height:56px;margin:0 auto 12px">${ICONS.file(26)}</div>
                 <div style="font-weight:650;margin-bottom:4px">${esc(f.name)}</div>
                 <div style="color:#64748b;font-size:13px;margin-bottom:18px">${formatFileSize(f.size)}</div>
                 <a href="${src}" download="${esc(f.name)}" target="_blank" rel="noopener noreferrer" class="bf-btn pri">${ICONS.download(16)}<span>Download file</span></a>
               </div>`}
      </div>`;

    overlay.querySelector('#bfVx').onclick = close;
    if (isImg) {
      const apply = () => { render(); };
      overlay.querySelector('#bfZi').onclick = () => { zoom = Math.min(3, zoom + 0.25); apply(); };
      overlay.querySelector('#bfZo').onclick = () => { zoom = Math.max(0.5, zoom - 0.25); apply(); };
      overlay.querySelector('#bfZr').onclick = () => { zoom = 1; apply(); };
    }
    if (files.length > 1) {
      overlay.querySelector('#bfPrev').onclick = () => { curIdx = (curIdx - 1 + files.length) % files.length; zoom = 1; render(); };
      overlay.querySelector('#bfNext').onclick = () => { curIdx = (curIdx + 1) % files.length; zoom = 1; render(); };
    }
  }

  render();
  document.body.appendChild(overlay);
  window.addEventListener('keydown', keyHandler);
}
