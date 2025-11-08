const { Connection, PublicKey } = require('@solana/web3.js');

const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const ORACLE_ADDRESS = '25UZhqEoQeMA2ovbM1PgwZbU3NGUA8eM2y5g1j58YmFV';

async function parseOracleData() {
  const connection = new Connection(RPC_URL, 'confirmed');
  const oracleAccount = await connection.getAccountInfo(new PublicKey(ORACLE_ADDRESS));

  if (!oracleAccount) {
    console.log('Oracle account not found');
    return;
  }

  console.log('Oracle account size:', oracleAccount.data.length);
  console.log('Owner:', oracleAccount.owner.toString());
  console.log('\nRaw data (first 100 bytes):');
  console.log(oracleAccount.data.slice(0, 100));

  // Try to find price data at different offsets
  // Common patterns for price oracles:
  // - u64 at various offsets
  // - Usually scaled by 1e6, 1e8, or 1e9

  console.log('\n=== Trying different offsets as u64 ===');

  const offsets = [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120];

  for (const offset of offsets) {
    if (offset + 8 <= oracleAccount.data.length) {
      const value = oracleAccount.data.readBigUInt64LE(offset);

      // Try different scales
      const scales = [1, 1e6, 1e8, 1e9];
      for (const scale of scales) {
        const price = Number(value) / scale;

        // Expected price is around 5.27
        if (price >= 4 && price <= 7) {
          console.log(`\nPOTENTIAL MATCH at offset ${offset}, scale ${scale}:`);
          console.log(`  Raw value: ${value}`);
          console.log(`  Price: ${price.toFixed(6)}`);

          // Verify with LTV calculation
          // LTV = debt / (collateral * price) * 100
          // Expected: 12.72 / (3.68 * price) * 100 ≈ 65.61%
          const ltv = (12.72 / (3.68 * price)) * 100;
          console.log(`  Calculated LTV: ${ltv.toFixed(2)}%`);

          if (ltv >= 64 && ltv <= 67) {
            console.log('  ✓ LTV matches expected ~65.61%!');
          }
        }
      }
    }
  }

  console.log('\n=== Trying different offsets as u128 (two u64s) ===');

  for (const offset of offsets) {
    if (offset + 16 <= oracleAccount.data.length) {
      const low = oracleAccount.data.readBigUInt64LE(offset);
      const high = oracleAccount.data.readBigUInt64LE(offset + 8);
      const value = low + (high << 64n);

      const scales = [1, 1e6, 1e8, 1e9, 1e12, 1e18];
      for (const scale of scales) {
        const price = Number(value) / scale;

        if (price >= 4 && price <= 7) {
          console.log(`\nPOTENTIAL MATCH at offset ${offset}, scale ${scale}:`);
          console.log(`  Raw value: ${value}`);
          console.log(`  Price: ${price.toFixed(6)}`);

          const ltv = (12.72 / (3.68 * price)) * 100;
          console.log(`  Calculated LTV: ${ltv.toFixed(2)}%`);

          if (ltv >= 64 && ltv <= 67) {
            console.log('  ✓ LTV matches expected ~65.61%!');
          }
        }
      }
    }
  }
}

parseOracleData().catch(console.error);
