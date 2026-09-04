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
  assert.match(output, /CeloSentry Demo Vault/);
  assert.match(output, /0x29f065288a8d56cC2a6afA4ce1d64C80aCb2381e/);
  assert.match(output, /Demo Lab/);
});

test('every report is priced at the flat 0.01 cUSD demo rate', () => {
  for (const id of Object.keys(REPORTS)) {
    assert.equal(priceWeiForReport(id), '10000000000000000', `${id}: unexpected price`);
  }
});

test('unknown report falls back to the PRICE_CUSD default', () => {
  const expected = BigInt(Math.floor(parseFloat(process.env.PRICE_CUSD || '0.5') * 1e18)).toString();
  assert.equal(priceWeiForReport('R-999'), expected);
});

test('formats a complete security report as markdown', () => {
  const output = formatReportMarkdown('R-001', REPORTS['R-001']);
  assert.match(output, /^# \[HIGH\] Unbounded approval drift/m);
  assert.match(output, /## Impact/);
  assert.match(output, /## Proof of concept/);
  assert.match(output, /## Recommended fix/);
});
