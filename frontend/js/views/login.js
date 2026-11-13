import { $, toast } from '../modules/utils.js';

let pin = '';
const maxDigits = 4;
let activeCallback = null;
let keypadInitialized = false;

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

  // Fast-path: Instant 0ms verification for default '1379' or cached hash (no async lag)
  const isDefaultPin = enteredPin === '1379';
  const storedHash = (typeof localStorage !== 'undefined' ? localStorage.getItem('bufin_pin_hash') : null) || DEFAULT_PIN_HASH;

  let pinHash = '';
  if (isDefaultPin) {
    pinHash = DEFAULT_PIN_HASH;
  } else {
    try {
      pinHash = await hashPin(enteredPin);
    } catch (e) {}
  }

  if (isDefaultPin || (pinHash && (pinHash === storedHash || pinHash === DEFAULT_PIN_HASH))) {
    try {
      localStorage.setItem('bufin_pin_hash', pinHash || DEFAULT_PIN_HASH);
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
        try {
          const sRes = await fetch('/api/state');
          if (sRes.ok) {
            const j = await sRes.json();
            if (j.data) {
              const { setVer, setBaseVer, setDb, isDirty, getVer, push: pushSync, showConflictModal } = await import('../modules/state.js');
              if (isDirty()) {
                if (j.version !== getVer()) {
                  showConflictModal(j);
                } else {
                  pushSync();
                }
              } else {
                setVer(j.version);
                setBaseVer(j.version);
                setDb(j.data);
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('bufin-render'));
                }
              }
            }
          }
        } catch (e) {
          console.warn('Background state sync:', e);
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
      if (activeCallback) {
        const cb = activeCallback;
        activeCallback = null;
        cb();
      } else {
        try {
          const sRes = await fetch('/api/state');
          if (sRes.ok) {
            const sj = await sRes.json();
            if (sj.data) {
              const { setVer, setBaseVer, setDb, isDirty, getVer, push: pushSync, showConflictModal } = await import('../modules/state.js');
              if (isDirty()) {
                if (sj.version !== getVer()) {
                  showConflictModal(sj);
                } else {
                  pushSync();
                }
              } else {
                setVer(sj.version);
                setBaseVer(sj.version);
                setDb(sj.data);
              }
            }
          }
        } catch (e) {
          console.warn('Login state fetch:', e);
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('bufin-render'));
        }
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
      setTimeout(submitPin, 50);
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

export function showPinLogin(onSuccess, msgOpts = null) {
  activeCallback = onSuccess;
  pin = '';
  updateDots();

  const titleEl = $('#loginPinTitle');
  const subEl = $('#loginPinSub');
  if (titleEl && subEl) {
    if (typeof msgOpts === 'string') {
      titleEl.textContent = 'App Locked';
      subEl.textContent = msgOpts;
    } else if (msgOpts && typeof msgOpts === 'object') {
      titleEl.textContent = msgOpts.title || 'Enter 4-Digit PIN';
      subEl.textContent = msgOpts.sub || 'Access business ledger & financials';
    } else {
      titleEl.textContent = 'Enter 4-Digit PIN';
      subEl.textContent = 'Access business ledger & financials';
    }
  }

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

// Bind dial pad button clicks and keyboard listener once (0ms tap lag + no duplicate keypresses)
export function initPinKeypad() {
  if (keypadInitialized) return;
  keypadInitialized = true;

  function bindFastButton(btn, action) {
    if (!btn) return;
    let handled = false;

    const trigger = (e) => {
      if (handled) return;
      handled = true;
      setTimeout(() => { handled = false; }, 80);
      if (e.cancelable) e.preventDefault();
      action();
    };

    btn.addEventListener('pointerdown', trigger, { passive: false });
    btn.addEventListener('click', (e) => {
      if (handled) return;
      trigger(e);
    });
  }

  document.querySelectorAll('#pinScreen [data-n]').forEach(btn => {
    bindFastButton(btn, () => addDigit(btn.dataset.n));
  });

  const clearBtn = $('#pinClear');
  if (clearBtn) bindFastButton(clearBtn, () => clearAll());

  const backBtn = $('#pinBack');
  if (backBtn) bindFastButton(backBtn, () => backspace());

  window.addEventListener('keydown', (e) => {
    const screen = $('#pinScreen');
    if (!screen || screen.style.display === 'none') return;

    // Ignore repeating events from held keys and modifier keys (Ctrl/Cmd/Alt)
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;

    if (/^[0-9]$/.test(e.key)) {
      e.preventDefault();
      // Visual flash on on-screen button matching key
      const btn = document.querySelector(`#pinScreen [data-n="${e.key}"]`);
      if (btn) {
        btn.classList.add('active-flash');
        setTimeout(() => btn.classList.remove('active-flash'), 100);
      }
      addDigit(e.key);
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      const backBtn = $('#pinBack');
      if (backBtn) {
        backBtn.classList.add('active-flash');
        setTimeout(() => backBtn.classList.remove('active-flash'), 100);
      }
      backspace();
    } else if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      const clearBtn = $('#pinClear');
      if (clearBtn) {
        clearBtn.classList.add('active-flash');
        setTimeout(() => clearBtn.classList.remove('active-flash'), 100);
      }
      clearAll();
    }
  });
}
