# Security Policy

## Supported versions

Only the latest `main` branch is supported.

## Reporting a vulnerability

CeloSentry handles on-chain settlement verification and sells security reports; bugs here can affect real payments.

Found a vulnerability in CeloSentry itself (the paywall bypass, settlement verification, unlock state, web UI, or key handling)?

1. Do **not** open a public GitHub issue
2. Contact the maintainer via the email on the GitHub profile or Telegram `@carlysipahutar`
3. Include: affected endpoint/file, reproduction steps, and impact assessment

You will receive a response within 72 hours. Valid reports may be rewarded via the same x402 flow CeloSentry itself uses (cUSD on Celo mainnet).

## Scope

In scope:

- `src/server.js` (x402 paywall, unlock state, download endpoint)
- `src/ledger.js` (settlement verification)
- `src/public/index.html` (wallet purchase flow)
- Deployment configuration in this repo

Out of scope:

- The demo security reports' content (R-001/R-002 are sample findings)
- Third-party contracts referenced in reports
- Social engineering, DoS requiring sustained resources
