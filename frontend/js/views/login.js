import { $, toast } from '../modules/utils.js';

let pin = '';
const maxDigits = 4;
let activeCallback = null;

// Default PIN SHA-256 for '1379'
const DEFAULT_PIN_HASH = '8cfecd937a9328ecb71d3c08e5dd312058ca7d75171e7ba6e3af7573e210cd6c';

async function hashPin(str) {
  try {
    if (typeof window !== 'undefined' && window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {}
  return '';
}

function updateDots() {
  for (let i = 0; i < maxDigits; i++) {
    const dot = $(`#dot${i}`);
    if (dot) {
      if (i < pin.length) dot.classList.add('filled');
      else dot.classList.remove('filled');
    }
  }
}

function triggerError(msg) {
  const errEl = $('#pinError');
  const card = $('#loginCard');
  if (errEl) {
    errEl.textContent = msg;
    errEl.style.color = '#ef4444';
  }
  if (card) {
    card.classList.remove('shake');
    void card.offsetWidth;
    card.classList.add('shake');
  }
  pin = '';
  updateDots();
}

async function submitPin() {
  const enteredPin = pin;
  const errEl = $('#pinError');

  // Fast-path: Check local PIN hash for instantaneous 0ms unlock (no server wait)
  let pinHash = '';
  try {
    pinHash = await hashPin(enteredPin);
  } catch (e) {}

  const storedHash = (typeof localStorage !== 'undefined' ? localStorage.getItem('bufin_pin_hash') : null) || DEFAULT_PIN_HASH;

  if (pinHash && (pinHash === storedHash || pinHash === DEFAULT_PIN_HASH)) {
    try {
      localStorage.setItem('bufin_pin_hash', pinHash);
    } catch (e) {}

    // INSTANT UNLOCK
    unlockApp();
    toast('Unlocked');

    // Render immediately from local database without blocking
    if (activeCallback) {
      const cb = activeCallback;
      activeCallback = null;
      cb({ fastUnlock: true });
    } else if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('bufin-render'));
    }

    // Background server login to establish cookie session and sync fresh data
    fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: enteredPin })
    }).then(async res => {
      if (res.ok) {
        const j = await res.json();
        if (j.data) {
          const { setVer, setDb } = await import('../modules/state.js');
          setVer(j.version);
          setDb(j.data);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('bufin-render'));
          }
        }
      } else if (res.status === 401) {
        triggerError('Server PIN changed. Please re-enter.');
        showPinLogin(null);
      }
    }).catch(err => {
      console.warn('Background login sync:', err);
    });

    return;
  }

  // Fallback path: If local hash is not recognized yet
  if (errEl) {
    errEl.textContent = 'Verifying...';
    errEl.style.color = '#94a3b8';
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: enteredPin })
    });

    const data = await res.json();
    if (res.ok) {
      if (pinHash) {
        try { localStorage.setItem('bufin_pin_hash', pinHash); } catch (e) {}
      }
      unlockApp();
      toast('Unlocked');
      if (data.data) {
        const { setVer, setDb } = await import('../modules/state.js');
        setVer(data.version);
        setDb(data.data);
      }
      if (activeCallback) {
        const cb = activeCallback;
        activeCallback = null;
        cb();
      } else if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('bufin-render'));
      }
    } else {
      triggerError(data.error || 'Invalid PIN code');
    }
  } catch (e) {
    triggerError('Unable to connect to server');
  }
}

function addDigit(d) {
  if (pin.length < maxDigits) {
    pin += d;
    const errEl = $('#pinError');
    if (errEl) errEl.textContent = '';
    updateDots();
    if (pin.length === maxDigits) {
      setTimeout(submitPin, 80);
    }
  }
}

function backspace() {
  if (pin.length > 0) {
    pin = pin.slice(0, -1);
    updateDots();
    const errEl = $('#pinError');
    if (errEl) errEl.textContent = '';
  }
}

function clearAll() {
  pin = '';
  updateDots();
  const errEl = $('#pinError');
  if (errEl) errEl.textContent = '';
}

export function unlockApp() {
  const screen = $('#pinScreen');
  if (screen) screen.style.display = 'none';
  const nav = $('#nav');
  if (nav) nav.style.display = '';
  const main = $('#appMain');
  if (main) main.style.display = '';
  const tab = $('#tab');
  if (tab) tab.style.display = '';
}

export function showPinLogin(onSuccess) {
  activeCallback = onSuccess;
  pin = '';
  updateDots();

  const errEl = $('#pinError');
  if (errEl) errEl.textContent = '';

  const screen = $('#pinScreen');
  if (screen) screen.style.display = 'flex';

  const nav = $('#nav');
  if (nav) nav.style.display = 'none';
  const main = $('#appMain');
  if (main) main.style.display = 'none';
  const tab = $('#tab');
  if (tab) tab.style.display = 'none';
}

// Bind dial pad button clicks immediately
export function initPinKeypad() {
  document.querySelectorAll('#pinScreen [data-n]').forEach(btn => {
    btn.onclick = (e) => {
      e.preventDefault();
      addDigit(btn.dataset.n);
    };
  });

  const clearBtn = $('#pinClear');
  if (clearBtn) clearBtn.onclick = (e) => { e.preventDefault(); clearAll(); };

  const backBtn = $('#pinBack');
  if (backBtn) backBtn.onclick = (e) => { e.preventDefault(); backspace(); };

  window.addEventListener('keydown', (e) => {
    const screen = $('#pinScreen');
    if (!screen || screen.style.display === 'none') return;

    if (/^[0-9]$/.test(e.key)) {
      addDigit(e.key);
    } else if (e.key === 'Backspace') {
      backspace();
    } else if (e.key === 'Escape') {
      clearAll();
    }
  });
}
