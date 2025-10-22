const { Connection, PublicKey } = require('@solana/web3.js');
const { getMint } = require('@solana/spl-token');

const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=3f46e620-a242-429f-9da9-07ca0df4030e';
const JLP_MINT = '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4';
const USDS_MINT = 'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA';

async function checkDecimals() {
  const connection = new Connection(RPC_URL, 'confirmed');

  console.log('Checking token decimals...\n');

  try {
    const jlpMint = await getMint(connection, new PublicKey(JLP_MINT));
    console.log('JLP Token:');
    console.log('  Mint:', JLP_MINT);
    console.log('  Decimals:', jlpMint.decimals);
    console.log('  Supply:', jlpMint.supply.toString());

    const usdsMint = await getMint(connection, new PublicKey(USDS_MINT));
    console.log('\nUSDS Token:');
    console.log('  Mint:', USDS_MINT);
    console.log('  Decimals:', usdsMint.decimals);
    console.log('  Supply:', usdsMint.supply.toString());
  } catch (error) {
    console.error('Error:', error);
  }
}

checkDecimals();
