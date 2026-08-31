import test from 'node:test';
import assert from 'node:assert/strict';
import { formatReportMarkdown, REPORTS, TARGETS, priceWeiForReport } from '../src/server.js';

test('every report has a complete target (project, contract, component, commit)', () => {
  for (const [id, rep] of Object.entries(REPORTS)) {
    const t = TARGETS[id];
    assert.ok(t, `missing target for ${id}`);
    assert.ok(t.project, `${id}: project missing`);
    assert.ok(/^0x[0-9a-fA-F]{40}$/.test(t.contract), `${id}: bad contract address`);
    assert.ok(t.component, `${id}: component missing`);
    assert.ok(t.commit, `${id}: commit missing`);
    assert.equal(t.network, 'celo-mainnet', `${id}: wrong network`);
  }
});

test('markdown download includes the target table', () => {
  const output = formatReportMarkdown('R-003', REPORTS['R-003']);
  assert.match(output, /## Target/);
  assert.match(output, /Simulated RewardsDistributor/);
  assert.match(output, /0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa03/);
  assert.match(output, /Simulated target/);
});

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
