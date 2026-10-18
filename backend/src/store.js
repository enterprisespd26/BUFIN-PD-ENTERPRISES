const fs = require('fs'), path = require('path');
// Neon/Postgres when DATABASE_URL is set, otherwise a local JSON file. put() is optimistic: returns null on version conflict.
if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  module.exports = {
    init: () => pool.query('create table if not exists app_state(id text primary key, version int not null, data jsonb not null, updated_at timestamptz default now())'),
    get: async () => (await pool.query("select version, data from app_state where id='main'")).rows[0] || null,
    put: async (v, d) => { const r = await pool.query("insert into app_state(id,version,data) values('main',1,$1) on conflict(id) do update set version=app_state.version+1, data=$1, updated_at=now() where app_state.version=$2 returning version", [JSON.stringify(d), v]); return r.rows[0] ? r.rows[0].version : null }
  };
} else {
  const f = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'state.json');
  const read = () => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  module.exports = {
    init: async () => fs.mkdirSync(path.dirname(f), { recursive: true }),
    get: async () => read(),
    put: async (v, d) => { const c = read(); if (c && c.version !== v) return null; const n = (c ? c.version : 0) + 1; fs.writeFileSync(f + '.tmp', JSON.stringify({ version: n, data: d })); fs.renameSync(f + '.tmp', f); return n }
  };
}
