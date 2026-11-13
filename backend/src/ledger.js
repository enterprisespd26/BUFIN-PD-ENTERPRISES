// Server-side ledger integrity checks. The client is never trusted.

function migrateSchema(data) {
  if (!data || !Array.isArray(data.docs)) return data;
  if (!data.schemaVer || data.schemaVer < 2) {
    for (const doc of data.docs) {
      if (!doc) continue;
      if (doc.total !== undefined && doc.total !== null) {
        doc.total = Math.round(Number(doc.total) || 0);
      }
      if (Array.isArray(doc.pays)) {
        for (const p of doc.pays) {
          const rawAmt = p.amt !== undefined ? p.amt : p.a;
          p.amt = Math.round(Number(rawAmt) || 0);
        }
      }
      if (Array.isArray(doc.pays) && doc.pays.length) {
        doc.paid = doc.pays.reduce((s, p) => s + (p.void ? 0 : (p.amt || 0)), 0);
      } else if (doc.paid !== undefined && doc.paid !== null) {
        const total = doc.total || 0;
        const raw = Number(doc.paid) || 0;
        if (raw > (total / 100) * 10 && total > 0) {
          doc.paid = Math.round(raw);
        } else {
          doc.paid = Math.round(raw * 100);
        }
      }
    }
    data.schemaVer = 2;
  }
  return data;
}

function validate(next, prev) {
  const fail = m => { const e = new Error(m); e.status = 422; throw e; };
  if (!next || !Array.isArray(next.entries) || !Array.isArray(next.accounts)) fail('Invalid state shape');

  const codes = new Set(next.accounts.map(a => a.code));
  if (codes.size !== next.accounts.length) fail('Duplicate account codes');

  // Check unique entry IDs and journal references
  const entryIds = new Set();
  const refs = new Set();
  for (const e of next.entries) {
    if (!e.id) fail('Entry missing id');
    if (entryIds.has(e.id)) fail('Duplicate entry id ' + e.id);
    entryIds.add(e.id);

    if (refs.has(e.ref)) fail('Duplicate journal reference ' + e.ref);
    refs.add(e.ref);

    if (!Array.isArray(e.lines) || e.lines.length < 2) fail(e.ref + ': needs at least two lines');
    let d = 0, c = 0;
    for (const l of e.lines) {
      if (!codes.has(l.a)) fail(e.ref + ': unknown account ' + l.a);
      if (!Number.isInteger(l.d) || !Number.isInteger(l.c) || l.d < 0 || l.c < 0 || (l.d && l.c)) fail(e.ref + ': invalid line amounts');
      d += l.d; c += l.c;
    }
    if (d !== c) fail(e.ref + ': debits and credits differ');
  }

  // Document validation
  if (Array.isArray(next.docs)) {
    const docIds = new Set();
    for (const doc of next.docs) {
      if (!doc) continue;
      if (doc.id) {
        if (docIds.has(doc.id)) fail('Duplicate document id ' + doc.id);
        docIds.add(doc.id);
      }

      // Require integer paise for total and paid
      if (doc.total !== undefined && (!Number.isInteger(doc.total) || doc.total < 0)) {
        fail(`Document ${doc.no || doc.id}: total must be a non-negative integer in paise`);
      }
      if (doc.paid !== undefined && (!Number.isInteger(doc.paid) || doc.paid < 0)) {
        fail(`Document ${doc.no || doc.id}: paid must be a non-negative integer in paise`);
      }

      if (Array.isArray(doc.pays)) {
        for (const p of doc.pays) {
          const amt = p.amt !== undefined ? p.amt : p.a;
          if (amt !== undefined && (!Number.isInteger(amt) || amt < 0)) {
            fail(`Document ${doc.no || doc.id}: payment amount must be a non-negative integer in paise`);
          }
        }
      }

      if (doc.type === 'sale' || doc.type === 'bill') {
        const totalPaisa = doc.total || 0;
        let paidPaisa = 0;
        if (Array.isArray(doc.pays) && doc.pays.length) {
          paidPaisa = doc.pays.reduce((s, p) => s + (p.void ? 0 : (p.amt !== undefined ? p.amt : (p.a || 0))), 0);
        } else if (doc.paid !== undefined && doc.paid !== null) {
          paidPaisa = doc.paid;
        }
        if (paidPaisa > totalPaisa) {
          fail(`Document ${doc.no || doc.id}: Paid amount (${paidPaisa / 100}) cannot exceed grand total (${totalPaisa / 100})`);
        }
      }
    }
  }

  if (prev) {
    const old = new Map(prev.entries.map(e => [e.id, e]));
    const cur = new Map(next.entries.map(e => [e.id, e]));
    const lock = next.biz && next.biz.lock;

    for (const [id, o] of old) {
      const n = cur.get(id);
      if (!n) fail('Posted entry ' + o.ref + ' cannot be deleted');

      // Immutability: require lines, date, ref, id, src unchanged
      if (o.ref !== n.ref) fail(`Posted entry ${o.ref}: reference cannot be changed`);
      if (o.date !== n.date) fail(`Posted entry ${o.ref}: date cannot be changed`);
      if (o.src !== n.src) fail(`Posted entry ${o.ref}: source cannot be changed`);

      if (!Array.isArray(n.lines) || n.lines.length !== o.lines.length) {
        fail(`Posted entry ${o.ref}: lines cannot be modified`);
      }
      for (let i = 0; i < o.lines.length; i++) {
        const ol = o.lines[i];
        const nl = n.lines[i];
        if (ol.a !== nl.a || ol.d !== nl.d || ol.c !== nl.c || (ol.p || undefined) !== (nl.p || undefined)) {
          fail(`Posted entry ${o.ref}: lines cannot be modified`);
        }
      }

      // Status transitions: only posted -> reversed or unchanged allowed
      const oStatus = o.status || 'posted';
      const nStatus = n.status || 'posted';
      if (oStatus === 'reversed' && nStatus !== 'reversed') {
        fail(`Reversed entry ${o.ref}: status cannot be changed back`);
      }
      if (oStatus === 'posted' && nStatus !== 'posted' && nStatus !== 'reversed') {
        fail(`Posted entry ${o.ref}: invalid status transition to ${nStatus}`);
      }

      // Meta additions only: existing keys cannot be changed or removed
      if (o.meta && typeof o.meta === 'object') {
        if (!n.meta || typeof n.meta !== 'object') {
          fail(`Posted entry ${o.ref}: meta cannot be removed`);
        }
        for (const [k, v] of Object.entries(o.meta)) {
          if (n.meta[k] !== v) {
            fail(`Posted entry ${o.ref}: meta property ${k} cannot be altered`);
          }
        }
      }

      // Changed entry check
      const isStatusChanged = oStatus !== nStatus;
      let isMetaChanged = false;
      if (Boolean(o.meta) !== Boolean(n.meta)) {
        isMetaChanged = true;
      } else if (o.meta && n.meta) {
        const oKeys = Object.keys(o.meta);
        const nKeys = Object.keys(n.meta);
        if (oKeys.length !== nKeys.length) isMetaChanged = true;
      }

      // Reject if a changed entry is dated <= lock
      if ((isStatusChanged || isMetaChanged) && lock && o.date <= lock) {
        fail(`Entry ${o.ref} dated ${o.date} is in locked period (lock: ${lock}) and cannot be modified`);
      }
    }

    if (lock) {
      for (const e of next.entries) {
        if (!old.has(e.id) && e.date <= lock) {
          fail(e.ref + ': period is locked up to ' + lock);
        }
      }
    }
  }
}

module.exports = { validate, migrateSchema };
