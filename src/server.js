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

export function priceWeiForReport(reportId) {
  const price = REPORTS[reportId]?.priceCusd || PRICE_CUSD;
  return BigInt(Math.floor(parseFloat(price) * 1e18)).toString();
}

// Demo security reports (would come from the triage pipeline)
export const REPORTS = {
  'R-001': {
    title: 'Unbounded approval drift in Celo ecosystem token distributor',
    severity: 'HIGH',
    priceCusd: '0.50',
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
    priceCusd: '0.50',
    summary: 'Rounding direction leaks dust to the caller on partial settlements.',
    details: `Impact: MEDIUM. When a facilitator converts a requested fee into token base units, integer division rounds in one direction. Repeated partial settlements can leave a small remainder that is not allocated according to the quoted fee.

Root cause: feeBaseUnits = quotedFee * amount / quoteAmount is truncated without a clearly defined rounding policy. The verification path and settlement path do not use the same remainder handling.

Reproduction: choose a quote whose division is not exact, submit several partial payments, and compare the sum of settled base units with the original quote. The difference is dust per settlement and accumulates over repeated calls. The exact amount depends on token decimals and quote parameters.

Recommended fix: define the rounding direction in the protocol specification, use checked integer arithmetic, and account for the remainder explicitly. Either reject non-exact partial settlements or assign the remainder deterministically to the final settlement. Add property tests asserting conservation of value across split and full payments.

Validation checklist: test zero, one-unit, maximum, and non-divisible quote values; compare verifier output with the actual token transfer; assert that the facilitator cannot create or lose value through repeated partial settlement. This is a demo finding for the CeloSentry workflow and should be independently validated against the target facilitator implementation.`
  },
  'R-003': {
    title: 'Critical authorization bypass in Celo rewards distributor', severity: 'CRITICAL',
    priceCusd: '1.00', summary: 'A callable reward-claim path does not bind the signed authorization to the intended beneficiary.',
    details: `Impact: CRITICAL. An attacker may redirect claimable rewards to an arbitrary address without controlling the beneficiary account. If the distributor holds a large reward reserve, the loss can be material.\n\nRoot cause: the signature validation covers the amount and nonce but omits the recipient binding, allowing a valid authorization to be replayed with a different destination.\n\nProof of concept: obtain a valid claim authorization, replace the recipient argument with an attacker-controlled address, submit the claim, and observe the token transfer destination.\n\nRecommended fix: include the beneficiary and verifying contract in the signed domain and message, consume the nonce before external calls, and reject recipient mismatches.\n\nValidation checklist: test recipient substitution, chain replay, nonce replay, zero recipient, and domain-separator changes.`
  },
  'R-004': {
    title: 'Critical emergency pause bypass through alternate withdrawal path', severity: 'CRITICAL',
    priceCusd: '1.00', summary: 'The emergency pause stops deposits but leaves an alternate withdrawal route callable.',
    details: `Impact: CRITICAL. During an incident, privileged or public callers may continue moving assets through a withdrawal entry point that does not check the pause flag.\n\nRoot cause: pause enforcement is applied in the primary function but not in the internal helper exposed by the alternate route.\n\nProof of concept: activate the pause, call the alternate withdrawal function with a valid position, and confirm that the transfer still executes.\n\nRecommended fix: enforce pause state at the shared state-changing boundary and add a single modifier to every asset-moving entry point.\n\nValidation checklist: enumerate all external and public asset-moving functions and assert every one reverts while paused.`
  },
  'R-005': {
    title: 'Stale oracle price accepted during Celo collateral update', severity: 'MEDIUM',
    priceCusd: '0.50', summary: 'A collateral operation accepts an oracle round outside the intended freshness window.',
    details: `Impact: MEDIUM. Borrowers may receive excess credit or liquidators may act on stale market data during a rapid price move.\n\nRoot cause: the freshness check validates a non-zero timestamp but does not enforce the configured maximum age.\n\nReproduction: use a deliberately old round with a non-zero timestamp and call the collateral update; the operation succeeds beyond the freshness threshold.\n\nRecommended fix: enforce updatedAt plus maxAge against the current block timestamp and reject incomplete rounds.\n\nValidation checklist: test stale, future-dated, answeredInRound mismatch, zero price, and sequencer downtime cases.`
  },
  'R-006': {
    title: 'Missing slippage bound in stablecoin rebalance helper', severity: 'MEDIUM',
    priceCusd: '0.50', summary: 'The rebalance helper executes a swap without a minimum output bound supplied by the caller.',
    details: `Impact: MEDIUM. A keeper or routing condition can cause the contract to accept materially worse execution than the quoted amount.\n\nRoot cause: the helper hardcodes minimum output to zero instead of carrying a caller-provided limit through the route.\n\nReproduction: submit a rebalance while the pool price moves and compare the received amount with the quote; the transaction remains valid despite severe slippage.\n\nRecommended fix: require minAmountOut and deadline parameters, validate them before the external swap, and emit the executed quote.\n\nValidation checklist: test zero, tight, expired, and manipulated-price slippage bounds.`
  },
  'R-007': {
    title: 'Insufficient nonce separation in signed payout requests', severity: 'MEDIUM',
    priceCusd: '0.50', summary: 'Payout signatures use a shared nonce namespace across assets and recipients.',
    details: `Impact: MEDIUM. A signature intended for one payout context may be replayed in another context when nonce tracking is not separated.\n\nRoot cause: nonce state is keyed only by signer rather than signer, asset, recipient, and operation domain.\n\nReproduction: reuse a valid signature against a second payout path sharing the signer nonce.\n\nRecommended fix: use EIP-712 typed data with explicit operation type and domain, and consume nonces atomically.\n\nValidation checklist: replay across assets, recipients, functions, chains, and contract deployments.`
  },
  'R-008': {
    title: 'Dust accumulation in fee refund calculation', severity: 'LOW',
    priceCusd: '0.10', summary: 'Integer truncation leaves small unaccounted fee dust on repeated refunds.',
    details: `Impact: LOW. Repeated small refunds can accumulate residual token units that are not transparently assigned.\n\nRoot cause: division truncates each refund independently without a remainder accumulator.\n\nReproduction: execute many non-divisible refund amounts and compare charged, refunded, and retained units.\n\nRecommended fix: document rounding, retain remainders per account, and expose reconciliation events.\n\nValidation checklist: test one-unit, non-divisible, maximum, and repeated refunds.`
  },
  'R-009': {
    title: 'Missing zero-address validation in reward configuration', severity: 'LOW',
    priceCusd: '0.10', summary: 'An administrator can configure a zero token or recipient address.',
    details: `Impact: LOW. Misconfiguration can permanently route rewards to an unusable address or break future claims.\n\nRoot cause: setter accepts address(0) without validation.\n\nReproduction: call the configuration setter with the zero address and observe successful state update.\n\nRecommended fix: reject zero addresses and emit a configuration-change event with old and new values.\n\nValidation checklist: cover every address setter and upgrade initialization path.`
  },
  'R-010': {
    title: 'Event omits effective recipient in fee settlement', severity: 'LOW',
    priceCusd: '0.10', summary: 'Settlement events do not expose the final recipient used by downstream indexers.',
    details: `Impact: LOW. Monitoring and accounting systems may attribute payments to the caller rather than the effective recipient.\n\nRoot cause: event schema emits caller and amount but omits the resolved recipient.\n\nReproduction: settle on behalf of another recipient and compare event fields with the actual token transfer.\n\nRecommended fix: add the resolved recipient as an indexed event field and update consumers.\n\nValidation checklist: test direct, delegated, and fee-on-behalf settlements.`
  },
  'R-011': {
    title: 'Critical upgrade authorization gap in proxy admin handoff', severity: 'CRITICAL',
    priceCusd: '1.00', summary: 'The upgrade handoff can leave a transient state where both old and new administrators can authorize upgrades.',
    details: `Impact: CRITICAL. An obsolete administrator may upgrade the implementation during the handoff window and drain or permanently alter managed assets.\n\nRoot cause: ownership and upgrade authorization are updated in separate transactions without a two-step pending-admin acceptance.\n\nProof of concept: initiate handoff, use the old administrator before acceptance, and install an implementation not approved by the new administrator.\n\nRecommended fix: use a two-step Ownable2Step-style handoff, timelock upgrades, and emit complete admin transition events.\n\nValidation checklist: test reject-before-accept, cancel, expiry, replay, and implementation authorization.`
  },
  'R-012': {
    title: 'Callback reentrancy in token recovery function', severity: 'MEDIUM',
    priceCusd: '0.50', summary: 'A recovery function performs an external token callback before updating its internal accounting.',
    details: `Impact: MEDIUM. A malicious token or recipient callback may call the recovery function again and withdraw more than the recorded balance.\n\nRoot cause: state is updated after an external call and no reentrancy guard protects the path.\n\nReproduction: use a callback-capable token that reenters during transfer and observe duplicate recovery attempts.\n\nRecommended fix: apply checks-effects-interactions, update accounting before transfer, and add a reentrancy guard where appropriate.\n\nValidation checklist: test ERC-777-style callbacks, malicious ERC-20s, revert paths, and partial recovery.`
  },
};

