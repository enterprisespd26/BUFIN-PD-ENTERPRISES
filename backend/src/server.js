const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const store = require('./store');
const { validate, migrateSchema } = require('./ledger');
const cloudinary = require('./cloudinary');

const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  });
}

const PW = process.env.APP_PIN || process.env.APP_PASSWORD;
const SEC = process.env.SESSION_SECRET;
if (!PW || !SEC) {
  console.error('Set APP_PIN (or APP_PASSWORD) and SESSION_SECRET (see .env.example)');
  process.exit(1);
}

const app = express();
const prod = process.env.NODE_ENV === 'production';
const DAY = 864e5 * 7; // 7 days in ms

// Trust proxy for accurate req.ip when behind reverse proxies (Render, Vercel, Cloudflare)
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '15mb' }));

// Helmet-style security headers & CSP
const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://res.cloudinary.com",
  "connect-src 'self' https://api.cloudinary.com https://res.cloudinary.com",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ');

app.use((q, s, n) => {
  const isApi = q.path.startsWith('/api/');
  const isSw = q.path === '/sw.js';
  const isHtml = q.path === '/' || q.path === '/index.html' || q.path.endsWith('.html');

  s.set({
    'Content-Security-Policy': CSP_POLICY,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'X-DNS-Prefetch-Control': 'off',
    'X-Download-Options': 'noopen',
    'X-Permitted-Cross-Domain-Policies': 'none',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Origin-Agent-Cluster': '?1',
    'Cache-Control': isApi || isSw || isHtml ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600'
  });

  if (prod) {
    s.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  n();
});

// Crypto & Session helpers
const sign = x => crypto.createHmac('sha256', SEC).update(x).digest('hex');
const eq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// Server-side active sessions: sid -> expiresAt
const activeSessions = new Map();

function createSession() {
  const sid = crypto.randomBytes(24).toString('hex');
  const exp = Date.now() + DAY;
  activeSessions.set(sid, exp);
  const expStr = String(exp);
  const sig = sign(`${sid}.${expStr}`);
  return { sid, exp, cookieValue: `${sid}.${expStr}.${sig}` };
}

function parseSessionCookie(cookieHeader) {
  const m = /(?:^|; )bufin=([^;]+)/.exec(cookieHeader || '');
  if (!m) return null;
  const parts = m[1].split('.');
  if (parts.length !== 3) return null;
  const [sid, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!sid || !exp || exp <= Date.now()) return null;
  if (!eq(sig || '', sign(`${sid}.${expStr}`))) return null;
  if (!activeSessions.has(sid)) return null;
  const storedExp = activeSessions.get(sid);
  if (storedExp <= Date.now()) {
    activeSessions.delete(sid);
    return null;
  }
  return { sid, exp };
}

function invalidateSession(cookieHeader) {
  const m = /(?:^|; )bufin=([^;]+)/.exec(cookieHeader || '');
  if (m) {
    const parts = m[1].split('.');
    if (parts.length === 3 && parts[0]) {
      activeSessions.delete(parts[0]);
    }
  }
}

function getCookieString(cookieValue, maxAgeSec) {
  let cookie = `bufin=${cookieValue}; Path=/; HttpOnly; SameSite=Strict`;
  if (typeof maxAgeSec === 'number') {
    cookie += `; Max-Age=${maxAgeSec}`;
  }
  if (prod) {
    cookie += '; Secure';
  }
  return cookie;
}

// Evict expired sessions periodically
setInterval(() => {
  const now = Date.now();
  for (const [sid, exp] of activeSessions) {
    if (exp <= now) activeSessions.delete(sid);
  }
}, 15 * 60 * 1000).unref();

const authed = q => {
  const session = parseSessionCookie(q.headers.cookie);
  if (session) {
    q.session = session;
    return true;
  }
  return false;
};

// Login rate limiting & exponential back-off
const tries = new Map(); // ip -> { count, firstFail, lastFail, lockUntil }

// Evict old rate-limiting entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, rec] of tries) {
    const expiredLock = !rec.lockUntil || rec.lockUntil < now;
    const expiredWindow = now - rec.lastFail > 15 * 60 * 1000;
    if (expiredLock && expiredWindow) {
      tries.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref();

// Global API Authentication Middleware:
// Applied to EVERY /api/* route EXCEPT:
// - POST /api/login
// - POST /api/logout
// - GET /api/ping
app.use((q, s, n) => {
  if (!q.path.startsWith('/api/')) return n();
  if (q.path === '/api/ping' && q.method === 'GET') return n();
  if (q.path === '/api/login' && q.method === 'POST') return n();
  if (q.path === '/api/logout' && q.method === 'POST') return n();

  if (authed(q)) return n();
  return s.status(401).json({ error: 'Login required' });
});

// Public ping route
app.get('/api/ping', (q, s) => s.json({ ok: true, pong: true, time: Date.now() }));

// Hardened Login route
app.post('/api/login', async (q, s) => {
  const clientIp = q.ip || q.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const record = tries.get(clientIp);

  if (record) {
    if (record.lockUntil && record.lockUntil > now) {
      const retryAfterSec = Math.ceil((record.lockUntil - now) / 1000);
      s.set('Retry-After', String(retryAfterSec));
      return s.status(429).json({ error: 'Too many failed login attempts. Account locked. Try again later.' });
    }
    if (record.firstFail && now - record.firstFail > 15 * 60 * 1000) {
      tries.delete(clientIp);
    }
  }

  const supplied = String((q.body || {}).pin || (q.body || {}).password || '');
  if (!eq(supplied, PW)) {
    const current = tries.get(clientIp) || { count: 0, firstFail: now, lastFail: now, lockUntil: 0 };
    current.count += 1;
    current.lastFail = now;
    if (!current.firstFail) current.firstFail = now;

    if (current.count >= 5) {
      const excess = current.count - 5;
      const lockDuration = 3600000 * Math.pow(2, Math.min(excess, 4)); // 1h, 2h, 4h, 8h, 16h
      current.lockUntil = now + lockDuration;
    }
    tries.set(clientIp, current);

    // Constant delay on failed attempts to mitigate timing attacks
    await new Promise(r => setTimeout(r, 250));
    return s.status(401).json({ error: 'Wrong PIN code' });
  }

  // Verify backend store accessibility before confirming login
  try {
    await store.get();
  } catch (err) {
    console.error('store.get() failed during login:', err.message);
    return s.status(503).json({ error: 'Storage unavailable' });
  }

  // Clear failed attempt record on successful login
  tries.delete(clientIp);

  const session = createSession();
  s.set('Set-Cookie', getCookieString(session.cookieValue, DAY / 1000));
  return s.json({ ok: true });
});

// Logout route: Invalidate server-side session and expire cookie
app.post('/api/logout', (q, s) => {
  invalidateSession(q.headers.cookie);
  s.set('Set-Cookie', getCookieString('', 0));
  return s.json({ ok: true });
});

// Static assets
app.get('/sw.js', (q, s) => {
  s.set({
    'Content-Type': 'application/javascript; charset=UTF-8',
    'Service-Worker-Allowed': '/',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  s.sendFile(path.join(__dirname, '..', '..', 'frontend', 'sw.js'));
});

app.get('/manifest.json', (q, s) => {
  s.set({
    'Content-Type': 'application/manifest+json; charset=UTF-8',
    'Cache-Control': 'public, max-age=3600'
  });
  s.sendFile(path.join(__dirname, '..', '..', 'frontend', 'manifest.json'));
});

app.get('/favicon.ico', (q, s) => s.sendFile(path.join(__dirname, '..', '..', 'frontend', 'icons', 'favicon.ico')));

// Cloudinary config: GET only, returns { configured, cloudName }
app.get('/api/cloudinary/config', (q, s) => s.json(cloudinary.getConfig()));

// File upload endpoint with strict validation
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const ALLOWED_FOLDERS = new Set(['bufin/bills', 'bufin/invoices']);
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

app.post('/api/upload', async (q, s) => {
  try {
    const { file, folder = 'bufin/bills' } = q.body || {};

    if (!ALLOWED_FOLDERS.has(folder)) {
      return s.status(400).json({ error: 'Invalid folder. Allowed: bufin/bills, bufin/invoices' });
    }

    if (!file || typeof file !== 'string') {
      return s.status(400).json({ error: 'File data is required as a base64 data URL' });
    }

    const match = /^data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=]+|\s*)$/.exec(file.trim());
    if (!match) {
      return s.status(400).json({ error: 'Invalid data URL format. Expected data:<mime>;base64,<data>' });
    }

    const mime = match[1].toLowerCase();
    if (!ALLOWED_MIMES.has(mime)) {
      return s.status(415).json({ error: `Unsupported media type: ${mime}. Allowed: image/jpeg, image/png, image/webp, application/pdf` });
    }

    const base64Data = match[2];
    const decodedBytes = Buffer.byteLength(base64Data, 'base64');
    if (decodedBytes > MAX_UPLOAD_BYTES) {
      return s.status(413).json({ error: `File size exceeds 8 MB limit (got ${(decodedBytes / (1024 * 1024)).toFixed(2)} MB)` });
    }

    if (!cloudinary.isConfigured()) {
      return s.status(503).json({ error: 'Cloudinary storage is not configured on this server' });
    }

    const result = await cloudinary.uploadToCloudinary(file, folder);
    return s.json(result);
  } catch (err) {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    return s.status(status).json({ error: err.message || 'Upload failed' });
  }
});

// Protected state endpoints
app.get('/api/state/version', async (q, s, n) => {
  try {
    const r = await store.get();
    s.json({ version: r ? r.version : 0 });
  } catch (e) {
    n(e);
  }
});

app.get('/api/state', async (q, s, n) => {
  try {
    const r = await store.get();
    s.json(r ? { version: r.version, data: r.data } : { version: 0, data: null });
  } catch (e) {
    n(e);
  }
});

app.put('/api/state', async (q, s, n) => {
  try {
    const { version, data } = q.body || {};
    const cur = await store.get();
    validate(data, cur && cur.data);
    const v = await store.put(Number.isInteger(version) ? version : -1, data);
    if (v === null) return s.status(409).json({ error: 'Data changed on another device. Reload the page.' });
    s.json({ version: v });
  } catch (e) {
    n(e);
  }
});

// Restore endpoint: Authenticated, requires re-entering password/PIN.
// Replaces stored state with the backup and bumps the version,
// bypassing the "cannot delete posted entry" rule and recording an audit record.
app.post('/api/state/restore', async (q, s, n) => {
  try {
    const { password, pin, data } = q.body || {};
    const supplied = String(pin || password || '');
    if (!eq(supplied, PW)) {
      return s.status(401).json({ error: 'Wrong password or PIN code' });
    }

    if (!data || typeof data !== 'object') {
      return s.status(422).json({ error: 'Invalid state shape: expected JSON object' });
    }

    // Fully validate required arrays
    if (!Array.isArray(data.accounts)) return s.status(422).json({ error: 'Invalid accounts: must be an array' });
    if (!Array.isArray(data.entries)) return s.status(422).json({ error: 'Invalid entries: must be an array' });
    if (!Array.isArray(data.parties)) return s.status(422).json({ error: 'Invalid parties: must be an array' });
    if (!Array.isArray(data.docs)) return s.status(422).json({ error: 'Invalid docs: must be an array' });
    if (!Array.isArray(data.loans)) return s.status(422).json({ error: 'Invalid loans: must be an array' });
    if (!Array.isArray(data.audit)) {
      if (data.audit === undefined || data.audit === null) data.audit = [];
      else return s.status(422).json({ error: 'Invalid audit: must be an array' });
    }
    if (!Array.isArray(data.seq) && (typeof data.seq !== 'object' || data.seq === null)) {
      return s.status(422).json({ error: 'Invalid seq: must be an array or object' });
    }

    // Every entry balanced & unique refs
    const refs = new Set();
    const codes = new Set(data.accounts.map(a => a.code));
    for (const e of data.entries) {
      if (!e.ref) return s.status(422).json({ error: 'Entry missing journal reference (ref)' });
      if (refs.has(e.ref)) return s.status(422).json({ error: 'Duplicate journal reference: ' + e.ref });
      refs.add(e.ref);

      if (!Array.isArray(e.lines) || e.lines.length < 2) {
        return s.status(422).json({ error: e.ref + ': needs at least two lines' });
      }
      let d = 0, c = 0;
      for (const l of e.lines) {
        if (!codes.has(l.a)) return s.status(422).json({ error: `${e.ref}: unknown account ${l.a}` });
        if (!Number.isInteger(l.d) || !Number.isInteger(l.c) || l.d < 0 || l.c < 0 || (l.d && l.c)) {
          return s.status(422).json({ error: `${e.ref}: invalid line amounts` });
        }
        d += l.d; c += l.c;
      }
      if (d !== c) {
        return s.status(422).json({ error: `${e.ref}: debits (${d}) and credits (${c}) differ` });
      }
    }

    const cur = await store.get();
    const prevVersion = cur ? cur.version : 0;
    const entriesBefore = (cur && cur.data && Array.isArray(cur.data.entries)) ? cur.data.entries.length : 0;
    const entriesAfter = data.entries.length;

    migrateSchema(data);

    const auditRecord = {
      at: new Date().toISOString(),
      action: 'restore',
      prevVersion,
      entriesBefore,
      entriesAfter
    };
    data.audit.push(auditRecord);

    const v = await store.restore(data);
    return s.json({ ok: true, version: v, audit: auditRecord });
  } catch (e) {
    n(e);
  }
});

// Single Page Application routing
app.get(['/', '/index.html'], (q, s) => {
  s.set({
    'Content-Type': 'text/html; charset=UTF-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate'
  });
  s.sendFile(path.join(__dirname, '..', '..', 'frontend', 'index.html'));
});

app.use(express.static(path.join(__dirname, '..', '..', 'frontend'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (!prod) {
      res.set('Cache-Control', 'no-cache, must-revalidate');
    } else {
      res.set('Cache-Control', 'public, max-age=3600');
    }
  }
}));

app.use((e, q, s, n) => s.status(e.status || 500).json({ error: e.status ? e.message : 'Server error' }));

if (require.main === module) {
  store.init().then(() => {
    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log('BUFIN running on port ' + port));
  }).catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = app;
