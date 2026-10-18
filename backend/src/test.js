const { validate } = require('./ledger'); const assert = require('assert');
const acc = [{ code: '1000' }, { code: '4000' }];
const e = (id, d, c) => ({ id, ref: 'JV-' + id, date: '2026-01-01', narr: 'x', lines: [{ a: '1000', d, c: 0 }, { a: '4000', d: 0, c }] });
validate({ accounts: acc, entries: [e('a', 100, 100)] });
assert.throws(() => validate({ accounts: acc, entries: [e('a', 100, 90)] }), /differ/);
const prev = { accounts: acc, entries: [e('a', 100, 100)] };
// Upsert/Update allowed when balanced
validate({ accounts: acc, entries: [e('a', 200, 200)] }, prev);
assert.throws(() => validate({ accounts: acc, biz: { lock: '2026-02-01' }, entries: [e('a', 100, 100), e('b', 5, 5)] }, prev), /locked/);
console.log('ledger tests passed');
