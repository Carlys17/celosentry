// Agent B - a second autonomous agent buying a CeloSentry report.
// Pays cUSD directly to CeloSentry's wallet with the ERC-8021 attribution
// tag in the tx input (x402-style settlement, no facilitator middleman).
//
// Usage: node src/agentb.js <REPORT_ID> [PK_FILE] [AMOUNT_CUSD]
import fs from 'node:fs';
import { createPublicClient, createWalletClient, http } from 'viem';
import { celo } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { taggedData, ADDRESSES, RPC_URL, ATTRIBUTION_TAG } from './config.js';

const REPORT_ID = process.argv[2] || 'R-001';
const PK_FILE = process.argv[3] || '/root/agentb.env';
const AMOUNT = process.argv[4] || '0.03';

const pk = fs.readFileSync(PK_FILE, 'utf8').trim();
const account = privateKeyToAccount(pk);
const walletClient = createWalletClient({ account, chain: celo, transport: http(RPC_URL) });
const publicClient = createPublicClient({ chain: celo, transport: http(RPC_URL) });

console.log(`[agentB] wallet: ${account.address}`);
console.log(`[agentB] buying report ${REPORT_ID} for ${AMOUNT} cUSD -> CeloSentry ${ADDRESSES.agentWallet}`);

// 1. fetch the 402 requirements from the server (plain HTTP GET)
const BASE = process.env.SENTRY_URL || 'http://localhost:8787';
const r = await fetch(`${BASE}/report/${REPORT_ID}`);
const body = await r.json();
console.log(`[agentB] GET /report/${REPORT_ID} -> ${r.status}`);
if (r.status !== 402) {
  console.log('[agentB] already unlocked or unexpected:', body);
  process.exit(0);
}
const req = body.accepts[0];
console.log(`[agentB] 402 requirements: pay ${Number(req.maxAmountRequired) / 1e18} cUSD to ${req.payTo} asset ${req.asset}`);

// 2. settle: ERC-20 transfer with the attribution tag as ERC-8021 data suffix
const amountWei = BigInt(Math.floor(parseFloat(AMOUNT) * 1e18)).toString();
// transfer(address,uint256) selector
const data =
  '0xa9059cbb' +
  req.payTo.toLowerCase().replace(/^0x/, '').padStart(64, '0') +
  BigInt(amountWei).toString(16).padStart(64, '0');
const fullData = data + taggedData().replace(/^0x/, '');

const hash = await walletClient.sendTransaction({
  to: req.asset, // cUSD token contract
  data: fullData,
});
console.log(`[agentB] settlement tx: ${hash}`);
await publicClient.waitForTransactionReceipt({ hash });
console.log('[agentB] confirmed on Celo mainnet');

// 3. unlock the report
const s = await fetch(`${BASE}/settle`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ txHash: hash, from: account.address, amount: amountWei, reportId: REPORT_ID }),
});
const sj = await s.json();
console.log(`[agentB] /settle -> ${s.status}`, sj);

// 4. fetch the full report
const full = await fetch(`${BASE}/report/${REPORT_ID}`);
const fj = await full.json();
console.log(`[agentB] report now: ${full.status}`);
console.log(JSON.stringify(fj, null, 2));
