import { $, toast } from '../modules/utils.js';

let pin = '';
const maxDigits = 4;
let activeCallback = null;

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
  const errEl = $('#pinError');
  if (errEl) {
    errEl.textContent = 'Verifying...';
    errEl.style.color = '#94a3b8';
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin })
    });

    const data = await res.json();
    if (res.ok) {
      unlockApp();
      toast('Unlocked');
      if (activeCallback) activeCallback();
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
