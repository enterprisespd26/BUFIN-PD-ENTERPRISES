const { validate, migrateSchema } = require('./ledger');
const assert = require('assert');

const acc = [{ code: '1000' }, { code: '4000' }];
const e = (id, d, c, opts = {}) => ({
  id,
  ref: 'JV-' + id,
  date: opts.date || '2026-01-01',
  src: opts.src || 'jv',
  status: opts.status || 'posted',
  meta: opts.meta || {},
  narr: 'x',
  lines: [{ a: '1000', d, c: 0 }, { a: '4000', d: 0, c }]
});

// Basic validation: Balanced entries pass, unbalanced throw
validate({ accounts: acc, entries: [e('a', 100, 100)] });
assert.throws(() => validate({ accounts: acc, entries: [e('a', 100, 90)] }), /differ/);

// Duplicate entry ids are rejected
assert.throws(() => validate({
  accounts: acc,
  entries: [
    e('dup', 100, 100, { ref: 'JV-dup1' }),
    { ...e('dup', 100, 100), ref: 'JV-dup2' }
  ]
}), /Duplicate entry id/);

const prev = { accounts: acc, entries: [e('a', 100, 100)] };

// 1. Step 5 Immutability: In-place edit of lines/amount MUST be rejected
assert.throws(
  () => validate({ accounts: acc, entries: [e('a', 200, 200)] }, prev),
  /lines cannot be modified/
);

// In-place edit of date, ref, or src MUST be rejected
assert.throws(
  () => validate({ accounts: acc, entries: [e('a', 100, 100, { date: '2026-01-02' })] }, prev),
  /date cannot be changed/
);

// 2. Step 5 Immutability: Allowed transitions (posted -> reversed with meta addition in open period)
validate({
  accounts: acc,
  entries: [e('a', 100, 100, { status: 'reversed', meta: { revBy: 'JV-rev1' } })]
}, prev);

// 3. Step 5 Period lock: Editing/reversing an entry dated <= lock MUST be rejected
const lockedPrev = {
  accounts: acc,
  biz: { lock: '2026-01-15' },
  entries: [e('a', 100, 100, { date: '2026-01-01' })]
};

// Trying to modify status in locked period
assert.throws(
  () => validate({
    accounts: acc,
    biz: { lock: '2026-01-15' },
    entries: [e('a', 100, 100, { date: '2026-01-01', status: 'reversed' })]
  }, lockedPrev),
  /locked period/
);

// Posting a new entry in locked period is rejected
assert.throws(
  () => validate({
    accounts: acc,
    biz: { lock: '2026-01-15' },
    entries: [
      e('a', 100, 100, { date: '2026-01-01' }),
      e('b', 50, 50, { date: '2026-01-10' })
    ]
  }, lockedPrev),
  /period is locked/
);

// Posting a new reversal entry AFTER the lock period is accepted (leaves original intact)
validate({
  accounts: acc,
  biz: { lock: '2026-01-15' },
  entries: [
    e('a', 100, 100, { date: '2026-01-01' }),
    e('rev-a', 0, 0, {
      date: '2026-01-20',
      src: 'rev',
      // Swapped lines for reversal
      lines: [{ a: '1000', d: 0, c: 100 }, { a: '4000', d: 100, c: 0 }]
    })
  ]
}, lockedPrev);

// 4. Documents: Integer paise and amount validations
assert.throws(() => validate({
  accounts: acc,
  entries: [e('a', 100, 100)],
  docs: [{ id: 'd1', type: 'sale', total: 100.5, paid: 50 }]
}), /total must be a non-negative integer in paise/);

assert.throws(() => validate({
  accounts: acc,
  entries: [e('a', 100, 100)],
  docs: [{ id: 'd1', type: 'sale', total: 10000, paid: 50.25 }]
}), /paid must be a non-negative integer in paise/);

assert.throws(() => validate({
  accounts: acc,
  entries: [e('a', 100, 100)],
  docs: [{ id: 'd1', type: 'sale', total: 10000, paid: 15000 }]
}), /cannot exceed grand total/);

// Valid document passes
validate({
  accounts: acc,
  entries: [e('a', 100, 100)],
  docs: [{ id: 'd1', type: 'sale', total: 10000, paid: 10000, pays: [{ amt: 10000 }] }]
});

// 5. Schema migration test
const legacyData = {
  docs: [
    { id: 'leg1', type: 'sale', total: 50000, paid: 500, pays: [{ a: 50000 }] },
    { id: 'leg2', type: 'sale', total: 20000, paid: 200 }
  ]
};
migrateSchema(legacyData);
assert.strictEqual(legacyData.schemaVer, 2);
assert.strictEqual(legacyData.docs[0].paid, 50000);
assert.strictEqual(legacyData.docs[0].pays[0].amt, 50000);
assert.strictEqual(legacyData.docs[1].paid, 20000);

console.log('ledger tests passed');
