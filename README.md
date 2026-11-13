# BUFIN — Business Ledger & Financial Engine

BUFIN is a single-business, double-entry financial accounting and document ledger engineered for high reliability, offline resilience, and strict auditing. It consists of an Express API backend (`backend/src`) and a responsive single-page application (`frontend/`) optimized dedicatedly for both desktop and mobile form factors.

---

## 1. Architecture & Security Enforcements

The backend enforces financial and architectural invariants on every request:

### Authentication & Sessions
- **Universal Route Guard**: All `/api/*` endpoints require authentication via middleware, with the strict exception of `POST /api/login`, `POST /api/logout`, and `GET /api/ping`.
- **Signed Session Cookies**: Sessions use cryptographically random session IDs stored in signed, `HttpOnly`, `SameSite=Strict` cookies (with `Secure` forced in production).
- **Server-Side Revocation**: Active sessions are tracked in a server-side registry. `POST /api/logout` immediately purges the session ID, ensuring invalidated cookies cannot be reused.
- **Login Rate-Limiting & Exponential Back-Off**:
  - `app.set('trust proxy', 1)` enables accurate client IP tracking behind reverse proxies (Render, Cloudflare).
  - Failed logins are tracked per IP. After 5 failed attempts within 15 minutes, the IP is locked out for 1 hour.
  - A constant artificial delay (150ms) is applied to failed login attempts to prevent timing attacks.
  - Required password length: Passwords configured via `APP_PASSWORD` or `ADMIN_PASSWORD` must be at least **8 characters**. Fast numeric PIN authentication is supported via `APP_PIN` (4 digits).
- **Content-Security-Policy (CSP)**: Strict headers configured via Helmet/Express restricting script, style, image (`res.cloudinary.com`), and font origins with `x-frame-options: DENY`, `x-content-type-options: nosniff`, and `referrer-policy: no-referrer`.

### Double-Entry Accounting & Ledger Immutability (`ledger.js`)
- **Balanced Entries**: Every journal entry must have equal debits and credits ($\sum\text{Debits} = \sum\text{Credits}$).
- **Entry Immutability**: Posted journal entries cannot be edited in place. Lines, amounts, dates, reference numbers, and source types are immutable. Modifications require posting an offsetting reversal entry (`meta.replaces` / `meta.revBy`), maintaining an auditable transaction history.
- **Strict Period Locks**: Transactions and reversals cannot be posted on or before locked accounting periods (`biz.lock`). Reversals of entries within a locked period are strictly prohibited.
- **Integer Paise Representation**: All currency amounts (including `doc.total`, `doc.paid`, and payment lines `pays[].amt`) are validated and stored as non-negative integers in paise ($₹1.00 = 100\text{ paise}$) to eliminate floating-point rounding errors.
- **Optimistic Concurrency Control**: State updates use monotonic versioning (`version: N -> N+1`). Concurrent conflicts return `409 Conflict` without overwriting remote or dirty local changes.
- **Atomic Persistence**:
  - **PostgreSQL / Neon**: Atomic JSON state updates with `ssl: { rejectUnauthorized: true }` when `sslmode=require`.
  - **Local Disk (`DATA_FILE`)**: Written via temporary file creation followed by atomic rename (`fs.renameSync`).

