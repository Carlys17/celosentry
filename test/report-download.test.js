import test from 'node:test';
import assert from 'node:assert/strict';
import { formatReportMarkdown, REPORTS } from '../src/server.js';

test('formats a complete security report as markdown', () => {
  const output = formatReportMarkdown('R-001', REPORTS['R-001']);
  assert.match(output, /^# \[HIGH\] Unbounded approval drift/m);
  assert.match(output, /## Impact/);
  assert.match(output, /## Proof of concept/);
  assert.match(output, /## Recommended fix/);
});
