const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { migrateSchema } = require('./ledger');
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
    init: async () => {
      await pool.query('create table if not exists app_state(id text primary key, version int not null, data jsonb not null, updated_at timestamptz default now())');
      await pool.query('create table if not exists app_auth(id text primary key, hash text not null, updated_at timestamptz default now())');
    },
    get: async () => {
      const row = (await pool.query("select version, data from app_state where id='main'")).rows[0] || null;
      if (row && row.data) migrateSchema(row.data);
      return row;
    },
    put: async (v, d) => { const r = await pool.query("insert into app_state(id,version,data) values('main',1,$1) on conflict(id) do update set version=app_state.version+1, data=$1, updated_at=now() where app_state.version=$2 returning version", [JSON.stringify(d), v]); return r.rows[0] ? r.rows[0].version : null },
    restore: async (d) => { const r = await pool.query("insert into app_state(id,version,data) values('main',1,$1) on conflict(id) do update set version=app_state.version+1, data=$1, updated_at=now() returning version", [JSON.stringify(d)]); return r.rows[0] ? r.rows[0].version : null },
    getAuth: async () => {
      try {
        const r = await pool.query("select hash from app_auth where id='main'");
        return r.rows[0] ? r.rows[0].hash : null;
      } catch (e) {
        return null;
      }
    },
    setAuth: async (hash) => {
      await pool.query("insert into app_auth(id, hash) values('main', $1) on conflict(id) do update set hash=$1, updated_at=now()", [hash]);
      return true;
    }
  };
} else {
  const f = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'state.json');
  const authFile = process.env.AUTH_FILE || path.join(path.dirname(f), 'auth.json');
  const read = () => {
    if (!fs.existsSync(f)) return null;
    const row = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (row && row.data) migrateSchema(row.data);
    return row;
  };
  module.exports = {
    init: async () => {
      fs.mkdirSync(path.dirname(f), { recursive: true });
    },
    get: async () => read(),
    put: async (v, d) => {
      const c = read();
      if (c && c.version !== v) return null;
      const n = (c ? c.version : 0) + 1;
      const tmp = `${f}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: n, data: d }));
      fs.renameSync(tmp, f);
      return n;
    },
    restore: async (d) => {
      const c = read();
      const n = (c ? c.version : 0) + 1;
      const tmp = `${f}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: n, data: d }));
      fs.renameSync(tmp, f);
      return n;
    },
    getAuth: async () => {
      if (!fs.existsSync(authFile)) return null;
      try {
        const j = JSON.parse(fs.readFileSync(authFile, 'utf8'));
        return j.hash || null;
      } catch (e) {
        return null;
      }
    },
    setAuth: async (hash) => {
      fs.mkdirSync(path.dirname(authFile), { recursive: true });
      const tmp = `${authFile}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ hash, updatedAt: new Date().toISOString() }));
      fs.renameSync(tmp, authFile);
      return true;
    }
  };
}
