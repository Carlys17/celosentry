// CeloSentry ledger - x402 payment verification + bounty ledger.
// Persists settlements to ledger.json so restarts keep history.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http } from 'viem';
import { celo } from 'viem/chains';
import { hasOurTag, ADDRESSES, ATTRIBUTION_TAG, RPC_URL } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEDGER_PATH = path.join(__dirname, '..', 'ledger.json');

export function loadLedger() {
  try {
    return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  } catch {
    return { settlements: [], findings: [] };
  }
}

function saveLedger(l) {
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(l, null, 2));
}

export const publicClient = createPublicClient({ chain: celo, transport: http(RPC_URL) });

// Verify an x402 payment settlement on-chain.
// { txHash, from, amount } (amount in cUSD wei as string)
export async function verifySettlement({ txHash, from, amount }) {
  const receipt = await publicClient.getTransactionReceipt({ hash: txHash });
  if (!receipt || receipt.status !== 'success') {
    return { ok: false, reason: 'tx not found or failed' };
  }

  // Transfer(address,address,uint256)
  const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
  const fromTopic = '0x' + '0'.repeat(24) + from.toLowerCase().replace(/^0x/, '');
  const transfers = receipt.logs.filter(
    (l) => l.address.toLowerCase() === ADDRESSES.cusd.toLowerCase() &&
      l.topics[0] === transferTopic &&
      l.topics[1] === fromTopic
  );
  if (transfers.length === 0) {
    return { ok: false, reason: `no cUSD transfer from ${from} in tx` };
  }
  const total = transfers.reduce((s, l) => s + BigInt(l.data), 0n);
  if (total < BigInt(amount)) {
    return { ok: false, reason: `transferred ${total} < required ${amount}` };
  }

  // Full tx input: check attribution tag
  const tx = await publicClient.getTransaction({ hash: txHash });
  const tagged = hasOurTag(tx.input);

  return {
    ok: true,
    tagged,
    attributionTag: ATTRIBUTION_TAG,
    txHash,
    from,
    amountCusdWei: total.toString(),
    blockNumber: receipt.blockNumber.toString(),
  };
}

// Record a verified settlement (idempotent).
export function recordSettlement(v) {
  const l = loadLedger();
  if (l.settlements.some((s) => s.txHash === v.txHash)) {
    return { recorded: false, reason: 'already recorded' };
  }
  l.settlements.push({
    txHash: v.txHash,
    from: v.from,
    amountCusdWei: v.amountCusdWei,
    amountCusd: (Number(v.amountCusdWei) / 1e18).toFixed(4),
    tagged: v.tagged,
    blockNumber: v.blockNumber,
    recordedAt: new Date().toISOString(),
  });
  saveLedger(l);
  return { recorded: true, count: l.settlements.length };
}

// Record a security finding (free submission, paid unlocking).
export function recordFinding(finding) {
  const l = loadLedger();
  const id = 'F-' + Date.now().toString(36);
  l.findings.push({ id, ...finding, recordedAt: new Date().toISOString() });
  saveLedger(l);
  return { id };
}

export function stats() {
  const l = loadLedger();
  const totalWei = l.settlements.reduce((s, x) => s + BigInt(x.amountCusdWei), 0n);
  return {
    settlements: l.settlements.length,
    totalCusd: (Number(totalWei) / 1e18).toFixed(4),
    findings: l.findings.length,
    attributionTag: ATTRIBUTION_TAG,
  };
}
