export const $ = s => document.querySelector(s);
export const $$ = s => document.querySelectorAll(s);
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export const fmt = p => (p < 0 ? '-' : '') + '₹' + (Math.abs(p) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function P(s) {
  s = String(s || '').replace(/,/g, '').trim();
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') throw Error('Enter a valid amount');
  const [a, b = ''] = s.split('.');
  return parseInt(a || '0', 10) * 100 + parseInt((b + '00').slice(0, 2), 10);
}

export function toast(m) {
  const t = $('#toast');
  if (!t) return;
  t.textContent = m;
  t.style.display = 'block';
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.style.display = 'none', 3500);
}

export const IC = {
  overview: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>',
  in: '<path d="M17 7 7 17"/><path d="M17 17H7V7"/>',
  out: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  xfer: '<path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4"/>',
  txns: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  sales: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8"/>',
  bills: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  inventory: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  parties: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  loans: '<path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2l8 5H4z"/>',
  coa: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/>',
  jv: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  gl: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  book: '<path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7M16 14h.01"/>',
  tb: '<path d="M12 3v18M5 21h14M5 7h14M5 7l-3 8a3 3 0 0 0 6 0zM19 7l-3 8a3 3 0 0 0 6 0z"/>',
  pl: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  bs: '<path d="M21 12a9 9 0 1 1-9-9v9z"/><path d="M21 12A9 9 0 0 0 12 3"/>',
  set: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  open: '<path d="M4 22V4M4 4h13l-2 4 2 4H4"/>',
  exp: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>'
};

export const ic = k => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${IC[k] || ''}</svg>`;
export const head = (t, btn) => `<div class="bar"><button class="menu" data-a="menu" aria-label="Menu">${ic('menu')}</button><h2>${t}</h2>${btn || ''}</div>`;
export const kpi = (l, v) => `<div class="kpi"><span>${l}</span><b>${v}</b></div>`;

export const prev = d => {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() - 1);
  return x.toISOString().slice(0, 10);
};

export const addD = (d, n) => {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
};

export const addM = d => {
  const x = new Date(d + 'T00:00:00Z');
  x.setUTCMonth(x.getUTCMonth() + 1);
  return x.toISOString().slice(0, 10);
};

export const UNIT_FACTORS = {
  kg: 1,
  quintal: 100,
  ton: 1000,
  pcs: 1,
  pc: 1
};

export function convertRate(baseRate, fromUnit, toUnit) {
  const r = parseFloat(baseRate);
  if (isNaN(r) || r <= 0) return 0;
  if (!fromUnit || !toUnit) return r;
  const fU = String(fromUnit).toLowerCase().trim();
  const tU = String(toUnit).toLowerCase().trim();
  if (fU === tU) return r;

  const fromFactor = UNIT_FACTORS[fU];
  const toFactor = UNIT_FACTORS[tU];

  if (!fromFactor || !toFactor) return r;

  const converted = (r / fromFactor) * toFactor;
  return Math.round(converted * 100) / 100;
}

/**
 * Debounce utility to prevent lagging/stuttering on mobile input typing
 */
export function debounce(fn, ms = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/**
 * Optimize Cloudinary image URLs into WebP with responsive thumbnail sizing
 */
export function toWebpThumbnail(url, width = 200) {
  if (!url || typeof url !== 'string') return url;
  if (url.includes('res.cloudinary.com') && url.includes('/upload/')) {
    return url.replace('/upload/', `/upload/f_webp,q_auto,w_${width},c_limit/`);
  }
  return url;
}


