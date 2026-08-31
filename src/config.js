// CeloSentry config - Celo mainnet constants
import { toDataSuffix, fromDataSuffix } from '@celo/attribution-tags';

export const ATTRIBUTION_TAG = process.env.CELO_ATTRIBUTION_TAG || 'celo_77350de0a56b';

// Celo L2 predeploy addresses (post-migration)
export const ADDRESSES = {
  // ERC-8004 Identity Registry (Celo mainnet)
  identityRegistry: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  // cUSD (Mento Dollar) post L2 migration
  cusd: '0x765DE816845861e75A25fCA122bb6898B8B1282a',
  // agent wallet (owner of ERC-8004 #9798)
  agentWallet: '0xBae72FdEF2fC7F66Ef626c5c18e09BC11d78D977',
};

export const RPC_URL = process.env.CELO_RPC || 'https://forno.celo.org';
export const CHAIN_ID = 42220;

// Build ERC-8021 calldata suffix carrying the assigned attribution tag.
// MUST be appended to every settlement transaction.
export function taggedData(extraData = '0x') {
  const suffix = toDataSuffix(ATTRIBUTION_TAG);
  if (!extraData || extraData === '0x') return suffix;
  return extraData + suffix.replace(/^0x/, '');
}

// Extract attribution codes from tx input.
export function decodeTags(txInput) {
  if (!txInput || txInput === '0x') return null;
  try {
    return fromDataSuffix(txInput);
  } catch {
    return null;
  }
}

export function hasOurTag(txInput) {
  const d = decodeTags(txInput);
  return !!d && Array.isArray(d.codes) && d.codes.includes(ATTRIBUTION_TAG);
}