// unlocked[reportId][payer] = { txHash, tagged, at }
const unlocked = {};

// Format a full report as a standalone Markdown document (paid deliverable).
export function formatReportMarkdown(id, report) {
  return [
    `# [${report.severity}] ${report.title}`,
    '',
    `**Report ID:** ${id}  `,
    `**Severity:** ${report.severity}  `,
    `**Agent:** CeloSentry (ERC-8004 #9798, Celo mainnet)  `,
    `**Attribution tag:** ${ATTRIBUTION_TAG}  `,
    `**License:** CC BY 4.0 - share with attribution to CeloSentry`,
    '',
    '## Summary',
    '',
    report.summary,
    '',
    '## Impact',
    '',
    (report.details.split('\n\n').find(p => p.startsWith('Impact:')) || '').replace(/^Impact:\s*/, ''),
    '',
    '## Root cause',
    '',
    (report.details.split('\n\n').find(p => p.startsWith('Root cause:')) || '').replace(/^Root cause:\s*/, ''),
    '',
    '## Proof of concept',
    '',
    (report.details.split('\n\n').find(p => /^(Proof of concept|Reproduction):/.test(p)) || '').replace(/^(Proof of concept|Reproduction):\s*/, ''),
    '',
    '## Recommended fix',
    '',
    (report.details.split('\n\n').find(p => p.startsWith('Recommended fix:')) || '').replace(/^Recommended fix:\s*/, ''),
    '',
    '## Validation checklist',
    '',
    (report.details.split('\n\n').find(p => p.startsWith('Validation checklist:')) || '').replace(/^Validation checklist:\s*/, ''),
    '',
    '---',
    '',
    `Purchased via x402 settlement on Celo mainnet. Every settlement carries the ERC-8021 attribution tag \`${ATTRIBUTION_TAG}\`.`,
    '',
  ].join('\n');
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj, null, 2));
}

