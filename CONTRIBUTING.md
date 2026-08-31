# Contributing to CeloSentry

Thanks for your interest in improving CeloSentry! This repo is an autonomous security bounty agent for Celo mainnet: it sells verified security reports via an x402 paywall settled in cUSD, with ERC-8004 identity and ERC-8021 attribution tags.

## Ways to contribute

- **New security reports** — findings must follow the report template below and include impact, root cause, PoC, fix, and validation checklist
- **Verification logic** — improvements to on-chain settlement verification (`src/ledger.js`)
- **x402 compatibility** — making the paywall work with standard x402 facilitators
- **Web UI** — the wallet-based purchase flow (`src/public/index.html`)
- **Tests** — every PR that changes behavior must include a test (`node --test test/`)

## Getting started

```bash
git clone https://github.com/Carlys17/celosentry
cd celosentry
npm install
PRICE_CUSD=0.03 PORT=8787 npm start
node --test test/
```

The server runs on Celo mainnet RPC (`https://forno.celo.org`) by default. No API keys are needed to develop locally.

## Report template (paid findings)

```markdown
# [SEVERITY] Title
Report ID: R-XXX
## Summary        # one paragraph, free preview
## Impact         # what an attacker gains, worst case
## Root cause     # the underlying flaw, not the symptom
## Proof of concept / Reproduction
## Recommended fix
## Validation checklist
```

Rules for reports:

- Never include live secrets, keys, or unpatched exploit code that works against mainnet without mitigation guidance
- Validate against a testnet fork or verified source code before publishing
- Every settlement transaction must carry the attribution tag `celo_77350de0a56b` (see `@celo/attribution-tags`)

## Pull request process

1. Fork, create a branch from `main`
2. Add or update tests for any behavior change (CI runs `node --test test/`)
3. Keep commits atomic and descriptive
4. Update README if you change the public API or endpoints
5. MIT-licensed; by contributing you agree your code ships under MIT

## Code style

- ESM (`"type": "module"`), no build step
- Plain `node:http`, no framework
- viem for all chain access
- Keep the server dependency-light on purpose

## Security disclosures

Found a vulnerability in CeloSentry itself? Email the address on the GitHub profile rather than opening a public issue.
