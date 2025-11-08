const { Connection, PublicKey } = require('@solana/web3.js');

const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const VAULT_ADDRESS = '2TTGSRSezqFzeLUH8JwRUbtN66XLLaymfYsWRTMjfiMw';

async function parseVaultManually() {
  const connection = new Connection(RPC_URL, 'confirmed');

  const vaultAccount = await connection.getAccountInfo(new PublicKey(VAULT_ADDRESS));

  if (!vaultAccount) {
    console.log('Vault account not found');
    return;
  }

  console.log('=== Vault Account Info ===');
  console.log('Size:', vaultAccount.data.length, 'bytes');
  console.log('Owner:', vaultAccount.owner.toString());

  // Anchor 账户通常有 8 字节的 discriminator
  console.log('\n=== First 8 bytes (discriminator) ===');
  const discriminator = vaultAccount.data.slice(0, 8);
  console.log('Hex:', discriminator.toString('hex'));

  // 剩余数据
  const data = vaultAccount.data.slice(8);
  console.log('\n=== Data after discriminator ===');
  console.log('Length:', data.length, 'bytes');

  // 解析第一个字段（可能是 vaultId）
  if (data.length >= 2) {
    const vaultId = data.readUInt16LE(0);
    console.log('Vault ID (u16 at offset 0):', vaultId);
  }

  const targetLtv = 65.61;
  const collateral = 3.68;
  const debt = 12.72;
  const expectedPrice = debt / (collateral * targetLtv / 100);
  console.log(`\n=== Expected price: ~${expectedPrice.toFixed(4)} ===\n`);

  console.log('Searching for price in vault data...\n');

  let matches = [];

  // 从 discriminator 之后的数据中搜索价格
  for (let i = 0; i < data.length - 8; i++) {
    try {
      const value = data.readBigUInt64LE(i);
      if (value === 0n) continue;

      const scales = [1, 1e6, 1e8, 1e9, 1e12, 1e15, 1e18];
      for (const scale of scales) {
        const price = Number(value) / scale;

        // 寻找 5.0 - 5.5 之间的价格
        if (price >= 5.0 && price <= 5.5) {
          const calculatedLtv = (debt / (collateral * price)) * 100;
          const ltvDiff = Math.abs(calculatedLtv - targetLtv);

          if (ltvDiff < 2) {
            matches.push({
              offsetFromDiscriminator: i,
              totalOffset: i + 8,
              scale,
              rawValue: value.toString(),
              price: price.toFixed(8),
              ltv: calculatedLtv.toFixed(2),
              ltvDiff: ltvDiff.toFixed(2),
            });
          }
        }
      }
    } catch (e) {
      // Skip if reading fails
    }
  }

  if (matches.length > 0) {
    console.log('=== FOUND MATCHES ===\n');
    matches.sort((a, b) => parseFloat(a.ltvDiff) - parseFloat(b.ltvDiff));

    for (const match of matches) {
      console.log(`Offset from discriminator: ${match.offsetFromDiscriminator}`);
      console.log(`Total offset: ${match.totalOffset}`);
      console.log(`Scale: ${match.scale}`);
      console.log(`Raw value: ${match.rawValue}`);
      console.log(`Price: ${match.price} USDS/JLP`);
      console.log(`Calculated LTV: ${match.ltv}% (diff from expected: ${match.ltvDiff}%)`);
      if (parseFloat(match.ltvDiff) < 0.5) {
        console.log('✓✓✓ EXCELLENT MATCH!');
      } else if (parseFloat(match.ltvDiff) < 1) {
        console.log('✓✓ VERY CLOSE!');
      }
      console.log('');
    }
  } else {
    console.log('No matches found.');
  }

  // 同时打印完整数据以供手动检查
  console.log('\n=== Full data (hex, grouped by 8 bytes) ===');
  for (let i = 0; i < data.length; i += 8) {
    const chunk = data.slice(i, i + 8);
    const hex = chunk.toString('hex');
    const value = i + 8 <= data.length ? data.readBigUInt64LE(i) : 'N/A';
    console.log(`Offset ${i.toString().padStart(3, '0')}: ${hex.padEnd(20, ' ')} | u64: ${value}`);
  }
}

parseVaultManually().catch(console.error);
