const { Connection, PublicKey } = require('@solana/web3.js');
const { getCurrentPositionState } = require('@jup-ag/lend/borrow');

const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=3f46e620-a242-429f-9da9-07ca0df4030e';
const VAULT_ID = 34;
const POSITION_ID = 335;
const TEST_WALLET = new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');

async function testPositionState() {
  const connection = new Connection(RPC_URL, 'confirmed');

  console.log('\nFetching position state...\n');

  try {
    const state = await getCurrentPositionState({
      connection,
      vaultId: VAULT_ID,
      positionId: POSITION_ID,
      positionOwner: TEST_WALLET,
    });

    console.log('Position state:');
    console.log(JSON.stringify(state, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    , 2));
  } catch (error) {
    console.error('Error:', error.message);
  }
}

testPositionState();
