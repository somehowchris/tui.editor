/* eslint-disable @typescript-eslint/no-var-requires */
const assert = require('assert').strict;
const buildDate = require('./buildDate');

assert.equal(buildDate('0'), '1970-01-01');
assert.equal(buildDate('1793491200'), '2026-11-01');
assert.equal(buildDate('253402300800'), '+010000-01-01');
['', '-1', '1.5', 'NaN', 'Infinity', '1000000000000000000000'].forEach((value) => {
  assert.throws(() => buildDate(value), /SOURCE_DATE_EPOCH/);
});
const saved = process.env.TZ;

try {
  process.env.TZ = 'Pacific/Honolulu';
  assert.equal(buildDate('0'), '1970-01-01');
  process.env.TZ = 'Pacific/Auckland';
  assert.equal(buildDate('0'), '1970-01-01');
} finally {
  if (typeof saved === 'undefined') {
    delete process.env.TZ;
  } else {
    process.env.TZ = saved;
  }
}
