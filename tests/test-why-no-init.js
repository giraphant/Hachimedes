/**
 * 核心问题：为什么官方不需要 init？
 * 测试不同还款金额下 SDK 的行为
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { getOperateIx } = require('@jup-ag/lend/borrow');
const BN = require('bn.js');

const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=3f46e620-a242-429f-9da9-07ca0df4030e';
const VAULT_ID = 34;
const POSITION_ID = 335;
const TEST_WALLET = new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');

async function testDifferentAmounts() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  Why Does Official NOT Need Init?');
  console.log('═══════════════════════════════════════════\n');

  const connection = new Connection(RPC_URL, 'confirmed');

  // 测试不同的还款金额
  const testAmounts = [
    { usds: 1, raw: 1_000_000, desc: '1 USDS (very small)' },
    { usds: 5, raw: 5_000_000, desc: '5 USDS (medium)' },
    { usds: 5.3, raw: 5_300_000, desc: '5.3 USDS (actual swap amount)' },
    { usds: 10, raw: 10_000_000, desc: '10 USDS (larger)' },
  ];

  for (const amount of testAmounts) {
    console.log(`\n━━━ Testing: ${amount.desc} ━━━`);

    try {
      const result = await getOperateIx({
        vaultId: VAULT_ID,
        positionId: POSITION_ID,
        colAmount: new BN(0),
        debtAmount: new BN(-amount.raw), // 负数 = 还款
        connection,
        signer: TEST_WALLET,
      });

      console.log(`Instructions: ${result.ixs.length}`);

      if (result.ixs.length === 1) {
        console.log('✅ NO INIT NEEDED!');
      } else {
        console.log(`⚠️  NEEDS INIT (${result.ixs.length - 1} init + 1 operate)`);

        // 分析 init 指令
        console.log('\nInit instructions:');
        for (let i = 0; i < result.ixs.length - 1; i++) {
          const ix = result.ixs[i];
          console.log(`  #${i + 1}: ${ix.keys.length} accounts, ${ix.data.length} bytes`);
        }
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`);
    }
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('  Key Question: What makes official different?');
  console.log('═══════════════════════════════════════════\n');
  console.log('Possible reasons:');
  console.log('1. Different amount → different tick → no init needed');
  console.log('2. Official uses different parameters (recipient, positionOwner, etc.)');
  console.log('3. Official uses a different SDK method entirely');
  console.log('4. Official pre-initialized accounts in a separate transaction');
  console.log('\nNext step: Try calling getOperateIx with ALL optional parameters set');
}

testDifferentAmounts();