export function x402Requirements(reportId) {
  return [
    {
      scheme: 'exact',
      network: 'celo',
      maxAmountRequired: priceWeiForReport(reportId),
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
  const md = url.pathname.match(/^\/download\/(R-\d+)\.md$/);
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

  // Download unlocked report as Markdown
  if (md && req.method === 'GET') {
    const id = md[1];
    const report = REPORTS[id];
    if (!report) return json(res, 404, { error: 'unknown report' });
    const payer = (url.searchParams.get('from') || '').toLowerCase();
    const un = unlocked[id] || {};
    if (payer && Object.keys(un).length === 0) {
      const prior = loadLedger().settlements.find(s => s.from?.toLowerCase() === payer);
      if (prior) un[payer] = { txHash: prior.txHash, tagged: prior.tagged, at: prior.recordedAt };
    }
    if (Object.keys(un).length === 0) {
      return json(res, 402, { error: 'X-402: payment required', accepts: x402Requirements(id) });
    }
    const mdContent = formatReportMarkdown(id, report);
    res.writeHead(200, {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `attachment; filename="${id}-${report.severity.toLowerCase()}-celosentry.md"`,
    });
    return res.end(mdContent);
  }

  if (url.pathname === '/settle' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const { txHash, from, reportId } = JSON.parse(body);
        if (!txHash || !from || !reportId) {
          return json(res, 400, { error: 'txHash, from, reportId required' });
        }
        const report = REPORTS[reportId];
        if (!report) return json(res, 404, { error: 'unknown report' });
        const amount = priceWeiForReport(reportId);
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
