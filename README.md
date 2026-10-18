# BUFIN (internal business ledger)
Internal use only. Single owner, single business, double-entry ledger.

- `frontend/` single-page app (served by the backend). Works on desktop and mobile.
- `backend/` Express API: password login, saves ledger state to Neon Postgres (or a local JSON file), and re-checks integrity on every save (balanced entries, no edits or deletes of posted entries, locked periods, duplicate refs, optimistic version control).

## Run
    cd backend && npm install
    cp .env.example .env   # set APP_PASSWORD and SESSION_SECRET, optionally DATABASE_URL (Neon pooled URL)
    export $(grep -v '^#' .env | xargs) && npm start
Open http://localhost:3000 and enter the password. `npm test` runs the ledger integrity tests.

## Production
Run behind HTTPS with NODE_ENV=production (cookie becomes Secure). Back up with Neon branches/point-in-time restore, or copy `data/state.json`. Settings has a manual backup too.

## Not included
Document uploads/OCR, inventory, quotations, credit notes, cash flow statement, multi-user roles, server-generated PDFs (invoices print from the browser), government GST integrations. Reports are computed in the browser from the validated ledger.
