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
import { verifySettlement, recordSettlement, recordFinding, stats, loadLedger } from './ledger.js';
import { ATTRIBUTION_TAG, ADDRESSES } from './config.js';

const PORT = process.env.PORT || 8787;
const PRICE_CUSD = process.env.PRICE_CUSD || '0.5';
const PRICE_WEI = BigInt(Math.floor(parseFloat(PRICE_CUSD) * 1e18)).toString();

// Demo security reports (would come from the triage pipeline)
export const REPORTS = {
  'R-001': {
    title: 'Unbounded approval drift in Celo ecosystem token distributor',
    severity: 'HIGH',
    summary: 'Distributor contract allows infinite approvals to drift after role rotation. Full PoC and fix in the paid report.',
  },
  'R-002': {
    title: 'cUSD fee-currency rounding leak in x402 facilitator flow',
    severity: 'MEDIUM',
    summary: 'Rounding direction leaks dust to the caller on partial settlements. Full math and repro in the paid report.',
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
      resource: `https://celosentry.example/report/${reportId}`,
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
    return json(res, 200, {
      agent: 'CeloSentry',
      erc8004: 'https://8004scan.io/agents/celo/9798',
      attributionTag: ATTRIBUTION_TAG,
      description: 'Security bounty agent - findings for cUSD via x402',
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
