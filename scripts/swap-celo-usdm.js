// Swap CELO -> USDm via Uniswap V3 SwapRouter02, tagged with attribution.
// NOTE: SwapRouter02's exactInputSingle has NO deadline field (7 params).
// WETH9 on Celo = CeloToken (0x471E...) and is payable with msg.value.
// Usage: node scripts/swap-celo-usdm.js <amountCELO> [pkfile]
import fs from 'node:fs';
import { createWalletClient, createPublicClient, http, parseAbi, encodeFunctionData } from 'viem';
import { celo } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';
import { taggedData } from '../src/config.js';

const ROUTER = '0x5615CDAb10dc425a742d643d949a7F474C01abc4'; // SwapRouter02
const USDm = '0x765DE816845861e75A25fCA122bb6898B8B1282a';
const WETH = '0x471EcE3750Da237f93B8E339c536989b8978a438'; // CeloToken = WETH9 on Celo

const AMOUNT = process.argv[2] || '0.5';
const PK_FILE = process.argv[3] || '/root/burner.env';
const amountWei = BigInt(Math.floor(parseFloat(AMOUNT) * 1e18));

const pk = fs.readFileSync(PK_FILE, 'utf8').trim();
const account = privateKeyToAccount(pk);
const walletClient = createWalletClient({ account, chain: celo, transport: http('https://forno.celo.org') });
const publicClient = createPublicClient({ chain: celo, transport: http('https://forno.celo.org') });

// SwapRouter02: exactInputSingle WITHOUT deadline
const params = {
  tokenIn: WETH,
  tokenOut: USDm,
  fee: 3000,
  recipient: account.address,
  amountIn: amountWei,
  amountOutMinimum: 0n,
  sqrtPriceLimitX96: 0n,
};

const ABI = parseAbi([
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)',
]);

const data = encodeFunctionData({ abi: ABI, functionName: 'exactInputSingle', args: [params] });
// append attribution tag suffix (ERC-8021)
const fullData = data + taggedData().replace(/^0x/, '');
console.log('full data len:', fullData.length);

const hash = await walletClient.sendTransaction({
  to: ROUTER,
  value: amountWei,
  data: fullData,
  gas: 500000n,
});
console.log('swap tx:', hash);
const rc = await publicClient.waitForTransactionReceipt({ hash });
console.log('status:', rc.status);

// USDm balance after
const ERC20 = parseAbi(['function balanceOf(address) view returns (uint256)']);
const bal = await publicClient.readContract({ address: USDm, abi: ERC20, functionName: 'balanceOf', args: [account.address] });
console.log('USDm balance:', (Number(bal) / 1e18).toFixed(6));
