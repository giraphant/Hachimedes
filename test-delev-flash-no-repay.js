const { Connection, PublicKey, Keypair } = require('@solana/web3.js');
const { buildDeleverageSwapFlashloanTransaction } = require('./lib/deleverage-swap-flashloan.ts');

// 从环境变量或使用默认值
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://leonore-805z4o-fast-mainnet.helius-rpc.com';

// Vault 和 Position 信息
const VAULT_ID = 34;
const POSITION_ID = 335;

// 用户公钥（仅用于构建交易，不会执行）
const USER_PUBLIC_KEY = new PublicKey('CgA6JdKh4wV6LARdFTWqQ6wStaLfT5GCM4GpQSKP86pU');

// Token 地址
const JLP_MINT = new PublicKey('27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4');
const USDS_MINT = new PublicKey('USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA');

async function testFlashLoanNoBuild() {
  console.log('=== Testing Flash Loan Deleverage + Swap (No Repay) ===\n');

  const connection = new Connection(RPC_URL, 'confirmed');

  try {
    console.log('Building transaction without Repay operation...\n');

    const result = await buildDeleverageSwapFlashloanTransaction({
      withdrawMint: JLP_MINT,
      withdrawAmount: 0.1, // 0.1 JLP
      repayMint: USDS_MINT,
      userPublicKey: USER_PUBLIC_KEY,
      vaultId: VAULT_ID,
      positionId: POSITION_ID,
      connection,
      slippageBps: 50,
    });

    console.log('\n=== Transaction Built Successfully ===');
    console.log('Position ID:', result.positionId);
    console.log('\nSwap Quote:');
    console.log('  Input:', result.swapQuote.inputAmount);
    console.log('  Output:', result.swapQuote.outputAmount);
    console.log('  Price Impact:', result.swapQuote.priceImpactPct);

    // 检查交易大小
    const serialized = result.transaction.serialize();
    console.log('\n=== Transaction Size ===');
    console.log('Size:', serialized.length, 'bytes');
    console.log('Limit: 1232 bytes');
    console.log('Status:', serialized.length <= 1232 ? '✅ UNDER LIMIT!' : `❌ OVER by ${serialized.length - 1232} bytes`);

  } catch (error) {
    console.error('Error:', error.message);
    if (error.logs) {
      console.error('Transaction logs:', error.logs);
    }
  }
}

testFlashLoanNoBuild();
