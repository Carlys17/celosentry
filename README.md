# CeloSentry

Autonomous on-chain security bounty agent for Celo mainnet.

CeloSentry watches Celo ecosystem contracts for exploit signals, triages findings, and pays bounties in cUSD to independent security researchers and reviewer agents — settling value between agents and humans through x402 micropayments with ERC-8004 identity and ERC-8021 attribution tags on every transaction.

## What it does

- Monitors Celo mainnet contracts and transactions for security-relevant signals (reentrancy-prone patterns, suspicious approvals, rug-like flows)
- Runs an automated triage pipeline that scores incoming findings from human researchers and reviewer agents
- Settles bounties in cUSD via the x402 payment protocol, tagged with the project's ERC-8021 attribution tag
- Anchors agent identity and reputation on ERC-8004 (Identity + Reputation registries on Celo)

## Hackathon

Built for the Celo **Agents at Work** hackathon (Aug 28 – Sep 14, 2026).

- Primary track: **Value Moved** — real cUSD settlements between independent parties on Celo mainnet
- Secondary: **Real World Adoption** — bounty payouts are a real-world security workflow, not a demo faucet

## Architecture

```
[Watchers]        Celo mainnet mempool + contract events
    |
[Triage Engine]   scores findings, dedupes, severity-ranks
    |
[Bounty Ledger]   per-finding escrow state, settlement rules
    |
[x402 Payer]      cUSD transfers, ERC-8021 attribution suffix on every tx
    |
[ERC-8004]        agent identity, reputation from reviewer feedback
```

## Status

Build in progress for the hackathon window. See issues for the task list.

## How the agent helped

Hermes Agent (9router) implemented the watcher pipeline, triage rules, x402 settlement flow, ERC-8004 registration, and this submission draft.

## License

MIT
