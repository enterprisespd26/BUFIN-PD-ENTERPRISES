import { $, esc, fmt } from './utils.js';
import { db, save } from './state.js';

let backdropBound = false;

export function modal(h) {
  const d = $('#dlg');
  if (!d) return;
  const closeBtnHtml = `
    <button type="button" class="dlg-close universal-close-btn" aria-label="Close" title="Close">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  `;
  d.innerHTML = closeBtnHtml + h;
  if (!d.open) d.showModal();

  d.querySelectorAll('.dlg-close, .universal-close-btn').forEach(btn => {
    btn.onclick = closeM;
  });

  if (!backdropBound) {
    d.addEventListener('click', (e) => {
      if (e.target === d) {
        closeM();
      }
    });
    backdropBound = true;
  }
}

export const closeM = () => {
  const d = $('#dlg');
  if (d && d.open) d.close();
};

export function form(title, html, submit, label, onRender) {
  modal(`<h3>${esc(title)}</h3><form id="f">${html}<div class="row"><button type="button" id="mCancel">Cancel</button><button class="p" id="sb">${label || 'Save'}</button></div></form>`);
  
  $('#mCancel').onclick = closeM;

  $('#f').onsubmit = ev => {
    ev.preventDefault();
    const b = $('#sb');
    b.disabled = true;
    try {
      const v = Object.fromEntries(new FormData($('#f')));
      submit(v);
      save();
      closeM();
      window.dispatchEvent(new CustomEvent('bufin-render'));
      import('./utils.js').then(u => u.toast('Saved'));
    } catch (e) {
      import('./utils.js').then(u => u.toast(e.message));
      b.disabled = false;
    }
  };

  if (onRender) onRender();
}

export const fld = (n, l, t, v, req, x) => `<label>${l}${req ? ' *' : ''}<input name="${n}" type="${t || 'text'}" value="${esc(v ?? '')}" ${req ? 'required' : ''} ${t === 'number' ? 'step="any"' : ''} ${x || ''}></label>`;
export const sel = (n, l, o, x) => `<label>${l}<select name="${n}" ${x || ''}>${o}</select></label>`;

export const opts = (l, sel) => l.map(o => `<option value="${esc(o[0])}"${o[0] === sel ? ' selected' : ''}>${esc(o[1])}</option>`).join('');
export const accOpts = (f, sel) => opts(db.accounts.filter(f).map(a => [a.code, a.name]), sel);
export const partyOpts = (f, sel) => opts([['', 'None']].concat(db.parties.filter(f || (() => 1)).map(p => [p.id, p.name])), sel);

export function entTable(list, empty) {
  if (!list.length) return `<div class="wrap"><div class="empty">${empty || 'No entries yet.'}</div></div>`;
  return `<div class="wrap"><table><tr><th>Date</th><th>Ref</th><th>Narration</th><th>Type</th><th class="num">Amount</th><th>Status</th></tr>${list.map(e => `<tr class="k" data-a="ent" data-i="${e.id}"><td>${e.date}</td><td>${e.ref}</td><td>${esc(e.narr)}</td><td>${e.src}</td><td class="num">${fmt(e.lines.reduce((s, l) => s + l.d, 0))}</td><td><span class="b ${e.status === 'posted' ? 'ok' : 'wn'}">${e.status}</span></td></tr>`).join('')}</table></div>`;
}

export function showActionSheet(title, subtitle, items) {
  const content = `
    <div class="action-sheet-head">
      <div class="action-sheet-title">${esc(title)}</div>
      ${subtitle ? `<div class="action-sheet-sub">${esc(subtitle)}</div>` : ''}
    </div>
    <div class="action-sheet-list">
      ${items.map((item, idx) => `
        <button type="button" class="action-sheet-item ${item.variant ? 'sheet-item-' + item.variant : ''} ${item.danger ? 'danger' : ''} ${item.primary ? 'p' : ''}" data-sheet-idx="${idx}">
          ${item.icon ? `<span class="action-sheet-icon">${item.icon}</span>` : ''}
          <span class="action-sheet-text">${esc(item.label)}</span>
        </button>
      `).join('')}
    </div>
    <div class="action-sheet-cancel">
      <button type="button" class="btn alt sheet-cancel-btn action-sheet-cancel-btn">Cancel</button>
    </div>
  `;
  modal(content);

  const d = $('#dlg');
  if (d) {
    d.querySelectorAll('.action-sheet-item').forEach(btn => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.sheetIdx, 10);
        closeM();
        if (items[idx] && items[idx].onClick) {
          items[idx].onClick();
        }
      };
    });
    const cancelBtn = d.querySelector('.sheet-cancel-btn');
    if (cancelBtn) cancelBtn.onclick = closeM;
  }
}

