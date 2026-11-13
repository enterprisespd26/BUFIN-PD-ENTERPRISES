const fs = require('fs'), path = require('path'), crypto = require('crypto');
// Neon/Postgres when DATABASE_URL is set, otherwise a local JSON file. put() is optimistic: returns null on version conflict.
if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  let ssl = { rejectUnauthorized: false };
  try {
    const u = new URL(process.env.DATABASE_URL);
    if (u.searchParams.get('sslmode') === 'require') {
      ssl = { rejectUnauthorized: true };
    }
  } catch (e) {
    if (/[?&]sslmode=require\b/i.test(process.env.DATABASE_URL)) {
      ssl = { rejectUnauthorized: true };
    }
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl });
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
    put: async (v, d) => {
      const c = read();
      if (c && c.version !== v) return null;
      const n = (c ? c.version : 0) + 1;
      const tmp = `${f}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: n, data: d }));
      fs.renameSync(tmp, f);
      return n;
    }
  };
}
