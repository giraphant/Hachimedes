/**
 * 精确测试：找出不需要 init 的金额区间
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { getOperateIx } = require('@jup-ag/lend/borrow');
const BN = require('bn.js');

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';
const VAULT_ID = 34;
const POSITION_ID = 335;
const TEST_WALLET = new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');

// 延迟函数避免 RPC rate limit
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function testSafeRanges() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  Finding Safe Ranges (No Init Needed)');
  console.log('═══════════════════════════════════════════\n');

  const connection = new Connection(RPC_URL, 'confirmed');

  // 测试 0.1 到 20 USDS，步长 0.1
  const results = [];

  console.log('Testing amounts from 0.1 to 20 USDS (step 0.1)...\n');
  console.log('USDS Amount | Init Needed | Status');
  console.log('------------|-------------|-------');

  for (let usds = 0.1; usds <= 20; usds += 0.1) {
    const raw = Math.floor(usds * 1_000_000);

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
      const status = needsInit ? '❌ INIT' : '✅ OK';

      results.push({
        usds: usds.toFixed(1),
        needsInit,
        instructions: result.ixs.length
      });

      console.log(`${usds.toFixed(1).padStart(11)} | ${needsInit ? 'YES'.padStart(11) : 'NO'.padStart(11)} | ${status}`);

      // 延迟避免 rate limit
      await sleep(300);

    } catch (error) {
      console.log(`${usds.toFixed(1).padStart(11)} | ERROR       | ⚠️  ${error.message.substring(0, 30)}`);
      await sleep(500);
    }
  }

  // 分析结果
  console.log('\n═══════════════════════════════════════════');
  console.log('  Analysis: Safe Ranges');
  console.log('═══════════════════════════════════════════\n');

  const safeRanges = [];
  let rangeStart = null;
  let rangeEnd = null;

  for (let i = 0; i < results.length; i++) {
    const result = results[i];

    if (!result.needsInit) {
      // 开始新区间或继续现有区间
      if (rangeStart === null) {
        rangeStart = result.usds;
      }
      rangeEnd = result.usds;

      // 如果是最后一个或下一个需要 init，保存区间
      if (i === results.length - 1 || (i < results.length - 1 && results[i + 1].needsInit)) {
        safeRanges.push({ start: rangeStart, end: rangeEnd });
        rangeStart = null;
        rangeEnd = null;
      }
    }
  }

  console.log('Safe ranges (NO init needed):');
  if (safeRanges.length === 0) {
    console.log('  ⚠️  No safe ranges found!');
  } else {
    safeRanges.forEach((range, i) => {
      console.log(`  ${i + 1}. ${range.start} - ${range.end} USDS`);
    });
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('  Recommendation for Flash Loan');
  console.log('═══════════════════════════════════════════\n');

  if (safeRanges.length > 0) {
    const firstRange = safeRanges[0];
    console.log(`✅ Use amounts between ${firstRange.start} - ${firstRange.end} USDS`);
    console.log(`   to avoid init instructions.\n`);
    console.log(`   Example: If swap gives 5.3 USDS, round down to 5.0 USDS`);
    console.log(`   (0.3 USDS will remain in wallet)\n`);
  } else {
    console.log('❌ No safe ranges found. Must use 2-step transaction.');
  }
}

testSafeRanges();
