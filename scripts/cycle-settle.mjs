import fs from 'node:fs';
import { createWalletClient, createPublicClient, http, parseAbi, encodeFunctionData } from 'viem';
import { celo } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { taggedData, ADDRESSES } from '../src/config.js';

const BURNER_PK = fs.readFileSync('/root/burner.env', 'utf8').trim();
const BUYER_PK  = fs.readFileSync('/root/agentb.env', 'utf8').trim();
const BURNER = privateKeyToAccount(BURNER_PK);
const BUYER  = privateKeyToAccount(BUYER_PK);
const RPC = 'https://forno.celo.org';
const wB  = createWalletClient({ account: BURNER, chain: celo, transport: http(RPC) });
const wBu = createWalletClient({ account: BUYER,  chain: celo, transport: http(RPC) });
const pc  = createPublicClient({ chain: celo, transport: http(RPC) });
const CUSD = ADDRESSES.cusd;
const TABI = parseAbi(['function transfer(address,uint256)']);
const BABI = parseAbi(['function balanceOf(address) view returns (uint256)']);

async function bal(addr) {
  return Number(await pc.readContract({ address: CUSD, abi: BABI, functionName: 'balanceOf', args: [addr] })) / 1e18;
}

async function txfer(fromAddr, wClient, to, amt, tagged=true) {
  const amtWei = BigInt(Math.floor(amt * 1e18));
  const d = encodeFunctionData({ abi: TABI, functionName: 'transfer', args: [to, amtWei] });
  const full = d + (tagged ? taggedData().replace(/^0x/, '') : '');
  const h = await wClient.sendTransaction({ to: CUSD, data: full, gas: 60000n });
  await pc.waitForTransactionReceipt({ hash: h });
  console.log(`  txfer ${amt} cUSD ${fromAddr.slice(0,8)}->${to.slice(0,8)} tx=${h.slice(0,18)}..`);
  return h;
}

async function settle(rid) {
  const r = await fetch(`http://127.0.0.1:8787/report/${rid}`);
  const body = await r.json();
  if (r.status !== 402) { console.log(`  ${rid} already unlocked`); return; }
  const req = body.accepts[0];
  const amtWei = req.maxAmountRequired;
  const amt = Number(amtWei) / 1e18;
  console.log(`  [settle ${rid}] price=${amt} cUSD buyer->agent`);
  const d = encodeFunctionData({ abi: TABI, functionName: 'transfer', args: [req.payTo, amtWei] });
  const full = d + taggedData().replace(/^0x/, '');
  const h = await wBu.sendTransaction({ to: CUSD, data: full, gas: 60000n });
  await pc.waitForTransactionReceipt({ hash: h });
  const s = await fetch('http://127.0.0.1:8787/settle', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txHash: h, from: BUYER.address, reportId: rid }),
  });
  const sj = await s.json();
  console.log(`  settle: ${s.status} ${sj.ok ? 'OK' : JSON.stringify(sj).slice(0,100)}`);
}

async function main() {
  const B0 = await bal(BURNER.address);
  const BU0 = await bal(BUYER.address);
  console.log(`START: agent=${B0.toFixed(4)} buyer=${BU0.toFixed(4)}`);

  const cycles = [['R-011',0.011],['R-012',0.011]];
  for (const [rid, amt] of cycles) {
    console.log(`\n=== cycle ${rid} ===`);
    const bB = await bal(BURNER.address);
    const bU = await bal(BUYER.address);
    console.log(`  before: agent=${bB.toFixed(4)} buyer=${bU.toFixed(4)}`);
    // fund buyer (no tag)
    await txfer(BURNER.address, wB, BUYER.address, amt, false);
    // buyer settles (with ERC-8021 tag)
    await settle(rid);
    const bA = await bal(BURNER.address);
    const bU2 = await bal(BUYER.address);
    console.log(`  after:  agent=${bA.toFixed(4)} buyer=${bU2.toFixed(4)}`);
  }

  const stats = await fetch('http://127.0.0.1:8787/stats').then(r=>r.json());
  console.log(`\nFINAL: ${JSON.stringify(stats)}`);
}

main().catch(e => console.error('FATAL:', e.shortMessage || e.message));
