const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

// Configure test environment variables before requiring server/store
process.env.APP_PIN = '1234';
process.env.SESSION_SECRET = 'bufin-test-session-secret-32-chars-minimum-length!';
process.env.CLOUDINARY_CLOUD_NAME = 'test_cloud_bufin';
process.env.CLOUDINARY_API_KEY = 'test_key_12345';
const TEST_SECRET = 'SUPER_SECRET_CLOUDINARY_TOKEN_998877';
process.env.CLOUDINARY_API_SECRET = TEST_SECRET;
process.env.NODE_ENV = 'test';
process.env.DATA_FILE = path.join(__dirname, '..', 'data', 'test_state.json');

const app = require('./server');
const store = require('./store');

let server;
let baseUrl;

test.before(async () => {
  await store.init();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  const tf = process.env.DATA_FILE;
  if (tf && fs.existsSync(tf)) {
    try { fs.unlinkSync(tf); } catch (e) {}
  }
});

test('1. Public ping route returns 200 without authentication', async () => {
  const res = await fetch(`${baseUrl}/api/ping`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.pong, true);
});

test('2. Unauthenticated requests to /api/upload, /api/cloudinary/config, and /api/state return 401', async () => {
  // GET /api/cloudinary/config
  const resConfig = await fetch(`${baseUrl}/api/cloudinary/config`);
  assert.equal(resConfig.status, 401, 'GET /api/cloudinary/config must require authentication');
  const jsonConfig = await resConfig.json();
  assert.match(jsonConfig.error, /login required/i);

  // POST /api/upload
  const resUpload = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: 'data:image/png;base64,AAAA', folder: 'bufin/bills' })
  });
  assert.equal(resUpload.status, 401, 'POST /api/upload must require authentication');
  const jsonUpload = await resUpload.json();
  assert.match(jsonUpload.error, /login required/i);

  // GET /api/state
  const resState = await fetch(`${baseUrl}/api/state`);
  assert.equal(resState.status, 401, 'GET /api/state must require authentication');
  const jsonState = await resState.json();
  assert.match(jsonState.error, /login required/i);

  // GET /api/state/version
  const resStateVer = await fetch(`${baseUrl}/api/state/version`);
  assert.equal(resStateVer.status, 401, 'GET /api/state/version must require authentication');
  const jsonStateVer = await resStateVer.json();
  assert.match(jsonStateVer.error, /login required/i);

  // PUT /api/state
  const resStatePut = await fetch(`${baseUrl}/api/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 1, data: {} })
  });
  assert.equal(resStatePut.status, 401, 'PUT /api/state must require authentication');
});

test('3. POST /api/cloudinary/config is deleted (returns 404)', async () => {
  // First login to get a valid session
  const loginRes = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: '1234' })
  });
  const cookie = loginRes.headers.get('set-cookie');

  // Attempt POST to /api/cloudinary/config
  const res = await fetch(`${baseUrl}/api/cloudinary/config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie
    },
    body: JSON.stringify({ cloudName: 'hack', apiKey: 'hack', apiSecret: 'hack' })
  });
  assert.equal(res.status, 404, 'POST /api/cloudinary/config must be deleted and return 404');
});

