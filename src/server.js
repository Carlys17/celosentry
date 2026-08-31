// CeloSentry x402 server.
// Security reports behind an x402 paywall: agents pay cUSD to unlock,
// settlements verified on-chain and credited to the attribution tag.
//
// GET  /             -> agent info + stats
// GET  /findings     -> report summaries (free)
// GET  /report/:id   -> 402 + payment requirements, or full report once settled
// POST /settle       -> { txHash, from, amount, reportId } verify + unlock
// GET  /stats        -> leaderboard-facing stats
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySettlement, recordSettlement, recordFinding, stats, loadLedger } from './ledger.js';
import { ATTRIBUTION_TAG, ADDRESSES } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

const PORT = process.env.PORT || 8787;
const PRICE_CUSD = process.env.PRICE_CUSD || '0.5';
const PRICE_WEI = BigInt(Math.floor(parseFloat(PRICE_CUSD) * 1e18)).toString();

// Demo security reports (would come from the triage pipeline)
export const REPORTS = {
  'R-001': {
    title: 'Unbounded approval drift in Celo ecosystem token distributor',
    severity: 'HIGH',
    summary: 'Distributor contract allows infinite approvals to drift after role rotation.',
    details: `Impact: HIGH. A spender approved by the distributor can retain an unlimited allowance after its operational role is rotated or revoked. If the spender key or contract is compromised, previously approved token balances remain drainable.

Root cause: the role-rotation path updates the authorized spender but does not clear the ERC-20 allowance granted to the old spender. The allowance is not automatically tied to the role membership.

Proof of concept: (1) distributor approves Spender-A for type(uint256).max; (2) administrator rotates the role to Spender-B; (3) Spender-A is no longer an active role holder but allowance(spenderA) remains non-zero; (4) Spender-A can call transferFrom(distributor, attacker, amount) while the distributor has token balance.

Recommended fix: before or during rotation, set allowance(oldSpender, 0), then grant a bounded allowance to the new spender. Prefer an internal allowance wrapper with an explicit revoke step and emit an Approval event for the zeroing operation. Add a regression test covering role rotation, allowance state, and transferFrom after revocation.

Validation checklist: inspect the distributor's allowance for every historical spender, revoke stale approvals, rotate the role, then confirm transferFrom by the old spender reverts. This is a demo finding for the CeloSentry workflow and should be independently validated against the target contract before remediation.`
  },
  'R-002': {
    title: 'cUSD fee-currency rounding leak in x402 facilitator flow',
    severity: 'MEDIUM',
    summary: 'Rounding direction leaks dust to the caller on partial settlements.',
    details: `Impact: MEDIUM. When a facilitator converts a requested fee into token base units, integer division rounds in one direction. Repeated partial settlements can leave a small remainder that is not allocated according to the quoted fee.

Root cause: feeBaseUnits = quotedFee * amount / quoteAmount is truncated without a clearly defined rounding policy. The verification path and settlement path do not use the same remainder handling.

Reproduction: choose a quote whose division is not exact, submit several partial payments, and compare the sum of settled base units with the original quote. The difference is dust per settlement and accumulates over repeated calls. The exact amount depends on token decimals and quote parameters.

Recommended fix: define the rounding direction in the protocol specification, use checked integer arithmetic, and account for the remainder explicitly. Either reject non-exact partial settlements or assign the remainder deterministically to the final settlement. Add property tests asserting conservation of value across split and full payments.

Validation checklist: test zero, one-unit, maximum, and non-divisible quote values; compare verifier output with the actual token transfer; assert that the facilitator cannot create or lose value through repeated partial settlement. This is a demo finding for the CeloSentry workflow and should be independently validated against the target facilitator implementation.`
  },
};

// unlocked[reportId][payer] = { txHash, tagged, at }
const unlocked = {};

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

export function x402Requirements(reportId) {
  return [
    {
      scheme: 'exact',
      network: 'celo',
      maxAmountRequired: PRICE_WEI,
      resource: `https://carly17.my.id/celosentry/report/${reportId}`,
      description: `CeloSentry security report ${reportId} (cUSD x402)`,
      mimeType: 'application/json',
      payTo: ADDRESSES.agentWallet,
      asset: ADDRESSES.cusd,
      maxTimeoutSeconds: 120,
      extra: { attributionTag: ATTRIBUTION_TAG, name: 'Celo Dollar', version: '2' },
    },
  ];
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/' && req.method === 'GET') {
    // serve the web UI when a browser hits root
    const accept = (req.headers['accept'] || '').toLowerCase();
    if (accept.includes('text/html')) {
      try {
        const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      } catch (e) { /* fall through to JSON */ }
    }
    return json(res, 200, {
      agent: 'CeloSentry',
      erc8004: 'https://8004scan.io/agents/celo/9798',
      attributionTag: ATTRIBUTION_TAG,
      description: 'Security bounty agent - findings for cUSD via x402',
      ui: 'Open this URL in a browser to use the wallet-based UI',
      stats: stats(),
    });
  }

  if (url.pathname === '/findings' && req.method === 'GET') {
    return json(res, 200, { reports: REPORTS, ledger: { settlements: stats().settlements, findings: stats().findings } });
  }

  const m = url.pathname.match(/^\/report\/(R-\d+)$/);
  if (m && req.method === 'GET') {
    const id = m[1];
    const report = REPORTS[id];
    if (!report) return json(res, 404, { error: 'unknown report' });

    const un = unlocked[id] || {};
    // Restore unlock state after restart from the persisted settlement ledger.
    const payer = (url.searchParams.get('from') || '').toLowerCase();
    if (payer && Object.keys(un).length === 0) {
      const prior = loadLedger().settlements.find(s => s.from?.toLowerCase() === payer);
      if (prior) {
        un[payer] = { txHash: prior.txHash, tagged: prior.tagged, at: prior.recordedAt };
      }
    }
    if (Object.keys(un).length === 0) {
      // 402 Payment Required - x402
      res.writeHead(402, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({
        x402Version: 1,
        error: 'X-402: payment required',
        accepts: x402Requirements(id),
      }, null, 2));
    }
    return json(res, 200, { id, ...report, full: true, unlockedBy: un });
  }

  if (url.pathname === '/settle' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const { txHash, from, amount, reportId } = JSON.parse(body);
        if (!txHash || !from || !amount || !reportId) {
          return json(res, 400, { error: 'txHash, from, amount, reportId required' });
        }
        const v = await verifySettlement({ txHash, from, amount });
        if (!v.ok) return json(res, 402, { error: v.reason });

        recordSettlement(v);
        unlocked[reportId] = unlocked[reportId] || {};
        unlocked[reportId][from.toLowerCase()] = { txHash: v.txHash, tagged: v.tagged, at: new Date().toISOString() };

        return json(res, 200, {
          ok: true,
          reportId,
          tagged: v.tagged,
          attributionTag: ATTRIBUTION_TAG,
          amountCusd: (BigInt(v.amountCusdWei) / 10n ** 18n).toString(),
          txHash,
        });
      } catch (e) {
        return json(res, 400, { error: e.message });
      }
    });
    return;
  }

  if (url.pathname === '/stats' && req.method === 'GET') {
    return json(res, 200, stats());
  }

  json(res, 404, { error: 'not found' });
});

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, () => console.log(`CeloSentry x402 server on :${PORT} | tag ${ATTRIBUTION_TAG}`));
}

export { server };
