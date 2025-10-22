const { Connection, PublicKey } = require('@solana/web3.js');
const { borrowPda } = require('@jup-ag/lend');

const RPC_URL = 'https://api.mainnet-beta.solana.com';

const JLP_MINT = '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

async function compareVaults() {
  const connection = new Connection(RPC_URL, 'confirmed');

  console.log('Comparing Vault 8 (JLP/USDC) and Vault 10 (JLP/USDG)...\n');

  // Analyze Vault 8
  console.log('=== Vault 8 (JLP/USDC) ===');
  const vault8ConfigPda = borrowPda.getVaultConfig(8);
  const vault8Config = await connection.getAccountInfo(vault8ConfigPda);

  const vault8Hex = vault8Config.data.toString('hex');
  const jlpMintHex = Buffer.from(new PublicKey(JLP_MINT).toBytes()).toString('hex');
  const usdcMintHex = Buffer.from(new PublicKey(USDC_MINT).toBytes()).toString('hex');

  const jlpOffsetInVault8 = vault8Hex.indexOf(jlpMintHex) / 2;
  const usdcOffsetInVault8 = vault8Hex.indexOf(usdcMintHex) / 2;

  console.log(`JLP at offset: ${jlpOffsetInVault8}`);
  console.log(`USDC at offset: ${usdcOffsetInVault8}\n`);

  // Analyze Vault 10 using the same offsets
  console.log('=== Vault 10 (JLP/USDG) ===');
  const vault10ConfigPda = borrowPda.getVaultConfig(10);
  const vault10Config = await connection.getAccountInfo(vault10ConfigPda);

  // Extract mints at the same offsets
  const collateralMintBytes = vault10Config.data.slice(jlpOffsetInVault8, jlpOffsetInVault8 + 32);
  const debtMintBytes = vault10Config.data.slice(usdcOffsetInVault8, usdcOffsetInVault8 + 32);

  const collateralMint = new PublicKey(collateralMintBytes).toString();
  const debtMint = new PublicKey(debtMintBytes).toString();

  console.log(`Collateral mint (should be JLP): ${collateralMint}`);
  console.log(`Debt mint (should be USDG): ${debtMint}\n`);

  // Verify
  if (collateralMint === JLP_MINT) {
    console.log('✓ Collateral confirmed as JLP');
    console.log(`✓ USDG mint address: ${debtMint}`);
  } else {
    console.log('❌ Unexpected collateral mint');
  }
}

compareVaults().catch(console.error);
