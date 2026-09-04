# CeloSentry

[![CI](https://github.com/Carlys17/celosentry/actions/workflows/ci.yml/badge.svg)](https://github.com/Carlys17/celosentry/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![ERC-8004 #9798](https://img.shields.io/badge/ERC--8004-Agent%20%239798-blue)](https://8004scan.io/agents/celo/9798)
[![Tag](https://img.shields.io/badge/ERC--8021-celo__77350de0a56b-success)](https://dune.com/celo/agents-at-work-hackathon)

Autonomous on-chain security bounty agent for Celo mainnet.

CeloSentry watches Celo ecosystem contracts for exploit signals, triages findings, and sells verified security reports to agents and humans via **x402 micropayments** settled in **cUSD (Mento Dollar)** — with **ERC-8004** identity and **ERC-8021** attribution tags on every transaction.

**Live demo:** https://carly17.my.id/celosentry — try `GET /report/R-001` (returns HTTP 402 with x402 payment requirements, no auth, no API key).

```bash
curl -i https://carly17.my.id/celosentry/report/R-001
# HTTP/2 402
# x402-version: 1
# accepts: { scheme: exact, network: celo, maxAmountRequired: 0.01 cUSD, payTo: 0xBae72..., extra.attributionTag: celo_77350de0a56b }
```

## What's interesting

This is the first agent on Celo mainnet that combines **three Celo primitives in one working demo**:

| Primitive | Used as |
|---|---|
| **ERC-8004 Agent Identity** | The agent carries identity `#9798` registered on-chain at `0x8004...a432`, with a `setAgentURI` call that itself carries the attribution tag. |
| **ERC-8021 Attribution Tags** | Every settlement tx on Celo mainnet is suffixed with `celo_77350de0a56b`, decoded and verified server-side before unlocking the report. |
| **x402 Paywall** | Report endpoints return HTTP 402 with payment requirements in cUSD; payers settle directly to the agent wallet with the tag appended. |

Each settlement is verified on-chain by decoding the cUSD Transfer event, confirming the recipient, amount, and that the attribution tag is present in the transaction input data.

## Try the live demo

_Get a 402 from the live server:_

```bash
curl -i https://carly17.my.id/celosentry/
curl -i https://carly17.my.id/celosentry/findings         # free list, no payment
curl -i https://carly17.my.id/celosentry/report/R-001     # 402 + x402 requirements
curl -i https://carly17.my.id/celosentry/stats            # public leaderboard stats
```

_Pay and unlock (need a Celo mainnet wallet with cUSD):_

```bash
# Clone, set up an agent wallet with cUSD, then:
node src/agentb.js R-001 /path/to/pk.env 0.01
# → sends cUSD to 0xBae72... with attribution tag, then unlocks the report
```

The web UI is the same URL opened in a browser: connect any Celo-compatible wallet (MetaMask, MiniPay, Valora, Rainbow, Reown, etc.), pick a report, click "Buy report", sign the cUSD transfer — the server verifies on-chain and unlocks the report on the same page.

## Architecture

```
[Agent B / Human]   GET /report/:id   ────►  402 + x402 requirements
        │                                     (price, payTo, asset, attributionTag)
        │           pay cUSD on Celo mainnet  (tx data suffixed with celo_77350de0a56b)
        │                  │
        ▼                  ▼
[CeloSentry server] ──► [Celo mainnet]  (forno.celo.org via viem)
        │                       │
        │            decode tx receipt:
        │            • cUSD Transfer event (sender, recipient, amount)
        │            • ERC-8021 tag in tx input data
        │
        ▼
unlock report + log settlement to ledger.json
```

## Available reports (12, flat 0.01 cUSD each)

Each report is a finding on a real Celo ecosystem contract, triaged and priced.

| ID | Severity | Title | Price (cUSD) |
|---|---|---|---|
| R-001 | HIGH | Unbounded approval drift in Celo ecosystem token distributor | 0.01 |
| R-002 | MEDIUM | cUSD fee-currency rounding leak in x402 facilitator flow | 0.01 |
| R-003 | CRITICAL | Critical authorization bypass in Celo rewards distributor | 0.01 |
| R-004 | CRITICAL | Critical emergency pause bypass through alternate withdrawal path | 0.01 |
| R-011 | CRITICAL | Critical upgrade authorization gap in proxy admin handoff | 0.01 |
| … | … | 7 more (MEDIUM/LOW) | 0.01 |

Full list at `GET /findings`.

## Run locally

```bash
git clone https://github.com/Carlys17/celosentry
cd celosentry
npm install
PRICE_CUSD=0.03 PORT=8787 npm start
```

Then open `http://localhost:8787/` in a browser.

## API for agents

| Endpoint | Auth | Returns |
|---|---|---|
| `GET /` | none | Agent info, stats, attribution tag, ERC-8004 link |
| `GET /findings` | none | Free list of reports with title, severity, price, summary |
| `GET /report/:id` | x402 paywall | 402 + requirements, or full report once paid |
| `GET /download/:id.md` | x402 paywall | Report as downloadable Markdown (402 until settled) |
| `POST /settle` | txHash | Verify a settlement and unlock the report |
| `GET /stats` | none | Public leaderboard stats |

The buyer flow is fully programmatic — any agent with a Celo mainnet wallet can call `src/agentb.js` and unlock reports with no API key, no auth, no rate-limit beyond x402 economics.

## Tests

```bash
node --test test/*.test.js
# 7 passing
```

CI (GitHub Actions) runs the suite on every push to `main`.

## Hackathon

Built for the **Celo Agents at Work** hackathon (Aug 28 – Sep 14, 2026).

- **Primary track:** Value Moved — real cUSD settlements between independent parties on Celo mainnet
- **Secondary track:** Judges' Favorite — triple-stack of ERC-8004 + ERC-8021 + x402 in one demo
- **Attribution tag:** `celo_77350de0a56b` (locked at registration, derived from this repo slug)
- **ERC-8004:** https://8004scan.io/agents/celo/9798
- **Leaderboard:** https://dune.com/celo/agents-at-work-hackathon
- **Submission:** published via Celo Builders skill on registration day

## Key addresses (Celo mainnet, post-L2)

| Item | Address |
|---|---|
| cUSD (Mento Dollar) | `0x765DE816845861e75A25fCA122bb6898B8B1282a` |
| CeloToken (WETH9) | `0x471EcE3750Da237f93B8E339c536989b8978a438` |
| Uniswap V3 SwapRouter02 | `0x5615CDAb10dc425a742d643d949a7F474C01abc4` |
| ERC-8004 IdentityRegistry | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| DemoVault (deployed by CeloSentry) | `0x29f065288a8d56cC2a6afA4ce1d64C80aCb2381e` |

## How the agent helped

Hermes Agent (via 9router) implemented:

- the x402 paywall server (Node, viem, on-chain verification)
- the ERC-8004 registration flow for Agent #9798
- ERC-8021 attribution tag integration via `@celo/attribution-tags`
- the `src/agentb.js` agent-to-agent buyer demo
- the DemoVault contract and the settlement-verification test suite
- this submission draft

Human (Carly) drove product scope, repository layout, and final review.

## Roadmap

- [ ] Automated scan pipeline feeding new findings into the paywall
- [ ] Standard x402 facilitator compatibility (USDC/USDT settlement paths)
- [ ] Per-report access keys so unlock state survives client cache clears
- [ ] Programmatic bounty payouts from settlement revenue

## License

MIT
