import test from 'node:test';
import assert from 'node:assert/strict';
import { formatReportMarkdown, REPORTS, priceWeiForReport } from '../src/server.js';

test('CRITICAL report costs 1 USD', () => {
  const w = priceWeiForReport('R-003');
  assert.equal(w, '1000000000000000000'); // 1e18
});

test('MEDIUM report costs 0.50 USD', () => {
  const w = priceWeiForReport('R-005');
  assert.equal(w, '500000000000000000'); // 0.5e18
});

test('LOW report costs 0.10 USD', () => {
  const w = priceWeiForReport('R-008');
  assert.equal(w, '200000000000000000'); // 0.2e18
});

test('unknown report falls back to PRICE_CUSD default 0.5', () => {
  const w = priceWeiForReport('R-999');
  assert.equal(w, '500000000000000000'); // default PRICE_CUSD 0.5
});

test('formats a complete security report as markdown', () => {
  const output = formatReportMarkdown('R-001', REPORTS['R-001']);
  assert.match(output, /^# \[HIGH\] Unbounded approval drift/m);
  assert.match(output, /## Impact/);
  assert.match(output, /## Proof of concept/);
  assert.match(output, /## Recommended fix/);
});
