/**
 * Test lib/position.ts fetchPositionInfo function
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { fetchPositionInfo } = require('./lib/position.ts');

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';
const VAULT_ID = 34;
const POSITION_ID = 335;
const TEST_WALLET = new PublicKey('9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM');

async function testPositionLib() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  Testing lib/position.ts');
  console.log('═══════════════════════════════════════════\n');

  const connection = new Connection(RPC_URL, 'confirmed');

  console.log('Calling fetchPositionInfo...');
  const positionInfo = await fetchPositionInfo(
    connection,
    VAULT_ID,
    POSITION_ID,
    TEST_WALLET
  );

  console.log('\n✅ Position info received:');
  console.log(JSON.stringify(positionInfo, null, 2));

  if (positionInfo) {
    console.log('\n═══ Formatted Display ═══');
    console.log(`Collateral (raw): ${positionInfo.collateralAmount}`);
    console.log(`Collateral (UI):  ${positionInfo.collateralAmountUi.toFixed(6)} JLP`);
    console.log(`Debt (raw):       ${positionInfo.debtAmount}`);
    console.log(`Debt (UI):        ${positionInfo.debtAmountUi.toFixed(6)} USDS`);
    if (positionInfo.ltv !== undefined) {
      console.log(`LTV:              ${positionInfo.ltv.toFixed(2)}%`);
    }
  }
}

testPositionLib();
