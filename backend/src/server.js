const fs = require('fs');
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
const PW = process.env.APP_PIN || process.env.APP_PASSWORD, SEC = process.env.SESSION_SECRET;
if (!PW || !SEC) { console.error('Set APP_PIN (or APP_PASSWORD) and SESSION_SECRET (see .env.example)'); process.exit(1) }
const app = express(), prod = process.env.NODE_ENV === 'production', DAY = 864e5 * 7;
app.disable('x-powered-by'); app.use(express.json({ limit: '15mb' }));
app.use((q, s, n) => {
  const isApi = q.path.startsWith('/api/');
  const isSw = q.path === '/sw.js';
  const isHtml = q.path === '/' || q.path === '/index.html' || q.path.endsWith('.html');
  s.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Cache-Control': isApi || isSw || isHtml ? 'no-cache, no-store, must-revalidate' : 'public, max-age=3600'
  });
  n();
});
const sign = x => crypto.createHmac('sha256', SEC).update(x).digest('hex');
const eq = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y) };
const authed = q => { const m = /(?:^|; )bufin=([^;]+)/.exec(q.headers.cookie || ''); if (!m) return false; const [exp, sig] = m[1].split('.'); return +exp > Date.now() && eq(sig || '', sign(exp)) };
const tries = new Map();
app.post('/api/login', (q, s) => {
  const k = q.ip, t = (tries.get(k) || []).filter(x => x > Date.now() - 6e4);
  if (t.length >= 5) return s.status(429).json({ error: 'Too many attempts. Wait a minute.' });
  const supplied = String((q.body || {}).pin || (q.body || {}).password || '');
  if (!eq(supplied, PW)) { t.push(Date.now()); tries.set(k, t); return s.status(401).json({ error: 'Wrong PIN code' }) }
  const exp = String(Date.now() + DAY);
  s.set('Set-Cookie', `bufin=${exp}.${sign(exp)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${DAY / 1000}${prod ? '; Secure' : ''}`); s.json({ ok: true });
});
app.post('/api/logout', (q, s) => { s.set('Set-Cookie', 'bufin=; Max-Age=0; Path=/'); s.json({ ok: true }) });
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
const cloudinary = require('./cloudinary');
app.get('/api/cloudinary/config', (q, s) => s.json(cloudinary.getConfig()));
app.post('/api/cloudinary/config', (q, s) => {
  if (!authed(q)) return s.status(401).json({ error: 'Login required' });
  const { cloudName, apiKey, apiSecret } = q.body || {};
  const updated = cloudinary.setConfig({ cloudName, apiKey, apiSecret });
  try {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.resolve(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      let envContent = fs.readFileSync(envPath, 'utf8');
      if (cloudName) envContent = envContent.replace(/CLOUDINARY_CLOUD_NAME=.*/, `CLOUDINARY_CLOUD_NAME=${cloudName}`);
      if (apiKey) envContent = envContent.replace(/CLOUDINARY_API_KEY=.*/, `CLOUDINARY_API_KEY=${apiKey}`);
      if (apiSecret) {
        if (/CLOUDINARY_API_SECRET=.*/.test(envContent)) {
          envContent = envContent.replace(/CLOUDINARY_API_SECRET=.*/, `CLOUDINARY_API_SECRET=${apiSecret}`);
        } else {
          envContent += `\nCLOUDINARY_API_SECRET=${apiSecret}`;
        }
      }
      fs.writeFileSync(envPath, envContent, 'utf8');
    }
  } catch (e) {
    console.warn('Could not persist to .env:', e.message);
  }
  s.json(updated);
});
app.post('/api/upload', async (q, s) => {
  if (!authed(q)) return s.status(401).json({ error: 'Login required' });
  try {
    const { file, folder } = q.body || {};
    if (!file) return s.status(400).json({ error: 'File data is required' });
    const result = await cloudinary.uploadToCloudinary(file, folder || 'bufin/bills');
    s.json(result);
  } catch (err) {
    s.status(500).json({ error: err.message });
  }
});
app.use('/api/state', (q, s, n) => authed(q) ? n() : s.status(401).json({ error: 'Login required' }));
app.get('/api/state', async (q, s, n) => { try { const r = await store.get(); s.json(r ? { version: r.version, data: r.data } : { version: 0, data: null }) } catch (e) { n(e) } });
app.put('/api/state', async (q, s, n) => {
  try {
    const { version, data } = q.body || {}; const cur = await store.get();
    validate(data, cur && cur.data);
    const v = await store.put(Number.isInteger(version) ? version : -1, data);
    if (v === null) return s.status(409).json({ error: 'Data changed on another device. Reload the page.' });
    s.json({ version: v });
  } catch (e) { n(e) }
});
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
store.init().then(() => app.listen(process.env.PORT || 3000, () => console.log('BUFIN running on port ' + (process.env.PORT || 3000)))).catch(e => { console.error(e); process.exit(1) });
