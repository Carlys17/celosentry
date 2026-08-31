# CeloSentry — Demo Script (60-90s) & Tweet 2

## Tweet 2 (post dari @carlysipahutar1, reply ke tweet 1)

```
Live demo is up 🔴

CeloSentry serves real security reports behind an x402 paywall on Celo mainnet:

curl -i https://carly17.my.id/celosentry/report/R-001
→ HTTP 402 + payment requirements in cUSD

Pay with any Celo wallet (tag celo_77350de0a56b attached), report unlocks after on-chain verification.

12 findings live: 4 CRITICAL, 1 HIGH. ERC-8004 #9798.

@CeloDevs @celo
```

Abis post, reply thread ke tweet 1 biar 1 thread utuh.

## Demo Video Script (60-90 detik, rekam layar + voiceover singkat)

| Detik | Aksi di layar | Voiceover / teks |
|---|---|---|
| 0-8 | Terminal: `curl -i https://carly17.my.id/celosentry/report/R-001` → HTTP 402 tampil | "This is CeloSentry — a security agent on Celo mainnet selling verified audit reports behind an x402 paywall." |
| 8-18 | Show JSON: payTo, asset cUSD, attributionTag | "Every report returns HTTP 402 with x402 payment requirements — price in cUSD, payTo the agent wallet, and the ERC-8021 attribution tag attached." |
| 18-35 | Browser: open https://carly17.my.id/celosentry, click Connect Wallet, pick report R-001 | "Open the web UI, connect any Celo wallet — MetaMask, MiniPay, Valora. Pick a report." |
| 35-50 | Click "Buy report" → wallet popup → confirm 0.40 cUSD tx | "Click buy. The wallet sends 0.40 cUSD directly to the agent — with the attribution tag celo_77350de0a56b appended to the transaction data." |
| 50-65 | Report unlocks on page; switch to Celoscan tab, show the tx with input data tag visible | "The server verifies the settlement on-chain — decodes the cUSD Transfer event and confirms the tag in the transaction input — then unlocks the report." |
| 65-75 | Show 8004scan.io/agents/celo/9798 | "The agent itself is registered on-chain as ERC-8004 agent number 9798." |
| 75-85 | Show GitHub repo | "Full source, MIT licensed, on GitHub. CeloSentry — agents that work, for real payments." |

**Tools rekam:** OBS / ascinema / terminalizer. Minimal: asciinema buat terminal part + OBS buat browser part, gabung di CapCut/Clipchamp.

## Checklist sebelum rekam
- [x] server live di https://carly17.my.id/celosentry (402 verified)
- [x] 12 findings verified dari /findings
- [x] README updated + pushed
- [ ] cek wallet demo ada cUSD >= 0.40 + CELO gas
- [ ] rekam + upload ke YouTube (bisa unlisted) → taruh link di README + tweet
