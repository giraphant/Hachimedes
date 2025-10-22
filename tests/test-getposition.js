/**
 * 测试获取仓位信息的 SDK 方法
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const lend = require('@jup-ag/lend/borrow');

const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=3f46e620-a242-429f-9da9-07ca0df4030e';
const VAULT_ID = 34;
const POSITION_ID = 335;
const TEST_WALLET = new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');

async function testGetPosition() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  Testing SDK getPosition Method');
  console.log('═══════════════════════════════════════════\n');

  const connection = new Connection(RPC_URL, 'confirmed');

  console.log('Available exports from @jup-ag/lend/borrow:');
  console.log(Object.keys(lend));
  console.log('');

  // 使用 getCurrentPosition
  if (lend.getCurrentPosition) {
    console.log('✅ getCurrentPosition method found\n');

    try {
      console.log('Fetching position account...');
      const position = await lend.getCurrentPosition({
        connection,
        vaultId: VAULT_ID,
        positionId: POSITION_ID,
        owner: TEST_WALLET,
      });

      console.log('\n✅ Position account received:');
      console.log('Full position object:');
      console.log(JSON.stringify(position, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      , 2));
      console.log('');
    } catch (error) {
      console.error('\n❌ Error fetching position:', error.message);
    }
  }

  // 使用 getCurrentPositionState
  if (lend.getCurrentPositionState) {
    console.log('✅ getCurrentPositionState method found\n');

    try {
      console.log('Fetching position state...');
      const state = await lend.getCurrentPositionState({
        connection,
        vaultId: VAULT_ID,
        positionId: POSITION_ID,
        owner: TEST_WALLET,
      });

      console.log('\n✅ Position state received:');
      console.log(JSON.stringify(state, null, 2));
    } catch (error) {
      console.error('\n❌ Error fetching position state:', error.message);
    }
  }
}

testGetPosition();
