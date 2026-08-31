# CeloSentry

Autonomous on-chain security bounty agent for Celo mainnet.

CeloSentry watches Celo ecosystem contracts for exploit signals, triages findings, and sells verified security reports to agents and humans via **x402 micropayments** settled in cUSD (Mento Dollar) — with ERC-8004 identity and ERC-8021 attribution tags on every transaction.

## What it does

- **x402 paywall** — report endpoints return HTTP 402 with payment requirements; payers settle cUSD directly to the agent wallet
- **On-chain verification** — every settlement is checked against Celo mainnet (transfer event + ERC-8021 tag in tx input)
- **ERC-8021 attribution** — `celo_77350de0a56b` appended to every transaction via `toDataSuffix`
- **ERC-8004 identity** — Agent #9798 on Celo mainnet ([8004scan](https://8004scan.io/agents/celo/9798))

## Architecture

```
[Agent B / Human]          GET /report/:id -> 402 + requirements
        |                  pay cUSD (tagged tx) -> POST /settle -> report unlocked
        v
[CeloSentry x402 server]   src/server.js  (HTTP 402 paywall)
        |
[Celo mainnet]             forno.celo.org  (viem)
        |                  verify: cUSD Transfer event + ERC-8021 tag decode
[Ledger]                   ledger.json (settlements, findings, stats)
```

## Run

```bash
npm install
PRICE_CUSD=0.03 PORT=8787 npm start
```

**Web UI**: open the same URL in a browser to use the wallet-based interface. Click "Connect Wallet" (any EVM wallet works on Celo mainnet), pick a report, click "Buy report" — your wallet sends 0.03 cUSD (Mento Dollar) to the agent with the ERC-8021 attribution tag, and the report unlocks on the same page.

**API for agents**:
- `GET /` — agent info + stats
- `GET /findings` — free report summaries
- `GET /report/R-001` — 402 + x402 requirements, or full report once paid
- `POST /settle` — `{ txHash, from, amount, reportId }` verify + unlock
- `GET /stats` — leaderboard stats

## Agent B (buyer demo)

```bash
node src/agentb.js R-001 /path/to/pk.env 0.03
```

Pays cUSD directly to the CeloSentry wallet with the attribution tag, then unlocks the report.

## Hackathon

Built for the Celo **Agents at Work** hackathon (Aug 28 – Sep 14, 2026).

- Primary track: **Value Moved** — real cUSD settlements between independent parties on Celo mainnet
- Attribution tag: `celo_77350de0a56b`
- ERC-8004: https://8004scan.io/agents/celo/9798

## Key addresses (Celo mainnet, post-L2)

| Item | Address |
|------|---------|
| cUSD (Mento Dollar) | `0x765DE816845861e75A25fCA122bb6898B8B1282a` |
| CeloToken (WETH9) | `0x471EcE3750Da237f93B8E339c536989b8978a438` |
| Uniswap V3 SwapRouter02 | `0x5615CDAb10dc425a742d643d949a7F474C01abc4` |
| ERC-8004 IdentityRegistry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |

## How the agent helped

Hermes Agent (9router) implemented the x402 server, on-chain verification, ERC-8004 registration, and this submission draft.

## License

MIT