### Document Immutability & Number Sequencing
- **Cancel Over Delete**: Sales invoices and purchase bills are never deleted from the ledger. Cancelling an invoice or bill reverses its associated accounting entries, sets `cancelled: true`, and permanently retains the document and number in audit logs.
- **Strict Monotonic Numbering**: Automatic sequence generators (`nextInvNo()`, `nextBillNo()`) compute the next number from the highest numerical suffix across **all** documents, including cancelled ones (e.g., cancelling invoice #3 of 5 guarantees the next invoice issued is #6). Re-using or duplicating existing document numbers is strictly rejected.

### Cloudinary Attachments & Offline Synchronization
- **Metadata-Only Synced State**: Documents persist attachment references solely as metadata: `doc.files = [{ name, type, size, url, public_id }]`. Base64 payloads are never stored in the synchronized ledger state.
- **Cloudinary Security**: Credentials are read strictly from environment variables (`CLOUDINARY_URL` or `CLOUDINARY_CLOUD_NAME`/`API_KEY`/`API_SECRET`). The legacy credential update route is removed, and configuration responses never expose secrets.
- **Upload Validation**: Decoded files are capped at **8 MB**, mime types restricted to `image/jpeg`, `image/png`, `image/webp`, and `application/pdf`, and upload folders restricted to `bufin/bills` and `bufin/invoices`.
- **Client Compression & Offline Queue**: Images are compressed client-side to $\le 1600\text{px}$ at JPEG 0.8 prior to upload. Failed or offline uploads queue in IndexedDB (`pending_uploads`), show an upload retry badge on the document, and automatically flush upon network recovery.

---

## 2. Environment Variables Reference

Configure the following variables in `backend/.env`:

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | Optional | `3001` | HTTP port the Express server listens on. |
| `NODE_ENV` | Optional | `development` | Set to `production` in staging/production to enforce `Secure` cookies. |
| `APP_PIN` | Required* | `1234` | 4-digit PIN for client fast-unlock and server authentication. |
| `APP_PASSWORD` | Optional* | — | Administrative password (minimum **8 characters**). |
| `SESSION_SECRET` | Required | — | High-entropy secret (min 32 chars) for cookie signing (e.g., `openssl rand -hex 32`). |
| `DATABASE_URL` | Optional | — | PostgreSQL connection string (Neon pooled URL). If unset, falls back to `data/state.json`. |
| `DATA_FILE` | Optional | `./data/state.json` | Path to JSON file storage when `DATABASE_URL` is not provided. |
| `CLOUDINARY_CLOUD_NAME` | Optional | — | Cloudinary cloud identifier for bill/invoice attachments. |
| `CLOUDINARY_API_KEY` | Optional | — | Cloudinary API Key. |
| `CLOUDINARY_API_SECRET` | Optional | — | Cloudinary API Secret. |
| `CLOUDINARY_URL` | Optional | — | Alternative single-string Cloudinary connection URL. |

*\* Either `APP_PIN` or `APP_PASSWORD` must be set.*

---

## 3. Dedicated Views: Desktop & Mobile UX

BUFIN maintains separate, dedicated UX paradigms for desktop and mobile viewports (`max-width: 760px`):

- **Desktop Experience**:
  - Full multi-column accounting tables (General Ledger, Trial Balance, Balance Sheet, Chart of Accounts).
  - Sticky side navigation, comprehensive KPI grids, and multi-field date range pickers.
  - Native document PDF generation with sub-resource integrity (SRI)-pinned jsPDF.
- **Mobile Experience**:
  - Fixed bottom navigation bar with safe-area insets (`safe-area-inset-bottom`).
  - Native touch-optimized swipe cards for transactions, bills, and accounts.
  - Touch-friendly action sheets (`showActionSheet`) replacing contextual menus with $\ge 44\text{px}$ touch targets.
  - Left-aligned card titles and account labels for natural readability.
  - Dedicated mobile date selector overlay with pre-calculated period presets (Today, This Month, FY).
  - Explicit performance-tuned DOM transformation (`enhanceMobile`) executed after view render and modal initialization, bypassing desktop mutation overhead.

---

## 4. Deployment Guide

### Backend: Render (Web Service)
1. Create a **Web Service** on Render connected to the repository.
2. Configure settings:
   - **Root Directory**: `backend`
   - **Build Command**: `npm install`
   - **Start Command**: `node src/server.js`
   - **Environment**: Node 20+
3. Add Environment Variables:
   - `NODE_ENV=production`
   - `SESSION_SECRET=<random-32-char-string>`
   - `APP_PIN=1234` (or your 4-digit PIN)
   - `APP_PASSWORD=<your-strong-password-min-8-chars>`
   - `DATABASE_URL=<your-neon-postgres-pooled-url>`
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
4. **Proxy & Cold-Start Considerations**:
   - BUFIN sets `app.set('trust proxy', 1)` to handle Render's reverse proxy correctly.
   - On Render free tiers, services spin down during inactivity. BUFIN's frontend boot sequence detects cold-start 502/503 responses, initiates an exponential back-off loop (up to 60 seconds), and displays a user-friendly *"Server is waking up..."* status indicator without corrupting or resetting local client state.

### Frontend: Vercel (Static SPA)
1. Import the repository into Vercel.
2. Configure settings:
   - **Root Directory**: `frontend`
   - **Build Command**: None (or leave blank; static assets only)
   - **Output Directory**: `.`
3. **API Routing / Proxy**:
   - Set up `vercel.json` rewrites to proxy `/api/(.*)` to your Render backend:
   ```json
   {
     "rewrites": [
       { "source": "/api/(.*)", "destination": "https://<your-render-app>.onrender.com/api/$1" },
       { "source": "/(.*)", "destination": "/$1" }
     ]
   }
   ```
4. Sub-Resource Integrity (SRI) is pinned for all external CDN dependencies (e.g. jsPDF), and OpenGraph metadata references absolute URLs.

---

## 5. Backup & Restore Procedures

### Automated Pre-Restore Safety Backup
BUFIN implements a strict "safety-first" restore workflow:
1. When initiating a restore via the UI (**Settings > Data & Storage > Restore**), the client automatically downloads a full `pre-restore-backup-[timestamp].json` snapshot of the active ledger to local storage before any mutation occurs.
2. The restore file is parsed and validated client-side:
   - Must contain valid `accounts`, `entries`, `parties`, `docs`, `loans`, and sequence definitions.
   - All restored entries must maintain mathematical equilibrium ($\sum\text{Debits} = \sum\text{Credits}$).
   - Unique reference IDs are verified.
3. The restore payload is sent to `POST /api/state/restore`:
   - Requires active session authentication and explicit re-entry of the administrative PIN/password.
   - The backend validates ledger balance and schema integrity.
   - The state is committed atomically, bumping the version and appending an immutable audit entry:
     `{ at: ISOString, action: 'restore', prevVersion, entriesBefore, entriesAfter }`.
4. The client clears transient cache and reloads the confirmed state from the server.

### Manual Backups
- **Consolidated & Entity CSVs**: Navigate to **Settings > Backup Data** to export a ZIP archive containing individual CSVs for General Ledger, Chart of Accounts, Customers/Suppliers, Invoices, and Purchase Bills.
- **Postgres Point-in-Time Restore**: When using Neon Postgres, point-in-time recovery and branch creation provide instant database-level rollbacks.

---

## 6. Testing & Continuous Integration

Run the unified test suite locally:

```bash
# Run all frontend and backend behavioural unit tests
npm run test:all
```

The test runner validates:
1. **Attachment Synchronization (`tests/attachment_sync.test.mjs`)**: Multi-device metadata-only sync, offline upload queuing, client image compression $\le 1600\text{px}$, and file retention on cancelled documents.
2. **Accounting Integrity (`tests/accounting_integrity.test.mjs`)**: Reversal liquidity offset in `checkCashLiquidity`, monthly cash flow reversal neutrality, strict period locking, document cancellation immutability, monotonic numbering sequence (`nextInvNo`), and loan rollback safety.
3. **Sync Engine (`tests/sync_engine.test.mjs`)**: Serialized pushing without self-409s, conflict isolation on dirty local changes, Render cold-start 502 recovery, and session wipe on logout.
4. **Audit Suite (`tests/audit_test_suite.mjs`)**: 51 comprehensive tests covering GST calculations, FIFO/weighted inventory stock, double-entry equilibrium, and mobile responsive adaptations.
5. **Backend Security & Routes (`backend/src/server.test.js` & `backend/src/test.js`)**: Universal middleware enforcement, 401 unauthenticated guards, IP rate-limiting, session revocation, folder/mime upload validation, and restore endpoint authorization.

### Continuous Integration
A GitHub Actions workflow (`.github/workflows/ci.yml`) runs `npm run test:all` automatically on every push and pull request to `main`.