test('4. Repeated failed login attempts are rate-limited with exponential back-off / 1h lock', async () => {
  const testIp = '198.51.100.99';

  // Attempts 1 to 5 should fail with 401
  for (let i = 1; i <= 5; i++) {
    const res = await fetch(`${baseUrl}/api/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': testIp
      },
      body: JSON.stringify({ pin: 'wrong-pin' })
    });
    assert.equal(res.status, 401, `Attempt ${i} should return 401`);
    const json = await res.json();
    assert.equal(json.error, 'Wrong PIN code');
  }

  // Attempt 6 should be blocked by rate limiting with 429 Too Many Requests
  const lockedRes = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': testIp
    },
    body: JSON.stringify({ pin: 'wrong-pin' })
  });
  assert.equal(lockedRes.status, 429, 'Attempt 6 must return 429 Too Many Requests');
  assert.ok(lockedRes.headers.get('retry-after'), 'Must include Retry-After header');
  const lockedJson = await lockedRes.json();
  assert.match(lockedJson.error, /too many|locked/i);
});

test('5. /api/login must NOT return the whole ledger; issues signed session cookie', async () => {
  const res = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '198.51.100.77'
    },
    body: JSON.stringify({ pin: '1234' })
  });
  assert.equal(res.status, 200);
  const json = await res.json();

  assert.equal(json.ok, true);
  assert.equal(json.data, undefined, '/api/login must NOT return the data/ledger payload');

  const cookie = res.headers.get('set-cookie');
  assert.ok(cookie, 'Must set session cookie');
  assert.match(cookie, /^bufin=[a-f0-9]{48}\.\d+\.[a-f0-9]{64};/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Path=\//i);
});

test('6. Logout truly invalidates the session cookie on the server', async () => {
  // Login to acquire a valid cookie
  const loginRes = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '198.51.100.88'
    },
    body: JSON.stringify({ pin: '1234' })
  });
  const cookie = loginRes.headers.get('set-cookie');
  assert.ok(cookie);

  // Authenticated state access succeeds
  const stateRes1 = await fetch(`${baseUrl}/api/state`, {
    headers: { Cookie: cookie }
  });
  assert.equal(stateRes1.status, 200, 'State access must succeed while session is active');

  // Authenticated state version endpoint succeeds and returns { version }
  const stateVerRes1 = await fetch(`${baseUrl}/api/state/version`, {
    headers: { Cookie: cookie }
  });
  assert.equal(stateVerRes1.status, 200);
  const stateVerJson = await stateVerRes1.json();
  assert.equal(typeof stateVerJson.version, 'number');

  // Perform logout
  const logoutRes = await fetch(`${baseUrl}/api/logout`, {
    method: 'POST',
    headers: { Cookie: cookie }
  });
  assert.equal(logoutRes.status, 200);
  const logoutCookie = logoutRes.headers.get('set-cookie');
  assert.match(logoutCookie, /Max-Age=0/i, 'Logout must expire the client cookie');

  // Attempt state access with the old session cookie
  const stateRes2 = await fetch(`${baseUrl}/api/state`, {
    headers: { Cookie: cookie }
  });
  assert.equal(stateRes2.status, 401, 'Old session cookie must return 401 after logout');
});

test('7. GET /api/cloudinary/config returns only { configured, cloudName } and NEVER secrets', async () => {
  // Login
  const loginRes = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '198.51.100.55'
    },
    body: JSON.stringify({ pin: '1234' })
  });
  const cookie = loginRes.headers.get('set-cookie');

  const res = await fetch(`${baseUrl}/api/cloudinary/config`, {
    headers: { Cookie: cookie }
  });
  assert.equal(res.status, 200);
  const text = await res.text();
  const json = JSON.parse(text);

  // Check structure
  assert.equal(typeof json.configured, 'boolean');
  assert.equal(json.configured, true);
  assert.equal(json.cloudName, 'test_cloud_bufin');

  // Ensure apiKey and secrets are never in response
  assert.equal(json.apiKey, undefined, 'apiKey must not be in response');
  assert.equal(json.apiSecret, undefined, 'apiSecret must not be in response');
  assert.equal(json.hasSecret, undefined, 'hasSecret must not be in response');
  assert.ok(!text.includes(TEST_SECRET), 'Raw secret must not appear anywhere in body');
  assert.ok(!text.includes('test_key_12345'), 'API key must not appear in config body');
});

test('8. No response body anywhere contains the Cloudinary secret', async () => {
  // Login
  const loginRes = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '198.51.100.66'
    },
    body: JSON.stringify({ pin: '1234' })
  });
  const cookie = loginRes.headers.get('set-cookie');

  const endpoints = [
    { url: '/api/ping', method: 'GET' },
    { url: '/api/cloudinary/config', method: 'GET', cookie },
    { url: '/api/state', method: 'GET', cookie },
    { url: '/api/upload', method: 'POST', cookie, body: { file: 'data:image/png;base64,abc', folder: 'bufin/invalid' } }
  ];

  for (const ep of endpoints) {
    const opts = { method: ep.method };
    if (ep.cookie) opts.headers = { Cookie: ep.cookie };
    if (ep.body) {
      opts.headers = { ...(opts.headers || {}), 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(ep.body);
    }
    const res = await fetch(`${baseUrl}${ep.url}`, opts);
    const body = await res.text();
    assert.ok(!body.includes(TEST_SECRET), `Response from ${ep.url} must never contain Cloudinary secret`);
  }
});

test('9. /api/upload validates folder allowlist, mime allowlist, and 8 MB size cap', async () => {
  // Login
  const loginRes = await fetch(`${baseUrl}/api/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '198.51.100.44'
    },
    body: JSON.stringify({ pin: '1234' })
  });
  const cookie = loginRes.headers.get('set-cookie');

  // Disallowed folder
  const badFolderRes = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ file: 'data:image/png;base64,AAAA', folder: 'bufin/secret_folder' })
  });
  assert.equal(badFolderRes.status, 400, 'Disallowed folder must return 400');
  const badFolderJson = await badFolderRes.json();
  assert.match(badFolderJson.error, /invalid folder/i);

  // Disallowed MIME type (e.g. text/html)
  const badMimeRes = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ file: 'data:text/html;base64,PHNjcmlwdD4=', folder: 'bufin/bills' })
  });
  assert.equal(badMimeRes.status, 415, 'Disallowed MIME type must return 415');
  const badMimeJson = await badMimeRes.json();
  assert.match(badMimeJson.error, /unsupported media type/i);

  // Invalid data URL format
  const notDataUrlRes = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ file: 'plain text content', folder: 'bufin/bills' })
  });
  assert.equal(notDataUrlRes.status, 400, 'Non-data URL must return 400');

  // File exceeding 8 MB (8 MB = 8388608 bytes; base64 of 8.5 MB)
  const oversizedBase64 = Buffer.alloc(8.5 * 1024 * 1024).toString('base64');
  const oversizedRes = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ file: `data:image/jpeg;base64,${oversizedBase64}`, folder: 'bufin/bills' })
  });
  assert.equal(oversizedRes.status, 413, 'Oversized file (> 8 MB) must return 413');
  const oversizedJson = await oversizedRes.json();
  assert.match(oversizedJson.error, /8 MB limit/i);
});

test('10. Security headers and Content-Security-Policy', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);

  const csp = res.headers.get('content-security-policy') || '';
  assert.match(csp, /default-src\s+'self'/, "CSP must contain default-src 'self'");
  assert.match(csp, /cdnjs\.cloudflare\.com/, 'CSP must allow cdnjs.cloudflare.com for jspdf');
  assert.match(csp, /fonts\.googleapis\.com/, 'CSP must allow fonts.googleapis.com');
  assert.match(csp, /fonts\.gstatic\.com/, 'CSP must allow fonts.gstatic.com');
  assert.match(csp, /res\.cloudinary\.com/, 'CSP must allow res.cloudinary.com for images');
  assert.match(csp, /'unsafe-inline'/, "CSP must include 'unsafe-inline'");

  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
});
