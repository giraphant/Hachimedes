const { Connection, PublicKey } = require('@solana/web3.js');

const RPC_URL = 'https://mainnet.helius-rpc.com/?api-key=3f46e620-a242-429f-9da9-07ca0df4030e';
const VAULT_ADDRESS = '2TTGSRSezqFzeLUH8JwRUbtN66XLLaymfYsWRTMjfiMw';

async function parseVaultPrice() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const vaultAccount = await connection.getAccountInfo(new PublicKey(VAULT_ADDRESS));

  if (!vaultAccount) {
    console.log('Vault account not found');
    return;
  }

  console.log('Vault account size:', vaultAccount.data.length);
  console.log('Owner:', vaultAccount.owner.toString());

  // Print entire data in hex for analysis
  console.log('\n=== Full data in hex (grouped by 8 bytes) ===');
  for (let i = 0; i < vaultAccount.data.length; i += 8) {
    const chunk = vaultAccount.data.slice(i, i + 8);
    const hex = chunk.toString('hex');
    const value = i + 8 <= vaultAccount.data.length ?
      vaultAccount.data.readBigUInt64LE(i) : 'N/A';
    console.log(`Offset ${i.toString().padStart(3, '0')}: ${hex.padEnd(20, ' ')} | u64: ${value}`);
  }

  console.log('\n=== Searching for price around 5.31 ===');

  const targetLtv = 65.61;
  const collateral = 3.68;
  const debt = 12.72;
  // Expected price: debt / (collateral * ltv/100) = 12.72 / (3.68 * 0.6561) = ~5.27
  const expectedPrice = debt / (collateral * targetLtv / 100);
  console.log(`Expected JLP price: ~${expectedPrice.toFixed(4)}`);

  let foundMatches = [];

  for (let offset = 0; offset < vaultAccount.data.length - 8; offset++) {
    const value = vaultAccount.data.readBigUInt64LE(offset);

    // Skip zero values
    if (value === 0n) continue;

    // Try multiple scales
    const scales = [1, 1e3, 1e6, 1e8, 1e9, 1e12, 1e15, 1e18];
    for (const scale of scales) {
      const price = Number(value) / scale;

      // Look for prices around 5.31 (range 5.0 - 5.5)
      if (price >= 5.0 && price <= 5.5) {
        const calculatedLtv = (debt / (collateral * price)) * 100;

        // Check if LTV is close to expected
        const ltvDiff = Math.abs(calculatedLtv - targetLtv);
        if (ltvDiff < 3) { // Within 3% of expected
          foundMatches.push({
            offset,
            scale,
            value: value.toString(),
            price: price.toFixed(8),
            ltv: calculatedLtv.toFixed(2),
            ltvDiff: ltvDiff.toFixed(2),
          });
        }
      }
    }
  }

  if (foundMatches.length > 0) {
    console.log('\n=== POTENTIAL MATCHES ===');
    foundMatches.sort((a, b) => parseFloat(a.ltvDiff) - parseFloat(b.ltvDiff));
    for (const match of foundMatches) {
      console.log(`\nOffset: ${match.offset}, Scale: ${match.scale}`);
      console.log(`  Raw value: ${match.value}`);
      console.log(`  Price: ${match.price} USDS/JLP`);
      console.log(`  Calculated LTV: ${match.ltv}% (diff: ${match.ltvDiff}%)`);
      if (parseFloat(match.ltvDiff) < 0.5) {
        console.log('  ✓✓✓ EXCELLENT MATCH!');
      } else if (parseFloat(match.ltvDiff) < 1) {
        console.log('  ✓✓ VERY CLOSE MATCH!');
      }
    }
  } else {
    console.log('\nNo matches found in expected range');
  }
}

parseVaultPrice().catch(console.error);
