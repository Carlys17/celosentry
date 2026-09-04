#!/usr/bin/env python3
"""Sync CeloSentry ledger.json with every ERC-8021 tagged cUSD settlement on-chain.

Reads all cUSD Transfer events INTO the agent wallet via Alchemy, checks each
tx input for the ERC-8021 attribution tag, and writes them into the deployed
ledger.json (idempotent, keyed by txHash).
"""
import json
import urllib.request

ALCHEMY_KEY = open("/root/alchemy.env").read().strip().split("=")[-1].strip()
URL = f"https://celo-mainnet.g.alchemy.com/v2/{ALCHEMY_KEY}"

AGENT = "0xBae72FdEF2fC7F66Ef626c5c18e09BC11d78D977"
CUSD = "0x765DE816845861e75A25fCA122bb6898B8B1282a"
TAG = "celo_77350de0a56b"
TAG_HEX = TAG.encode().hex()
LEDGER = "/root/celosentry-deploy/ledger.json"


def rpc(method, params=None):
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method,
                          "params": params or []}).encode()
    req = urllib.request.Request(URL, data=payload,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = json.loads(r.read())
    if "error" in body:
        raise RuntimeError(body["error"])
    return body["result"]


def main():
    try:
        ledger = json.load(open(LEDGER))
    except FileNotFoundError:
        ledger = {"settlements": [], "findings": []}
    known = {s["txHash"] for s in ledger["settlements"]}

    transfers = rpc("alchemy_getAssetTransfers", [{
        "toAddress": AGENT,
        "contractAddresses": [CUSD],
        "category": ["erc20"],
        "withMetadata": True,
        "maxCount": "0x64",
    }])["transfers"]

    added = 0
    for t in transfers:
        txh = t["hash"]
        if txh in known:
            continue
        tx = rpc("eth_getTransactionByHash", [txh])
        rc = rpc("eth_getTransactionReceipt", [txh])
        if not rc or rc["status"] != "0x1":
            continue
        tagged = TAG_HEX in (tx["input"] or "").lower()
        wei = int(float(t["value"]) * 1e18)
        ledger["settlements"].append({
            "txHash": txh,
            "from": t["from"],
            "amountCusdWei": str(wei),
            "amountCusd": f"{float(t['value']):.4f}",
            "tagged": tagged,
            "blockNumber": str(int(rc["blockNumber"], 16)),
            "recordedAt": t.get("metadata", {}).get("blockTimestamp", ""),
        })
        known.add(txh)
        added += 1
        print(f"  + {txh[:20]}.. {t['value']} cUSD from {t['from'][:12]}.. tagged={tagged}")

    ledger["settlements"].sort(key=lambda s: int(s["blockNumber"]))
    json.dump(ledger, open(LEDGER, "w"), indent=2)

    total = sum(float(s["amountCusd"]) for s in ledger["settlements"])
    tagged_n = sum(1 for s in ledger["settlements"] if s["tagged"])
    buyers = {s["from"].lower() for s in ledger["settlements"]}
    print(f"\nadded {added} new settlement(s)")
    print(f"ledger: {len(ledger['settlements'])} settlements, "
          f"{total:.4f} cUSD, {tagged_n} tagged, {len(buyers)} unique buyers")


if __name__ == "__main__":
    main()
