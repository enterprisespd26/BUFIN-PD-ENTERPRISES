// Server-side ledger integrity checks. The client is never trusted.
function validate(next, prev) {
  const fail = m => { const e = new Error(m); e.status = 422; throw e };
  if (!next || !Array.isArray(next.entries) || !Array.isArray(next.accounts)) fail('Invalid state shape');
  const codes = new Set(next.accounts.map(a => a.code));
  if (codes.size !== next.accounts.length) fail('Duplicate account codes');
  const refs = new Set();
  for (const e of next.entries) {
    if (refs.has(e.ref)) fail('Duplicate journal reference ' + e.ref); refs.add(e.ref);
    if (!Array.isArray(e.lines) || e.lines.length < 2) fail(e.ref + ': needs at least two lines');
    let d = 0, c = 0;
    for (const l of e.lines) {
      if (!codes.has(l.a)) fail(e.ref + ': unknown account ' + l.a);
      if (!Number.isInteger(l.d) || !Number.isInteger(l.c) || l.d < 0 || l.c < 0 || (l.d && l.c)) fail(e.ref + ': invalid line amounts');
      d += l.d; c += l.c;
    }
    if (d !== c) fail(e.ref + ': debits and credits differ');
  }
  if (prev) {
    const old = new Map(prev.entries.map(e => [e.id, e]));
    const cur = new Map(next.entries.map(e => [e.id, e]));
    for (const [id, o] of old) {
      const n = cur.get(id);
      if (!n) fail('Posted entry ' + o.ref + ' cannot be deleted');
    }
    const lock = next.biz && next.biz.lock;
    if (lock) for (const e of next.entries) if (!old.has(e.id) && e.date <= lock) fail(e.ref + ': period is locked up to ' + lock);
  }
}
module.exports = { validate };
