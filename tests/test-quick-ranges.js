/**
 * 快速测试：找出不需要 init 的整数金额
 * 只测试整数避免太慢
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { getOperateIx } = require('@jup-ag/lend/borrow');
const BN = require('bn.js');

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';
const VAULT_ID = 34;
const POSITION_ID = 335;
const TEST_WALLET = new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testQuickRanges() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  Quick Test: Integer Amounts Only');
  console.log('═══════════════════════════════════════════\n');

  const connection = new Connection(RPC_URL, 'confirmed');
  const results = [];

  // 只测试整数 1-20
  console.log('Testing integer amounts 1-20 USDS...\n');
  console.log('USDS | Init? | Status');
  console.log('-----|-------|-------');

  for (let usds = 1; usds <= 20; usds++) {
    const raw = usds * 1_000_000;

    try {
      const result = await getOperateIx({
        vaultId: VAULT_ID,
        positionId: POSITION_ID,
        colAmount: new BN(0),
        debtAmount: new BN(-raw),
        connection,
        signer: TEST_WALLET,
      });

      const needsInit = result.ixs.length > 1;
      const status = needsInit ? '❌' : '✅';

      results.push({ usds, needsInit });
      console.log(`${usds.toString().padStart(4)} | ${needsInit ? 'YES' : 'NO '.padStart(3)} | ${status}`);

      await sleep(400);
    } catch (error) {
      console.log(`${usds.toString().padStart(4)} | ERROR | ⚠️`);
      await sleep(600);
    }
  }

  // 分析结果
  console.log('\n═══════════════════════════════════════════');
  console.log('  Safe Amounts (No Init)');
  console.log('═══════════════════════════════════════════\n');

  const safeAmounts = results.filter(r => !r.needsInit).map(r => r.usds);

  if (safeAmounts.length > 0) {
    console.log('Safe amounts:', safeAmounts.join(', '), 'USDS');
    console.log('\n✅ Strategy: Round swap output DOWN to nearest safe amount');
    console.log('   Example: 5.3 USDS → round to 5 USDS');
    console.log('   (Extra USDS remains in wallet)\n');
  } else {
    console.log('❌ No safe amounts found in 1-20 range\n');
  }
}

testQuickRanges();
