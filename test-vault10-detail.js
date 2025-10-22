const { Connection, PublicKey } = require('@solana/web3.js');
const { borrowPda } = require('@jup-ag/lend');

const RPC_URL = 'https://api.mainnet-beta.solana.com';

// Known tokens
const KNOWN_TOKENS = {
  JLP: '27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4',
  USDS: 'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

async function analyzeVault10() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const vaultId = 10;

  console.log(`\n=== Analyzing Vault ${vaultId} (JLP/USDG) ===\n`);

  const vaultConfigPda = borrowPda.getVaultConfig(vaultId);
  const configAccount = await connection.getAccountInfo(vaultConfigPda);

  if (!configAccount) {
    console.log('Vault config not found');
    return;
  }

  console.log(`Config PDA: ${vaultConfigPda.toString()}`);
  console.log(`Data length: ${configAccount.data.length} bytes\n`);

  // 查找 32 字节的 PublicKey (mint addresses)
  const data = configAccount.data;
  const foundMints = [];

  // Vault config 通常在固定偏移量处存储 mint addresses
  // 尝试常见的偏移量
  const offsets = [8, 40, 72, 104, 136]; // discriminator + potential mint positions

  for (const offset of offsets) {
    if (offset + 32 <= data.length) {
      try {
        const mintBytes = data.slice(offset, offset + 32);
        const mint = new PublicKey(mintBytes).toString();

        // 检查是否是已知代币
        let knownSymbol = null;
        for (const [symbol, knownMint] of Object.entries(KNOWN_TOKENS)) {
          if (mint === knownMint) {
            knownSymbol = symbol;
            break;
          }
        }

        if (knownSymbol) {
          console.log(`Offset ${offset}: ${mint} (${knownSymbol})`);
          foundMints.push({ offset, mint, symbol: knownSymbol });
        } else if (!foundMints.some(m => m.mint === mint)) {
          console.log(`Offset ${offset}: ${mint} (Unknown - possibly USDG?)`);
          foundMints.push({ offset, mint, symbol: 'Unknown' });
        }
      } catch (e) {
        // Invalid PublicKey, skip
      }
    }
  }

  console.log('\n=== Summary ===');
  console.log('Found mints:', foundMints.length);

  const unknownMints = foundMints.filter(m => m.symbol === 'Unknown');
  if (unknownMints.length > 0) {
    console.log('\n✓ Potential USDG mint address:');
    unknownMints.forEach(m => {
      console.log(`  ${m.mint}`);
    });
  }
}

analyzeVault10().catch(console.error);
