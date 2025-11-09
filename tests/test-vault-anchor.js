const { Connection, PublicKey } = require('@solana/web3.js');
const { Program, AnchorProvider } = require('@coral-xyz/anchor');
const { Wallet } = require('@coral-xyz/anchor/dist/cjs/provider');
const { Keypair } = require('@solana/web3.js');

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';
const VAULT_ADDRESS = '2TTGSRSezqFzeLUH8JwRUbtN66XLLaymfYsWRTMjfiMw';
const PROGRAM_ID = 'rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ';

async function parseVaultWithAnchor() {
  const connection = new Connection(RPC_URL, 'confirmed');

  // 创建一个临时钱包（不会使用）
  const wallet = new Wallet(Keypair.generate());
  const provider = new AnchorProvider(connection, wallet, {});

  // 从 SDK 获取 IDL
  const idl = require('@jup-ag/lend/borrow');

  console.log('Checking if SDK exports IDL...');
  console.log('Available exports:', Object.keys(idl).filter(k => k.includes('IDL') || k.includes('idl')));

  // 手动读取 vault 账户数据
  const vaultAccount = await connection.getAccountInfo(new PublicKey(VAULT_ADDRESS));

  if (!vaultAccount) {
    console.log('Vault account not found');
    return;
  }

  console.log('\n=== Vault Account Info ===');
  console.log('Size:', vaultAccount.data.length, 'bytes');
  console.log('Owner:', vaultAccount.owner.toString());

  // 手动解析：Anchor 账户通常有 8 字节的 discriminator
  console.log('\n=== First 8 bytes (discriminator) ===');
  const discriminator = vaultAccount.data.slice(0, 8);
  console.log('Hex:', discriminator.toString('hex'));

  // 剩余数据
  const data = vaultAccount.data.slice(8);
  console.log('\n=== Parsing data manually ===');
  console.log('Data length after discriminator:', data.length);

  // 基于 134 字节总长度，减去 8 字节 discriminator = 126 字节数据
  // 让我们尝试解析常见的字段

  let offset = 0;

  // 通常第一个字段是 vaultId (u16 = 2 bytes)
  const vaultId = data.readUInt16LE(offset);
  console.log(`\nVault ID (u16 at offset ${offset}):`, vaultId);
  offset += 2;

  // 可能有 padding
  // 然后可能是各种 PublicKey (32 bytes each)

  console.log('\n=== Searching for price field (u64 or u128) ===');

  const targetLtv = 65.61;
  const collateral = 3.68;
  const debt = 12.72;
  const expectedPrice = debt / (collateral * targetLtv / 100);
  console.log(`Expected price: ~${expectedPrice.toFixed(4)}`);

  // 从 discriminator 之后的数据中搜索价格
  for (let i = 0; i < data.length - 8; i++) {
    const value = data.readBigUInt64LE(i);
    if (value === 0n) continue;

    const scales = [1, 1e6, 1e8, 1e9, 1e12, 1e15];
    for (const scale of scales) {
      const price = Number(value) / scale;

      if (price >= 5.0 && price <= 5.5) {
        const calculatedLtv = (debt / (collateral * price)) * 100;
        const ltvDiff = Math.abs(calculatedLtv - targetLtv);

        if (ltvDiff < 2) {
          console.log(`\nPOTENTIAL MATCH:`);
          console.log(`  Offset from discriminator: ${i}`);
          console.log(`  Total offset: ${i + 8}`);
          console.log(`  Scale: ${scale}`);
          console.log(`  Raw value: ${value}`);
          console.log(`  Price: ${price.toFixed(8)}`);
          console.log(`  Calculated LTV: ${calculatedLtv.toFixed(2)}% (diff: ${ltvDiff.toFixed(2)}%)`);
          if (ltvDiff < 0.5) {
            console.log('  ✓✓✓ EXCELLENT MATCH!');
          }
        }
      }
    }
  }
}

parseVaultWithAnchor().catch(console.error);
